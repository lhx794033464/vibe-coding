import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { dbGetCustomers, dbCreateCustomer } from '@/services/dbService';
import { readFile } from 'fs/promises';
import path from 'path';

const CONFIG_FILE = path.join('/tmp', 'tencent_docs_config.json');

// 文档 file_id（从用户提供的URL提取）
const DOC_FILE_ID = 'DTUZjZ3Jmc0JKdXF3';

async function getToken(): Promise<string> {
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);
    if (config.token) return config.token;
  } catch {}
  throw new Error('未配置腾讯文档 Token');
}

// 解析实施交付汇总表的 Markdown 表格
function parseDeliveryTable(content: string): { customerName: string; modules: string; deliverer: string }[] {
  const lines = content.split('\n');
  const results: { customerName: string; modules: string; deliverer: string }[] = [];

  // 找到实施交付汇总表
  let tableStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('实施交付汇总表')) {
      tableStartIdx = i;
      break;
    }
  }

  if (tableStartIdx === -1) return results;

  // 解析表头获取列索引
  const headerLine = lines[tableStartIdx + 1];
  if (!headerLine) return results;

  const headerCols = headerLine.split('|');
  const colIndex: Record<string, number> = {};
  headerCols.forEach((col, idx) => {
    const name = col.trim();
    if (name) colIndex[name] = idx;
  });

  const delivererIdx = colIndex['交付人'];
  const customerIdx = colIndex['客户'];
  const moduleIdx = colIndex['购买模块'];

  if (delivererIdx === undefined || customerIdx === undefined || moduleIdx === undefined) {
    return results;
  }

  // 跳过表头和分隔行，解析数据行
  for (let i = tableStartIdx + 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break; // 表格结束

    const cols = line.split('|');
    const deliverer = (cols[delivererIdx] || '').trim();
    const customerName = (cols[customerIdx] || '').trim();
    const modules = (cols[moduleIdx] || '').trim();

    if (deliverer && customerName) {
      results.push({ customerName, modules, deliverer });
    }
  }

  return results;
}

// GET: 从腾讯文档获取客户信息（只获取客户名称+购买模块）
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    // 支持从 query 参数传入 token，或从配置文件读取
    const { searchParams } = new URL(request.url);
    const tokenFromQuery = searchParams.get('token');
    const token = tokenFromQuery || await getToken();

    const client = new TencentDocsClient(token);

    // 获取文档内容
    const contentResult = await client.getContent(DOC_FILE_ID);
    const content = (contentResult as { content: string }).content;

    // 解析实施交付汇总表
    const allRecords = parseDeliveryTable(content);

    // 按当前用户名匹配D列（交付人），所有用户统一按此规则过滤
    const username = userInfo.username;
    const myRecords = allRecords.filter(r => r.deliverer === username);

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
      total: allRecords.length,
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
