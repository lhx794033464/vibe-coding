import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { dbGetCustomers, dbCreateCustomer, dbUpdateCustomer } from '@/services/dbService';
import { getTencentDocsToken } from '@/lib/tencentDocsConfig';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 文档 file_id（从用户提供的URL提取）
const DOC_FILE_ID = 'DTUZjZ3Jmc0JKdXF3';
// 实施交付汇总表 sheet_id（从URL tab参数获取）
const SHEET_ID = 'rafiwj';

// 列索引（0-based）
const COL_IS_ONLINE = 0;       // A: 是否上线
const COL_APPLY_YEAR = 1;      // B: 申请年
const COL_APPLY_MONTH = 2;     // C: 申请月
const COL_DELIVERER = 3;       // D: 交付人
const COL_CUSTOMER = 4;        // E: 客户
const COL_IMPL_TYPE = 5;       // F: 实施类型
const COL_SALESPERSON = 6;     // G: 业务员
const COL_EXPIRY_DATE = 7;     // H: 到期日（已废弃，不再同步）
const COL_SALES_ORDER = 8;     // I: 销售订单
const COL_IMPL_ORDER = 9;      // J: 实施订单号
const COL_IMPL_PRICE = 10;     // K: 实施成交价
const COL_PURCHASE_DAYS = 11;  // L: 购买人天
// 12: 上门人天（不需要）
// 13: 预计转交日（不需要）
// 14: 模块类型（不需要）
const COL_MODULE = 15;         // P: 购买模块
const COL_VERSION = 16;        // Q: 版本
const COL_PROJECT_NOTES = 22;  // W: 项目备注
const COL_IS_ACCEPTED = 24;    // Y: 是否验收

const READ_START_COL = 0;      // 从A列开始
const READ_END_COL = 25;       // 读到Y列



// 解析CSV行（处理引号内的逗号）
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// 将腾讯文档 A 列原始值映射为标准上线状态
function mapOnlineStatus(rawValue: string): string {
  const v = (rawValue || '').trim();
  // 已上线的值
  if (v === '是' || v === '已上线' || v === 'online' || v.toLowerCase() === 'yes' || v === '1') {
    return 'online';
  }
  // 延期上线
  if (v === '延期上线' || v === '延期') {
    return '延期上线';
  }
  // 未上线的值（否、未上线、空值等）
  return 'not_online';
}

// 将腾讯文档"是否验收"列原始值映射为标准验收状态
function mapAcceptanceStatus(rawValue: string): string {
  const v = (rawValue || '').trim();
  // 已验收的值
  if (v === '是' || v === '已验收' || v === 'accepted' || v.toLowerCase() === 'yes' || v === '1') {
    return 'accepted';
  }
  // 未验收（否、未验收、空值等）
  return 'not_accepted';
}

// 从一行CSV数据中提取客户信息（字段名映射到数据库列名）
function extractCustomerFromRow(cols: string[]) {
  return {
    status: mapOnlineStatus(cols[COL_IS_ONLINE] || ''),    // 是否上线 → 标准上线状态
    opened_at: cols[COL_APPLY_MONTH] || '',      // 申请月 → 开通时间
    customerName: cols[COL_CUSTOMER] || '',
    implementation_type: cols[COL_IMPL_TYPE] || '',  // 实施类型
    salesperson: cols[COL_SALESPERSON] || '',        // 业务员
    expiry_date: '',  // 已废弃，保留空值
    sales_order_no: cols[COL_SALES_ORDER] || '',     // 销售订单
    implementation_order_no: cols[COL_IMPL_ORDER] || '', // 实施订单号
    implementation_fee: cols[COL_IMPL_PRICE] || '',  // 实施成交价 → 实施费
    implementation_days: cols[COL_PURCHASE_DAYS] || '', // 购买人天
    modules: cols[COL_MODULE] || '',                 // 购买模块
    version: cols[COL_VERSION] || '',                // 版本
    deliverer: cols[COL_DELIVERER] || '',
    industry: cols[COL_PROJECT_NOTES] || '',          // 项目备注 → industry字段
    acceptance_status: mapAcceptanceStatus(cols[COL_IS_ACCEPTED] || ''),  // 是否验收 → 验收状态
  };
}

// GET: 从腾讯文档获取客户信息
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const token = await getTencentDocsToken(request);
    const client = new TencentDocsClient(token);

    // 一次性读取全量数据
    const result = await client.getSheetCellData({
      fileId: DOC_FILE_ID,
      sheetId: SHEET_ID,
      startRow: 0,
      endRow: 10000,
      startCol: READ_START_COL,
      endCol: READ_END_COL,
      returnCsv: true,
    });

    const csvData = result.csv_data || '';
    const allRows = csvData.split('\n').filter((line: string) => line.trim());

    if (allRows.length === 0) {
      return NextResponse.json({ success: true, total: 0, myCount: 0, uniqueCount: 0, data: [] });
    }

    // 过滤匹配当前用户名的行（管理员获取所有用户的行）
    const username = userInfo.username;
    const isAdmin = userInfo.role === 'admin';

    // 获取在职用户列表，用于过滤
    const supabase = getSupabaseClient();
    const { data: activeUsers } = await supabase
      .from('users')
      .select('username, employment_status, role')
      .eq('is_active', true);
    const activeUsernameSet = new Set<string>();
    const activeEmploymentMap: Record<string, string> = {};
    (activeUsers || []).forEach((u: any) => {
      activeUsernameSet.add(u.username);
      activeEmploymentMap[u.username] = u.employment_status || '在职';
    });

    const myRecords: ReturnType<typeof extractCustomerFromRow>[] = [];

    for (let i = 1; i < allRows.length; i++) {
      const cols = parseCsvLine(allRows[i]);
      const deliverer = cols[COL_DELIVERER] || '';
      const customerName = cols[COL_CUSTOMER] || '';

      // 普通用户：跳过交付人不在用户管理中的客户、离职人员的客户
      if (!isAdmin) {
        if (deliverer && !activeUsernameSet.has(deliverer)) continue;
        if (deliverer && activeEmploymentMap[deliverer] === '离职') continue;
      }

      // 管理员获取所有客户（含离职交付顾问的），普通用户仅获取自己的
      if (customerName && (isAdmin || deliverer === username)) {
        myRecords.push(extractCustomerFromRow(cols));
      }
    }

    // 去重：同一客户名+同一交付人只保留一条（合并购买模块）
    // 不同交付人的同名客户各自独立保留（同一客户可能由不同交付人负责不同模块）
    const customerMap = new Map<string, ReturnType<typeof extractCustomerFromRow> & { modulesList: string[] }>();
    for (const r of myRecords) {
      const dedupKey = `${r.customerName}|||${r.deliverer}`;
      if (customerMap.has(dedupKey)) {
        const existing = customerMap.get(dedupKey)!;
        if (r.modules && !existing.modulesList.includes(r.modules)) {
          existing.modulesList.push(r.modules);
        }
      } else {
        customerMap.set(dedupKey, { ...r, modulesList: r.modules ? [r.modules] : [] });
      }
    }

    return NextResponse.json({
      success: true,
      total: allRows.length - 1,
      myCount: myRecords.length,
      uniqueCount: customerMap.size,
      data: Array.from(customerMap.values()).map(r => ({
        customerName: r.customerName,
        status: r.status,                              // 是否上线 → 客户状态
        applyMonth: r.opened_at,                       // 申请月 → 开通时间（前端驼峰）
        implementationType: r.implementation_type,     // 实施类型
        salesperson: r.salesperson,                    // 业务员
        expiryDate: '',                             // 到期日（已废弃）
        salesOrder: r.sales_order_no,                  // 销售订单
        implementationOrder: r.implementation_order_no,// 实施订单号
        implementationPrice: r.implementation_fee,     // 实施成交价 → 实施费（前端驼峰）
        implementationDays: r.implementation_days,     // 购买人天
        modules: r.modulesList.join('、'),
        version: r.version,
        deliverer: r.deliverer,
        projectNotes: r.industry,                              // 项目备注 → industry字段
        acceptanceStatus: r.acceptance_status,                 // 是否验收 → 验收状态
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('获取腾讯文档客户信息失败:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: 批量导入获取到的客户信息到系统
export async function POST(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { customers } = body as {
      customers?: Record<string, string>[];
    };

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return NextResponse.json({ error: '客户数据不能为空' }, { status: 400 });
    }

    // 获取已有客户列表，用于判断新增还是覆盖
    const userId = userInfo.id;
    const isAdmin = userInfo.role === 'admin';
    const existingCustomers = await dbGetCustomers({ userId, isAdmin });
    // 管理员同步时，同名客户可能存在于不同顾问账号下，需要按 name -> customer[] 组织
    // 以便根据交付顾问精确匹配
    const existingByName = new Map<string, typeof existingCustomers>();
    for (const c of existingCustomers) {
      const list = existingByName.get(c.name) || [];
      list.push(c);
      existingByName.set(c.name, list);
    }

    // 管理员同步时，根据交付顾问查找对应的 user_id
    const supabase = getSupabaseClient();
    const userMap = new Map<string, string>(); // username -> user_id
    if (isAdmin) {
      const { data: users } = await supabase.from('users').select('id, username');
      if (users) {
        for (const u of users) {
          userMap.set(u.username, u.id);
        }
      }
    }

    // 根据交付顾问名称获取对应的 user_id
    const getDelivererUserId = (delivererName: string | undefined): string | null => {
      if (!isAdmin || !delivererName) return null;
      return userMap.get(delivererName) || null;
    };

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const customer of customers) {
      try {
        const customerName = customer.customerName || '';
        if (!customerName) {
          continue;
        }

        // 构建客户数据：只包含有值的字段，空值不覆盖已有数据
        const customerData: Record<string, any> = {};
        const setIfValue = (key: string, value: any) => {
          if (value !== null && value !== undefined && value !== '') {
            customerData[key] = value;
          }
        };

        setIfValue('name', customerName);
        setIfValue('status', mapOnlineStatus(customer.status || ''));                // 标准化上线状态
        setIfValue('opened_at', customer.opened_at || customer.applyMonth);          // 申请月 → 开通时间
        setIfValue('delivery_consultant', customer.deliverer || userInfo.username);
        setIfValue('modules', customer.modules ? customer.modules.split('、') : null);
        setIfValue('version', customer.version);
        setIfValue('sales_order_no', customer.sales_order_no || customer.salesOrder);
        setIfValue('implementation_order_no', customer.implementation_order_no || customer.implementationOrder);
        const feeVal = customer.implementation_fee || customer.implementationPrice;
        setIfValue('implementation_fee', feeVal ? parseFloat(String(feeVal)) : null);
        const daysVal = customer.implementation_days || customer.implementationDays;
        setIfValue('implementation_days', daysVal ? parseFloat(String(daysVal)) : null);
        setIfValue('implementation_type', customer.implementation_type || customer.implementationType);
        setIfValue('salesperson', customer.salesperson);
        setIfValue('industry', customer.projectNotes || customer.industry);
        setIfValue('acceptance_status', mapAcceptanceStatus(customer.acceptanceStatus || customer.acceptance_status));

        // 至少需要有客户名称
        if (!customerData.name) {
          continue;
        }

        // 管理员同步时：计算该客户应归属的 user_id
        const delivererName = customer.deliverer || customer.delivery_consultant;
        const targetUserId = getDelivererUserId(delivererName);

        // 在已有客户中查找匹配记录
        // 管理员同步：必须精确匹配同名+同顾问，不跨顾问复用记录
        // 普通用户同步：同名即可匹配（因为只有自己的客户）
        const candidates = existingByName.get(customerName);
        let existing: typeof existingCustomers[0] | undefined;
        if (candidates && candidates.length > 0) {
          if (isAdmin && targetUserId) {
            // 管理员同步：精确匹配同名+同顾问的记录
            existing = candidates.find(c => c.user_id === targetUserId);
          } else {
            // 普通用户同步：取同名第一条
            existing = candidates[0];
          }
        }

        if (existing) {
          // 应用内已验收的客户：同步时保留验收状态（不覆盖），但允许更新其他字段
          if (existing.acceptance_source === 'app' && existing.acceptance_status === 'accepted') {
            delete customerData.acceptance_status;
          }
          // 已计提或部分计提的客户不同步，仅同步未计提的客户
          if (existing.commission_status === '已计提' || existing.commission_status === '部分计提') {
            continue;
          }
          await dbUpdateCustomer(existing.id, customerData);
          updated++;
        } else {
          // 新建客户：自动计算交付期截止日 = 开通日期 + 120天
          if (customerData.opened_at) {
            const openedDate = new Date(customerData.opened_at);
            if (!isNaN(openedDate.getTime())) {
              openedDate.setDate(openedDate.getDate() + 120);
              customerData.delivery_deadline = openedDate.toISOString().split('T')[0];
            }
          }
          // 管理员同步时，按交付顾问分配 user_id；普通用户使用自己的 id
          if (targetUserId) {
            customerData.user_id = targetUserId;
          } else {
            customerData.user_id = userId;
          }
          await dbCreateCustomer(customerData);
          imported++;
        }
      } catch (e) {
        errors.push(`导入 ${customer.customerName} 失败: ${e instanceof Error ? e.message : '未知错误'}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('导入腾讯文档客户信息失败:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
