import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { dbGetCustomers, dbCreateCustomer, dbUpdateCustomer } from '@/services/dbService';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabaseClient, getSupabaseServiceRoleKey } from '@/storage/database/supabase-client';

const CONFIG_FILE = path.join('/tmp', 'tencent_docs_config.json');

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
const COL_EXPIRY_DATE = 7;     // H: 到期日
const COL_SALES_ORDER = 8;     // I: 销售订单
const COL_IMPL_ORDER = 9;      // J: 实施订单号
const COL_IMPL_PRICE = 10;     // K: 实施成交价
const COL_PURCHASE_DAYS = 11;  // L: 购买人天
// 12: 上门人天（不需要）
// 13: 预计转交日（不需要）
// 14: 模块类型（不需要）
const COL_MODULE = 15;         // P: 购买模块
const COL_VERSION = 16;        // Q: 版本

const READ_START_COL = 0;      // 从A列开始
const READ_END_COL = 17;       // 读到Q列

async function getToken(request?: NextRequest): Promise<string> {
  // 1. 从 URL 参数获取
  if (request) {
    const urlToken = request.nextUrl.searchParams.get('token');
    if (urlToken) return urlToken;
  }
  // 2. 从数据库 system_config 读取
  try {
    const supabase = getSupabaseClient(getSupabaseServiceRoleKey());
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'tencent_docs_token')
      .single();
    if (data?.value) return data.value;
  } catch {}
  // 3. 从本地配置文件读取
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);
    if (config.token) return config.token;
  } catch {}
  throw new Error('未配置腾讯文档 Token，请在系统配置中设置');
}

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

// 从一行CSV数据中提取客户信息（字段名映射到数据库列名）
function extractCustomerFromRow(cols: string[]) {
  return {
    status: cols[COL_IS_ONLINE] || '',           // 是否上线 → 客户状态
    opened_at: cols[COL_APPLY_MONTH] || '',      // 申请月 → 开通时间
    customerName: cols[COL_CUSTOMER] || '',
    implementation_type: cols[COL_IMPL_TYPE] || '',  // 实施类型
    salesperson: cols[COL_SALESPERSON] || '',        // 业务员
    expiry_date: cols[COL_EXPIRY_DATE] || '',        // 到期日
    sales_order_no: cols[COL_SALES_ORDER] || '',     // 销售订单
    implementation_order_no: cols[COL_IMPL_ORDER] || '', // 实施订单号
    implementation_fee: cols[COL_IMPL_PRICE] || '',  // 实施成交价 → 实施费
    implementation_days: cols[COL_PURCHASE_DAYS] || '', // 购买人天
    modules: cols[COL_MODULE] || '',                 // 购买模块
    version: cols[COL_VERSION] || '',                // 版本
    deliverer: cols[COL_DELIVERER] || '',
  };
}

// GET: 从腾讯文档获取客户信息
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const token = await getToken(request);
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

    // 过滤匹配当前用户名的行
    const username = userInfo.username;
    const myRecords: ReturnType<typeof extractCustomerFromRow>[] = [];

    for (let i = 1; i < allRows.length; i++) {
      const cols = parseCsvLine(allRows[i]);
      const deliverer = cols[COL_DELIVERER] || '';
      const customerName = cols[COL_CUSTOMER] || '';

      if (deliverer === username && customerName) {
        myRecords.push(extractCustomerFromRow(cols));
      }
    }

    // 去重：同一客户名只保留一条（合并购买模块）
    const customerMap = new Map<string, ReturnType<typeof extractCustomerFromRow> & { modulesList: string[] }>();
    for (const r of myRecords) {
      if (customerMap.has(r.customerName)) {
        const existing = customerMap.get(r.customerName)!;
        if (r.modules && !existing.modulesList.includes(r.modules)) {
          existing.modulesList.push(r.modules);
        }
      } else {
        customerMap.set(r.customerName, { ...r, modulesList: r.modules ? [r.modules] : [] });
      }
    }

    return NextResponse.json({
      success: true,
      total: allRows.length - 1,
      myCount: myRecords.length,
      uniqueCount: customerMap.size,
      data: Array.from(customerMap.values()).map(r => ({
        customerName: r.customerName,
        status: r.status,                            // 是否上线 → 客户状态
        opened_at: r.opened_at,                      // 申请月 → 开通时间
        implementation_type: r.implementation_type,  // 实施类型
        salesperson: r.salesperson,                  // 业务员
        expiry_date: r.expiry_date,                  // 到期日
        sales_order_no: r.sales_order_no,            // 销售订单
        implementation_order_no: r.implementation_order_no, // 实施订单号
        implementation_fee: r.implementation_fee,    // 实施成交价 → 实施费
        implementation_days: r.implementation_days,  // 购买人天
        modules: r.modulesList.join('、'),
        version: r.version,
        deliverer: r.deliverer,
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
    const existingMap = new Map(existingCustomers.map(c => [c.name, c]));

    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const customer of customers) {
      try {
        const customerName = customer.customerName || '';
        if (!customerName) {
          continue;
        }

        const customerData: Record<string, any> = {
          name: customerName,
          status: customer.status || '',                        // 是否上线 → 客户状态
          opened_at: customer.opened_at || null,               // 申请月 → 开通时间
          delivery_consultant: customer.deliverer || userInfo.username,
          modules: customer.modules ? customer.modules.split('、') : [],
          version: customer.version || null,
          sales_order_no: customer.sales_order_no || null,
          implementation_order_no: customer.implementation_order_no || null,
          implementation_fee: customer.implementation_fee ? parseFloat(customer.implementation_fee) : null,  // 实施成交价 → 实施费
          implementation_days: customer.implementation_days ? parseFloat(customer.implementation_days) : null,
          implementation_type: customer.implementation_type || null,   // 实施类型
          salesperson: customer.salesperson || null,                   // 业务员
          expiry_date: customer.expiry_date || null,                   // 到期日
        };

        // 检查是否已存在：存在则覆盖更新，不存在则新增
        const existing = existingMap.get(customerName);
        if (existing) {
          await dbUpdateCustomer(existing.id, customerData);
          updated++;
        } else {
          customerData.user_id = userId;
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
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('导入腾讯文档客户信息失败:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
