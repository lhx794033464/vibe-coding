import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { dbGetCustomers, dbCreateCustomer } from '@/services/dbService';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabaseClient, getSupabaseServiceRoleKey } from '@/storage/database/supabase-client';

const CONFIG_FILE = path.join('/tmp', 'tencent_docs_config.json');

// 文档 file_id（从用户提供的URL提取）
const DOC_FILE_ID = 'DTUZjZ3Jmc0JKdXF3';
// 实施交付汇总表 sheet_id（从URL tab参数获取）
const SHEET_ID = 'rafiwj';

// 关键列索引（0-based）：D=3交付人，E=4客户，P=15购买模块
const COL_DELIVERER = 3;
const COL_CUSTOMER = 4;
const COL_MODULE = 15;
const COL_END = 16; // 读取到P列

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

// GET: 从腾讯文档获取客户信息（分批读取全量数据）
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const token = await getToken(request);

    const client = new TencentDocsClient(token);

    // 一次性读取全量数据（sheet.get_cell_data 支持大范围读取）
    const result = await client.getSheetCellData({
      fileId: DOC_FILE_ID,
      sheetId: SHEET_ID,
      startRow: 0,
      endRow: 10000, // 足够覆盖5000+行
      startCol: COL_DELIVERER,
      endCol: COL_END,
      returnCsv: true,
    });

    const csvData = result.csv_data || '';
    const allRows = csvData.split('\n').filter((line: string) => line.trim());

    // 解析表头确认列顺序
    if (allRows.length === 0) {
      return NextResponse.json({ success: true, total: 0, myCount: 0, uniqueCount: 0, data: [] });
    }

    const headerCols = parseCsvLine(allRows[0]);

    // 过滤匹配当前用户名的行
    // 列顺序（从D列开始）：交付人(0), 客户(1), ..., 购买模块(12), 版本(13)
    const MODULE_COL_IDX = 12; // 购买模块列

    // 过滤匹配当前用户名的行
    const username = userInfo.username;
    const myRecords: { customerName: string; modules: string; deliverer: string }[] = [];

    for (let i = 1; i < allRows.length; i++) {
      const cols = parseCsvLine(allRows[i]);
      const deliverer = cols[0] || ''; // D列：交付人
      const customerName = cols[1] || ''; // E列：客户
      const modules = cols[MODULE_COL_IDX] || ''; // P列：购买模块

      if (deliverer === username && customerName) {
        myRecords.push({ customerName, modules, deliverer });
      }
    }

    // 去重：同一客户名只保留一条（合并购买模块）
    const customerMap = new Map<string, { customerName: string; modules: string[]; deliverer: string }>();
    for (const r of myRecords) {
      if (customerMap.has(r.customerName)) {
        const existing = customerMap.get(r.customerName)!;
        if (r.modules && !existing.modules.includes(r.modules)) {
          existing.modules.push(r.modules);
        }
      } else {
        customerMap.set(r.customerName, {
          customerName: r.customerName,
          modules: r.modules ? [r.modules] : [],
          deliverer: r.deliverer,
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: allRows.length - 1, // 减去表头
      myCount: myRecords.length,
      uniqueCount: customerMap.size,
      data: Array.from(customerMap.values()).map(r => ({
        customerName: r.customerName,
        modules: r.modules.join('、'),
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
    const { customers, token: tokenFromBody } = body as {
      customers?: { customerName: string; modules: string; deliverer?: string }[];
      token?: string;
    };

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return NextResponse.json({ error: '客户数据不能为空' }, { status: 400 });
    }

    // 获取已有客户列表，避免重复
    const userId = userInfo.id;
    const isAdmin = userInfo.role === 'admin';
    const existingCustomers = await dbGetCustomers({ userId, isAdmin });
    const existingNames = new Set(existingCustomers.map(c => c.name));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const customer of customers) {
      try {
        if (!customer.customerName) {
          skipped++;
          continue;
        }

        // 检查是否已存在
        if (existingNames.has(customer.customerName)) {
          skipped++;
          continue;
        }

        await dbCreateCustomer({
          name: customer.customerName,
          status: 'not_online',
          delivery_consultant: customer.deliverer || userInfo.username,
          modules: customer.modules ? customer.modules.split('、') : [],
          user_id: userId,
        });

        existingNames.add(customer.customerName); // 防止本次批量重复
        imported++;
      } catch (e) {
        errors.push(`导入 ${customer.customerName} 失败: ${e instanceof Error ? e.message : '未知错误'}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('导入腾讯文档客户信息失败:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
