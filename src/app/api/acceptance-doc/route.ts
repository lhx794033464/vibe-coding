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
  AlignmentType,
  VerticalAlign,
  BorderStyle,
  Packer,
  Header,
  Footer,
  PageNumber,
  ImageRun,
  convertInchesToTwip,
} from 'docx';
import { format } from 'date-fns';
import { MODULE_CONFIG, ProductModule, ProductVersion, VERSION_CONFIG } from '@/types';
import * as fs from 'fs';
import * as path from 'path';

// 生成验收单Word文档（严格按照模板格式，保留页眉页脚）
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const supabaseClient = getSupabaseClient(token);
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { customer_id } = body;

    if (!customer_id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    // 获取客户信息
    const { data: customer, error: customerError } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    // 获取实施日志
    const { data: implementationLogs, error: logsError } = await supabaseClient
      .from('implementation_logs')
      .select('*')
      .eq('customer_id', customer_id)
      .order('log_date', { ascending: true });

    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    // 格式化版本名称
    const versionName = customer.version ? (VERSION_CONFIG[customer.version as ProductVersion]?.label || customer.version) : '-';
    
    // 格式化模块名称
    const modulesName = customer.modules && customer.modules.length > 0
      ? customer.modules.map((m: string) => MODULE_CONFIG[m as ProductModule]?.label || m).join('+')
      : '-';

    // 创建表格边框样式
    const tableBorder = {
      style: BorderStyle.SINGLE,
      size: 12,
      color: '000000',
    } as const;
    
    const innerBorder = {
      style: BorderStyle.SINGLE,
      size: 6,
      color: '000000',
    } as const;

    // 读取logo图片
    const logoPath = path.join(process.cwd(), 'public', 'kingdee-logo.png');
    const logoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

    // 创建实施日志段落（每个序号另起一行）
    const implementationParagraphs = createImplementationParagraphs(implementationLogs || []);

    // 创建Word文档
    const doc = new Document({
      sections: [
        {
          properties: {},
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    // 添加空格占位
                    new TextRun({ text: ' '.repeat(80) }),
                    // 添加logo图片
                    ...(logoBuffer ? [
                      new ImageRun({
                        data: logoBuffer,
                        type: 'png',
                        transformation: {
                          width: 80,
                          height: 33,
                        },
                      }),
                    ] : []),
                  ],
                  alignment: AlignmentType.RIGHT,
                  border: {
                    bottom: {
                      color: 'auto',
                      space: 1,
                      style: BorderStyle.SINGLE,
                      size: 24,
                    },
                  },
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: '第 ', size: 21 }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      size: 21,
                    }),
                    new TextRun({ text: ' 页 共 ', size: 21 }),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                      size: 21,
                    }),
                    new TextRun({ text: ' 页', size: 21 }),
                    new TextRun({ text: '金蝶软件（中国）有限公司', size: 21 }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: '版权所有        翻版必究', size: 21 }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          },
          children: [
            // 标题：项目实施验收确认单
            new Paragraph({
              children: [
                new TextRun({
                  text: '项目实施验收确认单',
                  bold: true,
                  size: 56, // 28pt，对应模板中的大标题
                  font: '黑体',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 300 },
            }),
            
            // 主表格（严格按照模板格式）
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              columnWidths: [2049, 2258, 2384, 2547], // 按模板比例
              rows: [
                // 第1行：客户名称
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('客户名称', tableBorder, innerBorder),
                    createValueCell(customer.name || '', tableBorder, innerBorder, 3),
                  ],
                }),
                
                // 第2行：合同编号
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('合同编号', tableBorder, innerBorder),
                    createValueCell(customer.sales_order_no || '', tableBorder, innerBorder, 3),
                  ],
                }),
                
                // 第3行：参会人员
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('参会人员', tableBorder, innerBorder),
                    createValueCell('', tableBorder, innerBorder, 3), // 暂无数据，留空
                  ],
                }),
                
                // 第4行：客户联系人 | 客户电话
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('客户联系人', tableBorder, innerBorder),
                    createValueCell('', tableBorder, innerBorder, 1), // 暂无数据，留空
                    createLabelCell('客户电话', tableBorder, innerBorder),
                    createValueCell('', tableBorder, innerBorder, 1), // 暂无数据，留空
                  ],
                }),
                
                // 第5行：软件版本 | 上线模块
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('软件版本', tableBorder, innerBorder),
                    createValueCell(versionName, tableBorder, innerBorder, 1),
                    createLabelCell('上线模块', tableBorder, innerBorder),
                    createValueCell(modulesName, tableBorder, innerBorder, 1),
                  ],
                }),
                
                // 第6行：系统实施主要内容
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('系统实施\n主要内容', tableBorder, innerBorder, true),
                    createImplementationCell(implementationParagraphs, tableBorder, innerBorder),
                  ],
                }),
              ],
            }),
            
            // 签字区域
            new Paragraph({
              children: [],
              spacing: { before: 400 },
            }),
            
            // 客户对接人签字
            new Paragraph({
              children: [
                new TextRun({
                  text: '客户对接人： __________________ 签署',
                  size: 24,
                  font: '微软雅黑',
                }),
              ],
              spacing: { before: 200 },
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: `日期：${'_'.repeat(30)}`,
                  size: 24,
                  font: '微软雅黑',
                }),
              ],
              spacing: { after: 300 },
            }),
            
            // 金蝶项目经理签字
            new Paragraph({
              children: [
                new TextRun({
                  text: '金蝶项目经理： __________________ 签署',
                  size: 24,
                  font: '微软雅黑',
                }),
              ],
              spacing: { before: 200 },
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: `日期：${format(new Date(), 'yyyy/M/d')}`,
                  size: 24,
                  font: '微软雅黑',
                }),
              ],
              spacing: { after: 200 },
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

// 边框样式类型
type BorderStyleType = {
  style: typeof BorderStyle.SINGLE;
  size: number;
  color: string;
};

// 创建标签单元格
function createLabelCell(
  text: string, 
  tableBorder: BorderStyleType,
  innerBorder: BorderStyleType,
  multiLine: boolean = false
): TableCell {
  const paragraphs = multiLine 
    ? text.split('\n').map(line => 
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              bold: true,
              size: 24,
              font: '微软雅黑',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 60 },
        })
      )
    : [
        new Paragraph({
          children: [
            new TextRun({
              text: text,
              bold: true,
              size: 24,
              font: '微软雅黑',
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      ];

  return new TableCell({
    children: paragraphs,
    verticalAlign: VerticalAlign.CENTER,
    shading: { fill: 'FFFFFF' },
    borders: {
      top: tableBorder,
      left: tableBorder,
      bottom: tableBorder,
      right: innerBorder,
    },
  });
}

// 创建值单元格
function createValueCell(
  text: string,
  tableBorder: BorderStyleType,
  innerBorder: BorderStyleType,
  columnSpan: number = 1,
  multiLine: boolean = false
): TableCell {
  const paragraphs = multiLine
    ? [
        new Paragraph({
          children: [
            new TextRun({
              text: text,
              size: 24,
              font: '微软雅黑',
            }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { before: 100, after: 100 },
        }),
      ]
    : [
        new Paragraph({
          children: [
            new TextRun({
              text: text,
              size: 24,
              font: '微软雅黑',
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      ];

  const borders = columnSpan === 3 
    ? {
        top: tableBorder,
        left: innerBorder,
        bottom: tableBorder,
        right: tableBorder,
      }
    : {
        top: tableBorder,
        left: innerBorder,
        bottom: tableBorder,
        right: innerBorder,
      };

  return new TableCell({
    children: paragraphs,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: columnSpan,
    borders: borders,
  });
}

// 创建实施日志段落（每个序号另起一行）
function createImplementationParagraphs(
  logs: Array<{ log_date: string; consumed_days: string; summary: string }>
): Paragraph[] {
  if (!logs || logs.length === 0) {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: '暂无实施记录',
            size: 24,
            font: '微软雅黑',
            italics: true,
          }),
        ],
        spacing: { before: 100, after: 100 },
      }),
    ];
  }

  const paragraphs: Paragraph[] = [];

  logs.forEach((log, index) => {
    const dateStr = format(new Date(log.log_date), 'M/d');
    const summary = log.summary || '';
    
    // 序号和日期行（加粗）
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${index + 1}、${dateStr}`,
            bold: true,
            size: 24,
            font: '微软雅黑',
          }),
        ],
        spacing: { before: index === 0 ? 100 : 200, after: 60 },
      })
    );
    
    // 内容行
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: summary,
            size: 24,
            font: '微软雅黑',
          }),
        ],
        spacing: { before: 60, after: 100 },
      })
    );
  });

  return paragraphs;
}

// 创建实施日志单元格
function createImplementationCell(
  paragraphs: Paragraph[],
  tableBorder: BorderStyleType,
  innerBorder: BorderStyleType
): TableCell {
  return new TableCell({
    children: paragraphs,
    verticalAlign: VerticalAlign.TOP,
    columnSpan: 3,
    borders: {
      top: tableBorder,
      left: innerBorder,
      bottom: tableBorder,
      right: tableBorder,
    },
  });
}
