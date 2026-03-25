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

// LogicFlow JSON 生成提示词
const LOGICFLOW_PROMPT = `
你是一个专业的业务流程图生成专家，精通金蝶云星辰ERP系统的业务流程。

## 任务
根据用户描述的业务场景，生成 LogicFlow 流程图编辑器可用的 JSON 数据格式。

## LogicFlow JSON 格式规范

基础结构：
\`\`\`json
{
  "nodes": [
    {
      "id": "node_unique_id",
      "type": "节点类型",
      "x": 横坐标数字,
      "y": 纵坐标数字,
      "text": "节点显示文字"
    }
  ],
  "edges": [
    {
      "id": "edge_unique_id",
      "type": "polyline",
      "sourceNodeId": "源节点id",
      "targetNodeId": "目标节点id",
      "text": "连线文字（可选）"
    }
  ]
}
\`\`\`

## 节点类型说明

1. **开始节点**: type = "start"
   - 用于流程开始，圆形绿色节点
   - text 通常为 "开始"

2. **结束节点**: type = "end"  
   - 用于流程结束，圆形红色节点
   - text 通常为 "结束"

3. **通用流程节点**: type = "process"
   - 圆角矩形，蓝色

4. **采购类节点**: type = "purchase"
   - 圆角矩形，蓝色
   - 用于采购申请单、采购订单、采购入库单、采购发票、付款单等

5. **销售类节点**: type = "sale"
   - 圆角矩形，橙色
   - 用于销售报价单、销售订单、销售出库单、销售发票、收款单等

6. **库存类节点**: type = "inventory"
   - 圆角矩形，紫色
   - 用于其他入库单、其他出库单、调拨单、盘点单等

7. **财务类节点**: type = "finance"
   - 圆角矩形，绿色
   - 用于收款单、付款单、费用报销单、转账单、凭证等

8. **判断节点**: type = "decision"
   - 菱形，黄色
   - 用于审批判断、条件分支
   - text 示例: "审批通过?", "库存充足?", "信用额度够?"

## 布局规则

1. 使用从上到下的垂直布局
2. 起始 y 坐标为 100，每个节点垂直间距 100
3. 居中布局，x 坐标以 400 为中心
4. 节点 id 使用有意义的英文，如: start, purchase_request, purchase_order, end 等
5. 边 id 使用 edge_ 前缀，如: edge_1, edge_2 等
6. 连线类型统一使用 "polyline"（折线）

## 生成示例

用户输入：商贸企业标准采购流程

输出：
\`\`\`json
{
  "nodes": [
    {"id": "start", "type": "start", "x": 400, "y": 100, "text": "开始"},
    {"id": "purchase_request", "type": "purchase", "x": 400, "y": 200, "text": "采购申请单"},
    {"id": "purchase_order", "type": "purchase", "x": 400, "y": 300, "text": "采购订单"},
    {"id": "purchase_inbound", "type": "purchase", "x": 400, "y": 400, "text": "采购入库单"},
    {"id": "purchase_invoice", "type": "purchase", "x": 400, "y": 500, "text": "采购发票"},
    {"id": "payment", "type": "finance", "x": 400, "y": 600, "text": "付款单"},
    {"id": "end", "type": "end", "x": 400, "y": 700, "text": "结束"}
  ],
  "edges": [
    {"id": "edge_1", "type": "polyline", "sourceNodeId": "start", "targetNodeId": "purchase_request"},
    {"id": "edge_2", "type": "polyline", "sourceNodeId": "purchase_request", "targetNodeId": "purchase_order"},
    {"id": "edge_3", "type": "polyline", "sourceNodeId": "purchase_order", "targetNodeId": "purchase_inbound"},
    {"id": "edge_4", "type": "polyline", "sourceNodeId": "purchase_inbound", "targetNodeId": "purchase_invoice"},
    {"id": "edge_5", "type": "polyline", "sourceNodeId": "purchase_invoice", "targetNodeId": "payment"},
    {"id": "edge_6", "type": "polyline", "sourceNodeId": "payment", "targetNodeId": "end"}
  ]
}
\`\`\`

## 金蝶云星辰单据参考
${KINGDEE_DOCUMENTS}

## 输出格式要求
直接输出 JSON 对象，不要包含任何其他说明文字或代码块标记。
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
      { role: 'system' as const, content: LOGICFLOW_PROMPT },
      { role: 'user' as const, content: `请根据以下业务场景生成金蝶云星辰业务流程图（LogicFlow JSON格式）：\n\n${description}` }
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
      if (!node.id || !node.type || typeof node.x !== 'number' || typeof node.y !== 'number') {
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
