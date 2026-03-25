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

// Mermaid 流程图生成提示词
const MERMAID_PROMPT = `
你是一个专业的业务流程图生成专家，精通金蝶云星辰ERP系统的业务流程。

## 任务
根据用户描述的业务场景，生成 Mermaid 格式的流程图代码。

## Mermaid 语法规范
使用 flowchart TD（从上到下）或 flowchart LR（从左到右）语法：

\`\`\`mermaid
flowchart TD
    A[开始] --> B[采购申请单]
    B --> C{审批通过?}
    C -->|是| D[采购订单]
    C -->|否| E[驳回修改]
    E --> B
    D --> F[采购入库单]
    F --> G[采购发票]
    G --> H[付款单]
    H --> I[结束]
\`\`\`

## 样式类定义（可选）
可以定义样式类使图表更美观：

\`\`\`mermaid
flowchart TD
    classDef startEnd fill:#d5e8d4,stroke:#82b366,stroke-width:2px
    classDef purchase fill:#dae8fc,stroke:#6c8ebf
    classDef sales fill:#ffe6cc,stroke:#d79b00
    classDef inventory fill:#e1d5e7,stroke:#9673a6
    classDef finance fill:#d5e8d4,stroke:#82b366
    classDef decision fill:#fff2cc,stroke:#d6b656
    
    A[开始]:::startEnd --> B[采购申请单]:::purchase
    B --> C{审批通过?}:::decision
\`\`\`

## 节点类型
- 方框：[文本] 或 id[文本]
- 圆角方框：([文本])
- 菱形判断：{文本}
- 圆形：((文本))

## 连线类型
- 实线箭头：-->
- 虚线箭头：-.->
- 带文字：-->|文字|

## 要求
1. 严格按照金蝶云星辰的单据流程生成
2. 使用中文节点名称
3. 合理使用判断节点处理分支流程
4. 使用样式类区分不同类型的单据：
   - 采购相关：蓝色 purchase
   - 销售相关：橙色 sales
   - 库存相关：紫色 inventory
   - 财务相关：绿色 finance
   - 判断节点：黄色 decision
   - 开始/结束：浅绿色 startEnd

## 输出格式
直接输出 mermaid 代码块，不要有任何其他说明文字。

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
      { role: 'system' as const, content: MERMAID_PROMPT },
      { role: 'user' as const, content: `请根据以下业务场景生成金蝶云星辰业务流程图（Mermaid格式）：\n\n${description}` }
    ];

    // 调用LLM生成
    let mermaidContent = '';
    const stream = client.stream(messages, {
      model: 'doubao-seed-2-0-lite-260215',
      temperature: 0.3,
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        mermaidContent += chunk.content.toString();
      }
    }

    // 清理输出，提取 mermaid 代码
    mermaidContent = mermaidContent.trim();
    
    // 如果输出包含代码块标记，提取其中的内容
    const mermaidMatch = mermaidContent.match(/```mermaid\s*([\s\S]*?)```/);
    if (mermaidMatch) {
      mermaidContent = mermaidMatch[1].trim();
    } else {
      // 尝试直接提取 flowchart 内容
      const flowchartMatch = mermaidContent.match(/flowchart[\s\S]*/);
      if (flowchartMatch) {
        mermaidContent = flowchartMatch[0];
      }
    }

    // 验证 mermaid 格式
    if (!mermaidContent.includes('flowchart') && !mermaidContent.includes('graph')) {
      console.error('生成的 Mermaid 格式不正确:', mermaidContent.substring(0, 500));
      return NextResponse.json({ 
        error: '生成的流程图格式不正确，请重新描述业务流程',
        rawContent: mermaidContent.substring(0, 1000)
      }, { status: 500 });
    }

    // 生成简单的 draw.io XML（用于下载）
    const drawioXml = generateSimpleDrawioXml(mermaidContent, description);

    return NextResponse.json({ 
      success: true, 
      mermaid: mermaidContent,
      drawio: drawioXml
    });

  } catch (error) {
    console.error('生成流程图失败:', error);
    return NextResponse.json({ 
      error: '生成流程图失败，请稍后重试',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

// 生成简单的 draw.io XML
function generateSimpleDrawioXml(mermaid: string, description: string): string {
  // 从 mermaid 中提取节点
  const nodes: { id: string; label: string }[] = [];
  const edges: { from: string; to: string; label?: string }[] = [];
  
  const lines = mermaid.split('\n');
  let y = 40;
  const nodeMap: Record<string, string> = {};
  
  lines.forEach(line => {
    // 提取节点定义
    const nodeMatch = line.match(/^\s*(\w+)\[(.*?)\]/);
    if (nodeMatch) {
      nodeMap[nodeMatch[1]] = nodeMatch[2];
      nodes.push({ id: nodeMatch[1], label: nodeMatch[2] });
    }
    
    // 提取连接
    const edgeMatch = line.match(/^\s*(\w+).*?-->\s*(?:\|(.*?)\|)?\s*(\w+)/);
    if (edgeMatch) {
      edges.push({ 
        from: edgeMatch[1], 
        to: edgeMatch[3],
        label: edgeMatch[2]
      });
    }
  });

  // 构建 XML
  let cellXml = `
    <mxCell id="0" />
    <mxCell id="1" parent="0" />`;

  // 添加节点
  nodes.forEach((node, index) => {
    const nodeId = `node_${index}`;
    y = 40 + index * 80;
    cellXml += `
    <mxCell id="${nodeId}" value="${escapeXml(node.label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="280" y="${y}" width="140" height="50" as="geometry" />
    </mxCell>`;
  });

  // 生成基础的 draw.io XML
  return `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Generated" version="22.1.0" type="device">
  <diagram name="${escapeXml(description.substring(0, 20))}" id="flow-chart">
    <mxGraphModel dx="1426" dy="797" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
${cellXml}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
