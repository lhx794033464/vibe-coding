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

// React Flow JSON 生成提示词
const REACTFLOW_PROMPT = `
你是一个专业的业务流程图生成专家，精通金蝶云星辰ERP系统的业务流程。

## 任务
根据用户描述的业务场景，生成 React Flow 流程图编辑器可用的 JSON 数据格式。

## 重要：布局规则（必须严格遵守）

**必须采用垂直布局（从上到下），所有节点垂直对齐：**

1. **所有节点的 x 坐标必须相同**，统一使用 x = 350
2. **y 坐标按固定间隔递增**，起始 y = 80，每个节点间距 90
3. **连线必须是垂直直线**，使用 sourceHandle = "bottom", targetHandle = "top-in"
4. **禁止斜线连接**，确保相邻节点上下对齐

## React Flow JSON 格式规范

基础结构：
\`\`\`json
{
  "nodes": [
    {
      "id": "唯一标识符",
      "type": "节点类型",
      "position": { "x": 350, "y": 递增坐标 },
      "data": { "label": "节点显示文字", "color": "颜色标识" }
    }
  ],
  "edges": [
    {
      "id": "边唯一标识符",
      "source": "源节点id",
      "target": "目标节点id",
      "sourceHandle": "bottom",
      "targetHandle": "top-in"
    }
  ]
}
\`\`\`

## 节点类型与颜色对照表

| 节点类型 | type值 | color值 | 节点颜色 | 适用场景 |
|---------|-------|---------|---------|---------|
| 开始节点 | start | gray | 灰色 | 流程开始 |
| 结束节点 | end | gray | 灰色 | 流程结束 |
| 采购类 | process | blue | 蓝色 | 采购申请、采购订单、采购入库、采购发票 |
| 销售类 | process | orange | 橙色 | 销售报价、销售订单、销售出库、销售发票 |
| 库存类 | process | purple | 紫色 | 库存管理、盘点、调拨、出入库 |
| 财务类 | process | teal | 青色 | 收款、付款、结算、发票、财务核算 |
| 退货/退款 | process | red | 红色 | 退货申请、退货审核、退款处理 |
| 审核/判断 | process | yellow | 黄色 | 审批、判断、条件分支 |
| 通用流程 | process | blue | 蓝色 | 其他通用业务节点 |

**重要**: 
1. data 中必须包含 color 字段，根据节点所属业务类型设置对应颜色
2. 所有节点的 x 坐标必须为 350
3. 所有边的 sourceHandle = "bottom", targetHandle = "top-in"

## 垂直布局示例

\`\`\`json
{
  "nodes": [
    {"id": "start", "type": "start", "position": {"x": 350, "y": 80}, "data": {"label": "开始", "color": "gray"}},
    {"id": "node_1", "type": "process", "position": {"x": 350, "y": 170}, "data": {"label": "采购申请单", "color": "blue"}},
    {"id": "node_2", "type": "process", "position": {"x": 350, "y": 260}, "data": {"label": "采购订单", "color": "blue"}},
    {"id": "node_3", "type": "process", "position": {"x": 350, "y": 350}, "data": {"label": "采购入库单", "color": "blue"}},
    {"id": "node_4", "type": "process", "position": {"x": 350, "y": 440}, "data": {"label": "付款结算", "color": "teal"}},
    {"id": "end", "type": "end", "position": {"x": 350, "y": 530}, "data": {"label": "结束", "color": "gray"}}
  ],
  "edges": [
    {"id": "edge_1", "source": "start", "target": "node_1", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_2", "source": "node_1", "target": "node_2", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_3", "source": "node_2", "target": "node_3", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_4", "source": "node_3", "target": "node_4", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_5", "source": "node_4", "target": "end", "sourceHandle": "bottom", "targetHandle": "top-in"}
  ]
}
\`\`\`

## 金蝶云星辰单据参考
${KINGDEE_DOCUMENTS}

## 输出格式要求
直接输出 JSON 对象，不要包含任何其他说明文字或代码块标记。

**验证清单**（生成后必须满足）：
1. 所有节点的 position.x 都是 350
2. 所有节点的 position.y 从 80 开始，依次递增 90
3. 所有边的 sourceHandle 都是 "bottom"，targetHandle 都是 "top-in"
4. 每个节点的 data 都包含 color 字段
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
      { role: 'system' as const, content: REACTFLOW_PROMPT },
      { role: 'user' as const, content: `请根据以下业务场景生成金蝶云星辰业务流程图（React Flow JSON格式）：\n\n${description}` }
    ];

    // 调用LLM生成
    let jsonContent = '';
    const stream = client.stream(messages, {
      model: 'doubao-seed-2-0-lite-260215',
      temperature: 0.3,
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        jsonContent += chunk.content.toString();
      }
    }

    // 清理输出
    jsonContent = jsonContent.trim();
    
    // 如果输出包含代码块标记，提取其中的内容
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    // 尝试解析 JSON
    let flowData;
    try {
      flowData = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('JSON 解析失败:', jsonContent.substring(0, 500));
      return NextResponse.json({ 
        error: '生成的流程图格式不正确，请重新描述业务流程',
        rawContent: jsonContent.substring(0, 1000)
      }, { status: 500 });
    }

    // 验证数据结构
    if (!flowData.nodes || !Array.isArray(flowData.nodes)) {
      console.error('缺少 nodes 数组:', flowData);
      return NextResponse.json({ 
        error: '生成的流程图缺少节点数据，请重新描述业务流程'
      }, { status: 500 });
    }

    // 验证每个节点
    for (const node of flowData.nodes) {
      if (!node.id || !node.type || !node.position || !node.data) {
        console.error('节点数据不完整:', node);
        return NextResponse.json({ 
          error: '生成的节点数据不完整，请重新描述业务流程'
        }, { status: 500 });
      }
    }

    // 如果没有 edges，创建空的数组
    if (!flowData.edges) {
      flowData.edges = [];
    }

    console.log('流程图生成成功:', flowData.nodes.length, '个节点,', flowData.edges.length, '条连线');

    return NextResponse.json({ 
      success: true, 
      flowData: flowData 
    });

  } catch (error) {
    console.error('生成流程图失败:', error);
    return NextResponse.json({ 
      error: '生成流程图失败，请稍后重试',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}
