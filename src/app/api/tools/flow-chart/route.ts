import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 金蝶云星辰单据知识库
const KINGDEE_DOCUMENTS = `
## 金蝶云星辰核心单据和流程

### 采购流程
1. 采购申请单 → 采购订单 → 采购入库单 → 采购发票 → 付款单
2. 采购退货流程：采购退货申请 → 采购退货出库单 → 采购退货发票

### 销售流程
1. 销售报价单 → 销售订单 → 销售出库单 → 销售发票 → 收款单
2. 销售退货流程：销售退货申请 → 销售退货入库单 → 销售退货发票

### 库存流程
1. 其他入库单：盘盈、调拨入库、其他入库
2. 其他出库单：盘亏、调拨出库、其他出库
3. 调拨单：仓库间调拨
4. 组装单/拆卸单：组合件管理

### 生产流程（工贸版）
1. 生产计划 → 生产工单 → 生产领料 → 生产入库
2. 委外加工：委外订单 → 委外发料 → 委外入库

### 财务流程
1. 收款单：销售收款、预收款
2. 付款单：采购付款、预付款
3. 费用报销单：日常费用报销
4. 转账单：银行转账
5. 记账凭证：手工凭证、期末结转

### 零售流程
1. 零售POS单 → 日结 → 财务凭证

### 订货流程
1. 订货订单 → 订货发货 → 收货确认
`;

// draw.io XML 生成提示词
const DRAWIO_PROMPT = `
你是一个专业的业务流程图生成专家，精通金蝶云星辰ERP系统的业务流程。

## 任务
根据用户描述的业务场景，生成符合draw.io格式的XML流程图代码。

## 要求
1. 严格按照金蝶云星辰的单据流程生成
2. 使用标准的流程图形状：
   - 开始/结束：椭圆形（ellipse）
   - 流程节点：圆角矩形（rounded=1）
   - 判断节点：菱形（rhombus）
   - 单据节点：矩形（带单据图标标识）
3. 节点颜色规范：
   - 开始：绿色（#d5e8d4）
   - 结束：红色（#f8cecc）
   - 采购相关：蓝色（#dae8fc）
   - 销售相关：橙色（#ffe6cc）
   - 库存相关：紫色（#e1d5e7）
   - 财务相关：绿色（#d5e8d4）
   - 生产相关：灰色（#f5f5f5）
4. 箭头标签清晰标注流程方向
5. 布局从上到下或从左到右，避免交叉

## 输出格式
直接输出draw.io兼容的XML代码，不要有任何其他文字说明。
XML格式示例：
\`\`\`xml
<mxfile host="app.diagrams.net" modified="2024-01-01T00:00:00.000Z" agent="Mozilla/5.0" version="22.1.0" type="device">
  <diagram name="业务流程图" id="flow-chart">
    <mxGraphModel dx="1426" dy="797" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- 节点和连线 -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
\`\`\`

## 节点XML示例
椭圆（开始/结束）：
<mxCell id="start" value="开始" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="350" y="40" width="80" height="40" as="geometry" />
</mxCell>

圆角矩形（流程节点）：
<mxCell id="node1" value="采购申请单" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
  <mxGeometry x="320" y="120" width="140" height="50" as="geometry" />
</mxCell>

连线：
<mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#333333;" edge="1" parent="1" source="start" target="node1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>

## 金蝶云星辰单据参考
${KINGDEE_DOCUMENTS}
`;

export async function POST(request: NextRequest) {
  try {
    const { description } = await request.json();

    if (!description || typeof description !== 'string') {
      return NextResponse.json({ error: '请输入业务流程描述' }, { status: 400 });
    }

    // 使用 HeaderUtils 正确提取认证头
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 构建消息
    const messages = [
      { role: 'system' as const, content: DRAWIO_PROMPT },
      { role: 'user' as const, content: `请根据以下业务场景生成金蝶云星辰业务流程图（draw.io XML格式）：\n\n${description}` }
    ];

    // 调用LLM生成
    let xmlContent = '';
    const stream = client.stream(messages, {
      model: 'doubao-seed-2-0-lite-260215',
      temperature: 0.3,
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        xmlContent += chunk.content.toString();
      }
    }

    // 清理输出，提取XML部分
    xmlContent = xmlContent.trim();
    
    // 如果输出包含代码块标记，提取其中的内容
    const xmlMatch = xmlContent.match(/```xml\s*([\s\S]*?)```/);
    if (xmlMatch) {
      xmlContent = xmlMatch[1].trim();
    } else {
      // 尝试直接提取mxfile标签内容
      const mxfileMatch = xmlContent.match(/<mxfile[\s\S]*<\/mxfile>/);
      if (mxfileMatch) {
        xmlContent = mxfileMatch[0];
      }
    }

    // 验证XML格式
    if (!xmlContent.includes('<mxfile') || !xmlContent.includes('</mxfile>')) {
      console.error('生成的XML格式不正确:', xmlContent.substring(0, 500));
      return NextResponse.json({ 
        error: '生成的流程图格式不正确，请重新描述业务流程',
        rawContent: xmlContent.substring(0, 1000)
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      xml: xmlContent 
    });

  } catch (error) {
    console.error('生成流程图失败:', error);
    return NextResponse.json({ 
      error: '生成流程图失败，请稍后重试',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}
