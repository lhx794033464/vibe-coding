import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { dbGetCustomers, dbCreateCustomer, dbUpdateCustomer, dbCreateFollowUp, dbCreateImplementationLog } from '@/services/dbService';
import { getTencentDocsToken } from '@/lib/tencentDocsConfig';

async function getClient(request?: NextRequest): Promise<TencentDocsClient> {
  const token = await getTencentDocsToken(request);
  return new TencentDocsClient(token);
}

// POST: 从腾讯文档导入数据到系统
export async function POST(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      file_id,
      sheet_id,
      target, // 'customers' | 'follow_ups' | 'implementation_logs'
      field_mapping, // { 源字段名: 目标字段名 }
      import_mode = 'create', // 'create' | 'update'
    } = body;

    if (!file_id) {
      return NextResponse.json({ error: 'file_id 不能为空' }, { status: 400 });
    }
    if (!target) {
      return NextResponse.json({ error: '导入目标不能为空' }, { status: 400 });
    }
    if (!field_mapping || Object.keys(field_mapping).length === 0) {
      return NextResponse.json({ error: '字段映射不能为空' }, { status: 400 });
    }

    const client = await getClient();

    // 获取文档数据
    let records: Record<string, unknown>[] = [];

    if (sheet_id) {
      const smartSheetRecords = await client.getAllSmartSheetRecords(file_id, sheet_id);
      records = smartSheetRecords.map(r => r.fields);
    } else {
      const content = await client.getContent(file_id);
      if (content && typeof content === 'object' && 'content' in content) {
        records = parseMarkdownTable((content as { content: string }).content);
      }
      if (records.length === 0) {
        return NextResponse.json({
          error: '无法解析文档内容为表格数据，建议使用智能表格格式',
        }, { status: 400 });
      }
    }

    if (records.length === 0) {
      return NextResponse.json({ error: '文档中没有可导入的数据' }, { status: 400 });
    }

    // 根据字段映射转换数据
    const mappedRecords = records.map(record => {
      const mapped: Record<string, unknown> = {};
      for (const [sourceField, targetField] of Object.entries(field_mapping)) {
        if (record[sourceField] !== undefined) {
          mapped[targetField as string] = record[sourceField];
        }
      }
      return mapped;
    }).filter(record => Object.keys(record).length > 0);

    // 导入到对应的数据集合
    const result = await importToTarget(target, mappedRecords, userInfo.username, import_mode);

    return NextResponse.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      total_source: records.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('从腾讯文档导入数据失败:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 解析 Markdown 表格为记录数组
function parseMarkdownTable(content: string): Record<string, unknown>[] {
  const lines = content.split('\n').filter(line => line.trim().startsWith('|'));
  if (lines.length < 2) return [];

  const headers = lines[0].split('|')
    .map(h => h.trim())
    .filter(h => h.length > 0);

  const records: Record<string, unknown>[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (cells.length > 0) {
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = cells[idx] || '';
      });
      records.push(record);
    }
  }

  return records;
}

// 将数据导入到目标集合（数据库版本）
async function importToTarget(
  target: string,
  records: Record<string, unknown>[],
  username: string,
  mode: string,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  switch (target) {
    case 'customers': {
      for (const record of records) {
        try {
          if (!record.name && !record['客户名称']) {
            skipped++;
            continue;
          }

          const customerName = (record.name || record['客户名称'] || '') as string;

          // 检查是否已存在同名客户（更新模式）
          if (mode === 'update') {
            const existing = await dbGetCustomers({ name: customerName });
            if (existing && existing.length > 0) {
              await dbUpdateCustomer(existing[0].id, {
                name: customerName,
                delivery_consultant: (record.delivery_consultant || record['交付顾问'] || username) as string,
                contact: (record.contact || record['联系人'] || existing[0].contact) as string,
                phone: (record.phone || record['电话'] || existing[0].phone) as string,
                industry: (record.industry || record['行业'] || existing[0].industry) as string,
                address: (record.address || record['地址'] || existing[0].address) as string,
              });
              imported++;
              continue;
            }
          }

          await dbCreateCustomer({
            name: customerName,
            status: (record.status || record['状态'] || 'not_online') as string,
            contact: (record.contact || record['联系人'] || '') as string,
            phone: (record.phone || record['电话'] || '') as string,
            industry: (record.industry || record['行业'] || '') as string,
            address: (record.address || record['地址'] || '') as string,
            delivery_consultant: (record.delivery_consultant || record['交付顾问'] || username) as string,
            source: 'tencent_docs',
          });
          imported++;
        } catch (e) {
          errors.push(`导入客户失败: ${e instanceof Error ? e.message : '未知错误'}`);
        }
      }
      break;
    }
    case 'follow_ups': {
      for (const record of records) {
        try {
          if (!record.customer_id && !record['客户ID']) {
            skipped++;
            continue;
          }
          await dbCreateFollowUp({
            customer_id: (record.customer_id || record['客户ID']) as string,
            content: (record.content || record['跟进内容'] || '') as string,
            follow_up_type: (record.follow_up_type || record['跟进方式'] || '其他') as string,
            follow_up_date: (record.follow_up_date || record['跟进日期'] || new Date().toISOString().split('T')[0]) as string,
            consultant: username,
            source: 'tencent_docs',
          });
          imported++;
        } catch (e) {
          errors.push(`导入跟进记录失败: ${e instanceof Error ? e.message : '未知错误'}`);
        }
      }
      break;
    }
    case 'implementation_logs': {
      for (const record of records) {
        try {
          if (!record.customer_id && !record['客户ID']) {
            skipped++;
            continue;
          }
          await dbCreateImplementationLog({
            customer_id: (record.customer_id || record['客户ID']) as string,
            content: (record.content || record['日志内容'] || '') as string,
            log_date: (record.log_date || record['日期'] || new Date().toISOString().split('T')[0]) as string,
            manday: parseFloat((record.manday || record['人天'] || '0') as string) || 0,
            consultant: username,
            source: 'tencent_docs',
          });
          imported++;
        } catch (e) {
          errors.push(`导入实施日志失败: ${e instanceof Error ? e.message : '未知错误'}`);
        }
      }
      break;
    }
    default:
      errors.push(`不支持的导入目标: ${target}`);
  }

  return { imported, skipped, errors };
}
