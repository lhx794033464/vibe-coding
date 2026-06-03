import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomerById, dbGetImplementationLogs, dbGetAllUsers } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';
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
import * as fs from 'fs';
import * as path from 'path';

// 生成验收单Word文档（本地存储模式）
export async function POST(request: NextRequest) {
  try {
    // 数据隔离：验证用户权限
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const body = await request.json();
    const { customer_id } = body;

    if (!customer_id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    // 获取客户信息
    const customer = await dbGetCustomerById(customer_id);
    if (!customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    // 非管理员只能生成自己负责的客户的验收单
    if (!isAdmin && (customer as any).user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
    }

    // 获取实施日志
    const implementationLogs = (await dbGetImplementationLogs({ customerId: customer_id }))
      .sort((a: any, b: any) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime());

    // 获取参会人员：交付顾问 + 所有参与过实施日志的顾问
    const allUsers = await dbGetAllUsers();
    const userIdToName = new Map(allUsers.map((u: any) => [u.id, u.username]));
    const participantIds = new Set<string>();
    // 客户的交付顾问
    participantIds.add((customer as any).user_id);
    // 实施日志中出现的顾问
    implementationLogs.forEach((log: any) => {
      if (log.user_id) participantIds.add(log.user_id);
    });
    const participants = Array.from(participantIds)
      .map(id => userIdToName.get(id))
      .filter(Boolean)
      .join('、');

    // 格式化版本名称
    const versionName = (customer as any).version ? String((customer as any).version) : '-';
    
    // 格式化模块名称（兼容数组和字符串格式）
    const modulesName = (customer as any).modules && (Array.isArray((customer as any).modules) ? (customer as any).modules.length > 0 : ((customer as any).modules as string).length > 0)
      ? (Array.isArray((customer as any).modules) 
          ? (customer as any).modules.map((m: string) => String(m)).join('+')
          : String((customer as any).modules))
      : '-';

    // 边框样式：粗外边框，细内边框
    const outerBorder = {
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

    // 创建实施日志段落
    const implementationParagraphs = createImplementationParagraphs(implementationLogs);

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
                    new TextRun({ text: ' '.repeat(80) }),
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
                    new TextRun({ text: '金蝶软件（中国）有限公司', size: 21 }),
                    new TextRun({ text: '\t', size: 21 }),
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
                  ],
                  tabStops: [
                    {
                      type: 'right' as const,
                      position: 9000,
                    },
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: '版权所有        翻版必究', size: 21 }),
                  ],
                  alignment: AlignmentType.LEFT,
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: '项目实施验收确认单',
                  bold: true,
                  size: 56,
                  font: '黑体',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 300 },
            }),
            
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('客户名称', outerBorder, innerBorder, 'left'),
                    createValueCell((customer as any).name || '', outerBorder, innerBorder, 3, 'right'),
                  ],
                }),
                
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('合同编号\n（实施订单号）', outerBorder, innerBorder, 'left', true),
                    createValueCell((customer as any).implementation_order_no || '', outerBorder, innerBorder, 3, 'right'),
                  ],
                }),
                
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('参会人员', outerBorder, innerBorder, 'left'),
                    createValueCell(participants || '', outerBorder, innerBorder, 3, 'right'),
                  ],
                }),
                
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('客户联系人', outerBorder, innerBorder, 'left'),
                    createValueCell('', outerBorder, innerBorder, 1, 'middle'),
                    createLabelCell('客户电话', outerBorder, innerBorder, 'middle'),
                    createValueCell('', outerBorder, innerBorder, 1, 'right'),
                  ],
                }),
                
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('软件版本', outerBorder, innerBorder, 'left'),
                    createValueCell(versionName, outerBorder, innerBorder, 1, 'middle'),
                    createLabelCell('上线模块', outerBorder, innerBorder, 'middle'),
                    createValueCell(modulesName, outerBorder, innerBorder, 1, 'right'),
                  ],
                }),
                
                new TableRow({
                  tableHeader: true,
                  children: [
                    createLabelCell('系统实施\n主要内容', outerBorder, innerBorder, 'left', true),
                    createImplementationCell(implementationParagraphs, outerBorder, innerBorder),
                  ],
                }),
              ],
            }),
            
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

    const fileName = `${(customer as any).name}_验收单_${format(new Date(), 'yyyyMMdd')}.docx`;
    
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

// 辅助函数
type BorderStyleType = {
  style: typeof BorderStyle.SINGLE;
  size: number;
  color: string;
};

type CellPosition = 'left' | 'right' | 'middle';

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

  const borders = getBordersForPosition(position, outerBorder, innerBorder);

  return new TableCell({
    children: paragraphs,
    verticalAlign: VerticalAlign.CENTER,
    shading: { fill: 'FFFFFF' },
    borders: borders,
    width: { size: 20, type: WidthType.PERCENTAGE },
  });
}

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

  const borders = getBordersForPosition(position, outerBorder, innerBorder);

  return new TableCell({
    children: paragraphs,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: columnSpan,
    borders: borders,
  });
}

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

function createImplementationParagraphs(
  logs: Array<{ log_date: string; consumed_days: string; summary: string; content?: string }>
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lineSpacing = { line: 360, lineRule: 'auto' as const };

  if (!logs || logs.length === 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '暂无实施记录',
            size: 15,
            font: '微软雅黑',
            italics: true,
          }),
        ],
        spacing: { before: 100, after: 100, ...lineSpacing },
      })
    );
  } else {
    logs.forEach((log, index) => {
      const dateStr = format(new Date(log.log_date), 'M/d');
      const summary = log.summary || log.content || '';
      
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${index + 1}、${dateStr}`,
              bold: true,
              size: 15,
              font: '微软雅黑',
            }),
          ],
          spacing: { before: index === 0 ? 100 : 200, after: 60, ...lineSpacing },
        })
      );
      
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: summary,
              size: 15,
              font: '微软雅黑',
            }),
          ],
          spacing: { before: 60, after: 100, ...lineSpacing },
        })
      );
    });
  }

  return paragraphs;
}

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
