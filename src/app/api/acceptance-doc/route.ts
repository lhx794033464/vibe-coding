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

    // 边框样式：粗外边框，细内边框
    const outerBorder = {
      style: BorderStyle.SINGLE,
      size: 12, // 粗边框
      color: '000000',
    } as const;
    
    const innerBorder = {
      style: BorderStyle.SINGLE,
      size: 6, // 细边框
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
                  size: 56, // 28pt
                  font: '黑体',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 300 },
            }),
            
            // 主表格（粗外边框，细内边框，第一列固定20%宽度）
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                // 第1行：客户名称
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('客户名称', outerBorder, innerBorder, 'left'),
                    createValueCell(customer.name || '', outerBorder, innerBorder, 3, 'right'),
                  ],
                }),
                
                // 第2行：合同编号
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('合同编号', outerBorder, innerBorder, 'left'),
                    createValueCell('', outerBorder, innerBorder, 3, 'right'),
                  ],
                }),
                
                // 第3行：参会人员
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('参会人员', outerBorder, innerBorder, 'left'),
                    createValueCell('', outerBorder, innerBorder, 3, 'right'),
                  ],
                }),
                
                // 第4行：客户联系人 | 客户电话
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('客户联系人', outerBorder, innerBorder, 'left'),
                    createValueCell('', outerBorder, innerBorder, 1, 'middle'),
                    createLabelCell('客户电话', outerBorder, innerBorder, 'middle'),
                    createValueCell('', outerBorder, innerBorder, 1, 'right'),
                  ],
                }),
                
                // 第5行：软件版本 | 上线模块
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('软件版本', outerBorder, innerBorder, 'left'),
                    createValueCell(versionName, outerBorder, innerBorder, 1, 'middle'),
                    createLabelCell('上线模块', outerBorder, innerBorder, 'middle'),
                    createValueCell(modulesName, outerBorder, innerBorder, 1, 'right'),
                  ],
                }),
                
                // 第6行：系统实施主要内容
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('系统实施\n主要内容', outerBorder, innerBorder, 'left', true),
                    createImplementationCell(implementationParagraphs, outerBorder, innerBorder),
                  ],
                }),
              ],
            }),
            
            // 签署区域（表格外部右下方，加粗显示）
            new Paragraph({
              children: [
                new TextRun({
                  text: '客户对接人： __________________ 签署日期：______________',
                  bold: true,
                  size: 24,
                  font: '微软雅黑',
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 300, after: 100 },
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: `金蝶项目经理： __________________ 签署日期：${format(new Date(), 'yyyy/M/d')}`,
                  bold: true,
                  size: 24,
                  font: '微软雅黑',
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 100, after: 100 },
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

// 单元格位置类型
type CellPosition = 'left' | 'right' | 'middle';

// 创建标签单元格
function createLabelCell(
  text: string, 
  outerBorder: BorderStyleType,
  innerBorder: BorderStyleType,
  position: CellPosition,
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

  // 根据位置设置边框
  const borders = getBordersForPosition(position, outerBorder, innerBorder);

  return new TableCell({
    children: paragraphs,
    verticalAlign: VerticalAlign.CENTER,
    shading: { fill: 'FFFFFF' },
    borders: borders,
    width: { size: 20, type: WidthType.PERCENTAGE }, // 第一列固定20%宽度
  });
}

// 创建值单元格
function createValueCell(
  text: string,
  outerBorder: BorderStyleType,
  innerBorder: BorderStyleType,
  columnSpan: number = 1,
  position: CellPosition
): TableCell {
  const paragraphs = [
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

  // 根据位置设置边框
  const borders = getBordersForPosition(position, outerBorder, innerBorder);

  return new TableCell({
    children: paragraphs,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: columnSpan,
    borders: borders,
  });
}

// 根据位置获取边框配置
function getBordersForPosition(
  position: CellPosition,
  outerBorder: BorderStyleType,
  innerBorder: BorderStyleType
) {
  switch (position) {
    case 'left':
      return {
        top: outerBorder,
        left: outerBorder,
        bottom: innerBorder,
        right: innerBorder,
      };
    case 'right':
      return {
        top: outerBorder,
        left: innerBorder,
        bottom: innerBorder,
        right: outerBorder,
      };
    case 'middle':
      return {
        top: outerBorder,
        left: innerBorder,
        bottom: innerBorder,
        right: innerBorder,
      };
  }
}

// 创建实施日志段落（每个序号另起一行，六号字体）
function createImplementationParagraphs(
  logs: Array<{ log_date: string; consumed_days: string; summary: string }>
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (!logs || logs.length === 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '暂无实施记录',
            size: 15, // 六号字体 7.5pt
            font: '微软雅黑',
            italics: true,
          }),
        ],
        spacing: { before: 100, after: 100 },
      })
    );
  } else {
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
              size: 15, // 六号字体 7.5pt
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
              size: 15, // 六号字体 7.5pt
              font: '微软雅黑',
            }),
          ],
          spacing: { before: 60, after: 100 },
        })
      );
    });
  }

  return paragraphs;
}

// 创建实施日志单元格
function createImplementationCell(
  paragraphs: Paragraph[],
  outerBorder: BorderStyleType,
  innerBorder: BorderStyleType
): TableCell {
  return new TableCell({
    children: paragraphs,
    verticalAlign: VerticalAlign.TOP,
    columnSpan: 3,
    borders: {
      top: innerBorder,
      left: innerBorder,
      bottom: outerBorder,
      right: outerBorder,
    },
  });
}
