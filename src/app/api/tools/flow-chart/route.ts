import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 金蝶云星辰单据知识库 - 包含语义映射
const KINGDEE_DOCUMENTS = `
## 金蝶云星辰核心单据和流程

### 语义理解映射表（业务术语 → 系统单据）

| 业务语义 | 对应单据 | 单据类型 | 颜色标识 |
|---------|---------|---------|---------|
| 投产、生产、下达生产、排产、制造 | 生产任务单/生产工单 | 生产工单 | cyan |
| 领料、材料出库、发料 | 生产领料单 | 生产领料 | cyan |
| 入库、完工入库、产品入库 | 生产入库单/产品入库单 | 生产入库 | cyan |
| 发货、出库、销售发货、送货 | 销售出库单 | 销售出库 | orange |
| 销售、开单、下单、订货 | 销售订单 | 销售订单 | orange |
| 采购、买货、进货、买材料 | 采购订单 | 采购订单 | blue |
| 收货、材料入库、货到 | 采购入库单 | 采购入库 | blue |
| 盘点、库存清点、对账 | 盘点单 | 库存盘点 | purple |
| 调拨、移库、仓库转移 | 调拨单 | 库存调拨 | purple |
| 组装、配套、组合 | 组装单 | 组装拆卸 | purple |
| 拆卸、拆分、成套拆散 | 拆卸单 | 组装拆卸 | purple |
| 收款、收钱、来款、到账 | 收款单 | 财务收款 | teal |
| 付款、付钱、打款、转账 | 付款单 | 财务付款 | teal |
| 报销、费用、差旅费、办公费 | 费用报销单 | 费用报销 | teal |
| 开票、开发票、增值税 | 销售发票/采购发票 | 发票 | yellow |
| 委外、外协、外加工 | 委外加工单 | 委外加工 | cyan |
| 退货、退钱、退回 | 退货单 | 退货退款 | red |
| 审批、审核、复核、签字 | 审核节点 | 审核 | yellow |

### 采购流程
1. 采购申请单 → 采购订单 → 采购入库单 → 采购发票 → 付款单
2. 采购退货流程：采购退货申请 → 采购退货出库单 → 采购退货发票

### 销售流程
1. 销售报价单 → 销售订单 → 销售出库单 → 销售发票 → 收款单
2. 销售退货流程：销售退货申请 → 销售退货入库单 → 销售退货发票

### 生产流程（工贸版）
1. 生产计划 → 生产工单（生产任务单） → 生产领料单 → 生产入库单
2. 委外加工：委外订单 → 委外发料单 → 委外入库单

### 库存流程
1. 其他入库单：盘盈、调拨入库、其他入库
2. 其他出库单：盘亏、调拨出库、其他出库
3. 调拨单：仓库间调拨
4. 组装单/拆卸单：组合件管理
5. 盘点单：库存盘点

### 财务流程
1. 收款单：销售收款、预收款、来款
2. 付款单：采购付款、预付款、打款
3. 费用报销单：日常费用报销、差旅费
4. 转账单：银行转账
5. 记账凭证：手工凭证、期末结转

### 零售流程
1. 零售POS单 → 日结 → 财务凭证

### 订货流程
1. 订货订单 → 销售出库单（发货） → 收款单
`;

// React Flow JSON 生成提示词
const REACTFLOW_PROMPT = `
你是一个专业的金蝶云星辰ERP业务流程专家，精通业务语义理解并能将业务描述转换为系统单据流程。

## 核心能力：业务语义理解

**你的首要任务是理解用户的业务描述，识别业务语义，并映射到金蝶云星辰的对应单据。**

### 语义识别规则

当用户描述业务时，你需要识别以下关键词并映射到对应单据：

**生产相关：**
- 投产、生产、制造、下达生产、排产 → 生产任务单/生产工单
- 领料、发料、材料出库 → 生产领料单
- 完工、入库、产品入库 → 生产入库单

**销售相关：**
- 销售、报价、下单 → 销售订单
- 发货、出库、送货 → 销售出库单
- 开票、发票 → 销售发票
- 收款、来款 → 收款单

**采购相关：**
- 采购、进货、买货 → 采购订单
- 收货、入库 → 采购入库单
- 付款、打款 → 付款单

**库存相关：**
- 盘点 → 盘点单
- 调拨、移库 → 调拨单
- 组装、配套 → 组装单
- 拆卸、拆分 → 拆卸单

**财务相关：**
- 费用、报销 → 费用报销单
- 转账 → 转账单

**委外相关：**
- 委外、外协、外加工 → 委外加工单

## 分支流程处理（重要）

**主线与分支的区分原则：**

1. **主线流程**：正常的业务流程，如采购→入库→付款，销售→出库→收款
2. **分支流程**：异常流程或可选流程，如退货、退款、审核不通过等

**分支流程的布局规则：**

1. **分支从主线节点水平伸出**：分支节点的 x 坐标与主线节点不同（横向偏移约 200px）
2. **分支节点垂直排列**：同一分支内的节点保持垂直对齐
3. **分支可以回到主线，也可以独立结束**
4. **常见分支场景**：
   - 采购退货：从"采购入库单"分出 → 采购退货申请 → 采购退货出库 → 结束
   - 销售退货：从"销售出库单"分出 → 销售退货申请 → 销售退货入库 → 结束
   - 审核不通过：从审核节点分出 → 退回修改 → 回到前序节点

## 布局方向规则

根据用户选择的布局方向生成对应的坐标：

### 纵向布局（vertical）- 从上到下
- 主线节点 x = 350（固定）
- 主线节点 y 从 80 开始，依次递增 90
- 分支节点 x = 350 ± 200（向右或向左偏移）
- 分支节点 y 与对应主线节点对齐或依次递增
- 连线 sourceHandle = "bottom", targetHandle = "top-in"

### 横向布局（horizontal）- 从左到右
- 主线节点 x 从 80 开始，依次递增 180
- 主线节点 y = 300（固定）
- 分支节点 y = 300 ± 120（向上或向下偏移）
- 分支节点 x 与对应主线节点对齐或依次递增
- 连线 sourceHandle = "right", targetHandle = "left-in"

## React Flow JSON 格式规范

基础结构：
\`\`\`json
{
  "nodes": [
    {
      "id": "唯一标识符",
      "type": "节点类型",
      "position": { "x": 坐标, "y": 坐标 },
      "data": { "label": "节点显示文字", "color": "颜色标识", "documentType": "单据类型", "isBranch": false }
    }
  ],
  "edges": [
    {
      "id": "边唯一标识符",
      "source": "源节点id",
      "target": "目标节点id",
      "sourceHandle": "bottom|right",
      "targetHandle": "top-in|left-in",
      "label": "连线标签（可选）"
    }
  ]
}
\`\`\`

## 节点类型与颜色对照表（语义映射）

| 业务语义 | 单据名称 | type值 | color值 | 适用场景 |
|---------|---------|-------|---------|---------|
| 开始/结束 | 开始/结束 | start/end | gray | 流程起止 |
| 投产、生产、制造、排产 | 生产任务单 | process | cyan | 生产工单 |
| 领料、发料 | 生产领料单 | process | cyan | 生产领料 |
| 完工入库 | 生产入库单 | process | cyan | 生产入库 |
| 销售、下单、报价 | 销售订单 | process | orange | 销售订单 |
| 发货、出库 | 销售出库单 | process | orange | 销售出库 |
| 开票 | 销售发票 | process | yellow | 销售发票 |
| 收款、来款 | 收款单 | process | teal | 财务收款 |
| 采购、进货 | 采购订单 | process | blue | 采购订单 |
| 收货、入库 | 采购入库单 | process | blue | 采购入库 |
| 付款、打款 | 付款单 | process | teal | 财务付款 |
| 盘点 | 盘点单 | process | purple | 库存盘点 |
| 调拨、移库 | 调拨单 | process | purple | 库存调拨 |
| 组装 | 组装单 | process | purple | 组装拆卸 |
| 拆卸 | 拆卸单 | process | purple | 组装拆卸 |
| 委外、外协 | 委外加工单 | process | cyan | 委外加工 |
| 费用、报销 | 费用报销单 | process | teal | 费用报销 |
| 退货、退款 | 退货单 | process | red | 退货退款（分支） |
| 审批、审核 | 审核节点 | process | yellow | 审批判断 |

**重要**: 
1. data 中必须包含 color、documentType 和 isBranch 字段
2. 分支节点的 isBranch 设为 true，主线节点设为 false
3. 退货类节点默认作为分支处理

## 分支流程示例（纵向布局）

**用户描述**: "采购流程，包含采购退货分支"
**生成的流程**: 
- 主线：开始 → 采购订单 → 采购入库单 → 采购发票 → 付款单 → 结束
- 分支（从采购入库单分出）：采购退货申请 → 采购退货出库 → 结束

\`\`\`json
{
  "nodes": [
    {"id": "start", "type": "start", "position": {"x": 350, "y": 80}, "data": {"label": "开始", "color": "gray", "documentType": "开始", "isBranch": false}},
    {"id": "node_1", "type": "process", "position": {"x": 350, "y": 170}, "data": {"label": "采购订单", "color": "blue", "documentType": "采购订单", "isBranch": false}},
    {"id": "node_2", "type": "process", "position": {"x": 350, "y": 260}, "data": {"label": "采购入库单", "color": "blue", "documentType": "采购入库单", "isBranch": false}},
    {"id": "node_3", "type": "process", "position": {"x": 350, "y": 350}, "data": {"label": "采购发票", "color": "yellow", "documentType": "采购发票", "isBranch": false}},
    {"id": "node_4", "type": "process", "position": {"x": 350, "y": 440}, "data": {"label": "付款单", "color": "teal", "documentType": "付款单", "isBranch": false}},
    {"id": "end", "type": "end", "position": {"x": 350, "y": 530}, "data": {"label": "结束", "color": "gray", "documentType": "结束", "isBranch": false}},
    {"id": "branch_1", "type": "process", "position": {"x": 600, "y": 260}, "data": {"label": "采购退货申请", "color": "red", "documentType": "采购退货申请", "isBranch": true}},
    {"id": "branch_2", "type": "process", "position": {"x": 600, "y": 350}, "data": {"label": "采购退货出库", "color": "red", "documentType": "采购退货出库", "isBranch": true}},
    {"id": "branch_end", "type": "end", "position": {"x": 600, "y": 440}, "data": {"label": "结束", "color": "gray", "documentType": "结束", "isBranch": true}}
  ],
  "edges": [
    {"id": "edge_1", "source": "start", "target": "node_1", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_2", "source": "node_1", "target": "node_2", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_3", "source": "node_2", "target": "node_3", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_4", "source": "node_3", "target": "node_4", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_5", "source": "node_4", "target": "end", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_b1", "source": "node_2", "target": "branch_1", "sourceHandle": "right", "targetHandle": "left-in", "label": "退货"},
    {"id": "edge_b2", "source": "branch_1", "target": "branch_2", "sourceHandle": "bottom", "targetHandle": "top-in"},
    {"id": "edge_b3", "source": "branch_2", "target": "branch_end", "sourceHandle": "bottom", "targetHandle": "top-in"}
  ]
}
\`\`\`

## 横向布局示例

\`\`\`json
{
  "nodes": [
    {"id": "start", "type": "start", "position": {"x": 80, "y": 300}, "data": {"label": "开始", "color": "gray", "documentType": "开始", "isBranch": false}},
    {"id": "node_1", "type": "process", "position": {"x": 260, "y": 300}, "data": {"label": "销售订单", "color": "orange", "documentType": "销售订单", "isBranch": false}},
    {"id": "node_2", "type": "process", "position": {"x": 440, "y": 300}, "data": {"label": "销售出库单", "color": "orange", "documentType": "销售出库单", "isBranch": false}},
    {"id": "node_3", "type": "process", "position": {"x": 620, "y": 300}, "data": {"label": "收款单", "color": "teal", "documentType": "收款单", "isBranch": false}},
    {"id": "end", "type": "end", "position": {"x": 800, "y": 300}, "data": {"label": "结束", "color": "gray", "documentType": "结束", "isBranch": false}}
  ],
  "edges": [
    {"id": "edge_1", "source": "start", "target": "node_1", "sourceHandle": "right", "targetHandle": "left-in"},
    {"id": "edge_2", "source": "node_1", "target": "node_2", "sourceHandle": "right", "targetHandle": "left-in"},
    {"id": "edge_3", "source": "node_2", "target": "node_3", "sourceHandle": "right", "targetHandle": "left-in"},
    {"id": "edge_4", "source": "node_3", "target": "end", "sourceHandle": "right", "targetHandle": "left-in"}
  ]
}
\`\`\`

## 金蝶云星辰单据参考
${KINGDEE_DOCUMENTS}

## 输出格式要求
1. 直接输出 JSON 对象，不要包含任何其他说明文字或代码块标记
2. 根据用户描述的业务语义，准确映射到对应单据
3. 识别退货、退款等异常流程作为分支处理
4. 每个节点必须包含 documentType 和 isBranch 字段
5. 根据指定的布局方向生成对应的坐标

**验证清单**（生成后必须满足）：
1. 主线节点按布局方向对齐（纵向x相同，横向y相同）
2. 分支节点水平偏移主线节点
3. 退货类节点必须作为分支（isBranch = true）
4. 连线的 sourceHandle 和 targetHandle 与布局方向匹配
5. 业务语义已正确映射到金蝶云星辰单据
`;

export async function POST(request: NextRequest) {
  try {
    const { description, layout = 'vertical' } = await request.json();

    if (!description || typeof description !== 'string') {
      return NextResponse.json({ error: '请输入业务流程描述' }, { status: 400 });
    }

    // 验证布局参数
    const validLayouts = ['vertical', 'horizontal'];
    const selectedLayout = validLayouts.includes(layout) ? layout : 'vertical';

    // 使用 HeaderUtils 正确提取认证头
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 构建消息，包含布局偏好
    const layoutHint = selectedLayout === 'horizontal' 
      ? '请使用横向布局（从左到右），主线节点y坐标固定为300，x坐标依次递增。'
      : '请使用纵向布局（从上到下），主线节点x坐标固定为350，y坐标依次递增。';

    const messages = [
      { role: 'system' as const, content: REACTFLOW_PROMPT },
      { role: 'user' as const, content: `请根据以下业务场景生成金蝶云星辰业务流程图（React Flow JSON格式）。\n\n${layoutHint}\n\n业务描述：\n${description}` }
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
