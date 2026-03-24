import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  Packer,
} from 'docx';
import { format } from 'date-fns';

// 生成验收单Word文档
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { customer_id } = body;

    if (!customer_id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    // 获取客户信息
    const { data: customer, error: customerError } = await client
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    // 获取实施日志
    const { data: implementationLogs, error: logsError } = await client
      .from('implementation_logs')
      .select('*')
      .eq('customer_id', customer_id)
      .order('log_date', { ascending: true });

    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    // 计算总消耗人天
    const totalConsumedDays = (implementationLogs || []).reduce(
      (sum, log) => sum + parseFloat(log.consumed_days || '0'),
      0
    );

    // 创建Word文档
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // 标题
            new Paragraph({
              children: [
                new TextRun({
                  text: '项目实施验收单',
                  bold: true,
                  size: 44, // 22pt
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            
            // 客户基本信息表格
            new Paragraph({
              children: [
                new TextRun({
                  text: '一、客户基本信息',
                  bold: true,
                  size: 28,
                }),
              ],
              spacing: { before: 200, after: 200 },
            }),
            
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                createTableRow('客户名称', customer.name || '-'),
                createTableRow('销售订单号', customer.sales_order_no || '-'),
                createTableRow('实施订单号', customer.implementation_order_no || '-'),
                createTableRow('产品版本', customer.version || '-'),
                createTableRow('行业', customer.industry || '-'),
                createTableRow('签订实施人天', customer.implementation_days ? `${customer.implementation_days}天` : '-'),
                createTableRow('实际消耗人天', `${totalConsumedDays.toFixed(2)}天`),
                createTableRow('开通日期', customer.opened_at ? format(new Date(customer.opened_at), 'yyyy-MM-dd') : '-'),
                createTableRow('上线日期', customer.online_at ? format(new Date(customer.online_at), 'yyyy-MM-dd') : '-'),
                createTableRow('验收日期', customer.accepted_at ? format(new Date(customer.accepted_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')),
              ],
            }),
            
            // 特殊需求
            new Paragraph({
              children: [
                new TextRun({
                  text: '二、特殊需求说明',
                  bold: true,
                  size: 28,
                }),
              ],
              spacing: { before: 300, after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: customer.special_requirements || '无特殊需求',
                  size: 24,
                }),
              ],
              spacing: { after: 200 },
            }),
            
            // 实施日志
            new Paragraph({
              children: [
                new TextRun({
                  text: '三、实施纪要记录',
                  bold: true,
                  size: 28,
                }),
              ],
              spacing: { before: 300, after: 200 },
            }),
            
            ...(implementationLogs && implementationLogs.length > 0
              ? [
                  new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                      // 表头
                      new TableRow({
                        children: [
                          createHeaderCell('日期'),
                          createHeaderCell('消耗人天'),
                          createHeaderCell('实施纪要'),
                        ],
                      }),
                      // 数据行
                      ...implementationLogs.map((log: { log_date: string; consumed_days: string; summary: string }) =>
                        new TableRow({
                          children: [
                            createDataCell(format(new Date(log.log_date), 'yyyy-MM-dd HH:mm')),
                            createDataCell(`${parseFloat(log.consumed_days).toFixed(2)}天`),
                            createDataCell(log.summary || '-'),
                          ],
                        })
                      ),
                    ],
                  }),
                ]
              : [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: '暂无实施日志记录',
                        size: 24,
                        italics: true,
                      }),
                    ],
                  }),
                ]),
            
            // 签字区域
            new Paragraph({
              children: [
                new TextRun({
                  text: '四、签字确认',
                  bold: true,
                  size: 28,
                }),
              ],
              spacing: { before: 400, after: 200 },
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: '实施顾问签字：________________    日期：________________',
                  size: 24,
                }),
              ],
              spacing: { after: 300 },
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: '客户确认签字：________________    日期：________________',
                  size: 24,
                }),
              ],
              spacing: { after: 300 },
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: '客户盖章：',
                  size: 24,
                }),
              ],
              spacing: { after: 100 },
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: ' ',
                  size: 24,
                }),
              ],
              spacing: { after: 200 },
            }),
            
            // 文档生成日期
            new Paragraph({
              children: [
                new TextRun({
                  text: `文档生成日期：${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
                  size: 20,
                  italics: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 400 },
            }),
          ],
        },
      ],
    });

    // 生成文档buffer
    const buffer = await Packer.toBuffer(doc);

    // 返回文档
    const fileName = `${customer.name}_验收单_${format(new Date(), 'yyyyMMdd')}.docx`;
    
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('生成验收单失败:', error);
    return NextResponse.json({ error: '生成验收单失败' }, { status: 500 });
  }
}

// 辅助函数：创建表格行
function createTableRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: label,
                bold: true,
                size: 24,
              }),
            ],
          }),
        ],
        width: { size: 30, type: WidthType.PERCENTAGE },
        shading: { fill: 'F0F0F0' },
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: value,
                size: 24,
              }),
            ],
          }),
        ],
        width: { size: 70, type: WidthType.PERCENTAGE },
      }),
    ],
  });
}

// 辅助函数：创建表头单元格
function createHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            size: 24,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: { fill: 'E0E0E0' },
  });
}

// 辅助函数：创建数据单元格
function createDataCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            size: 22,
          }),
        ],
      }),
    ],
  });
}
