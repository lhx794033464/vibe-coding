import { NextRequest, NextResponse } from 'next/server';

// 简化的系统提示词 - 开放模型能力，不做过多限制
const SYSTEM_PROMPT = `你是一位专业的业务流程图生成专家。

## 任务
将用户的业务流程描述转换为 React Flow 可用的 JSON 数据结构。

## 输出格式
{
  "nodes": [
    {
      "id": "n1",
      "type": "start|end|process|decision",
      "position": { "x": 350, "y": 80 },
      "data": { "label": "节点名称", "color": "gray|blue|orange|cyan|teal|purple|red|yellow", "documentType": "单据类型" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "bottom", "targetHandle": "top-in", "label": "可选的条件标签" }
  ]
}

## 布局原则（参考）
- 顺序节点：垂直排列，y 坐标递增 90
- 并行节点：相同 y 坐标，x 坐标水平分布（150/350/550）
- 决策节点：type 为 "decision"，颜色为 "yellow"

## 颜色映射（参考）
- 采购/收货：blue
- 销售/发货：orange  
- 生产/委外：cyan
- 财务/收付款：teal
- 库存/盘点：purple
- 退货/异常：red
- 决策/审核：yellow
- 开始/结束：gray

## 金蝶云星辰单据参考
- 采购：采购申请单、采购订单、采购入库单、采购发票、付款单
- 销售：销售订单、销售出库单、销售发票、收款单
- 生产：生产任务单、生产领料单、生产入库单
- 委外：委外加工单、委外发料单、委外入库单
- 库存：盘点单、调拨单、组装单、拆卸单
- 财务：费用报销单、转账单、记账凭证

## 要求
1. 只输出纯 JSON，不要 markdown 代码块
2. 根据业务描述智能识别流程结构（顺序、并行、分支）
3. 节点 label 使用中文，简洁明了
4. 支持复杂的业务流程（多层并行、嵌套决策等）
5. 充分发挥你的理解和创造力`;

// DeepSeek API 配置 - 优先从环境变量读取，也可通过其他方式配置
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { description } = await request.json();

    if (!description || typeof description !== 'string') {
      return NextResponse.json({ error: '请输入业务流程描述' }, { status: 400 });
    }

    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json({ 
        error: 'DeepSeek API Key 未配置，请设置 DEEPSEEK_API_KEY 环境变量' 
      }, { status: 500 });
    }

    // 构建请求体
    const requestBody = {
      model: 'deepseek-chat',  // 使用 DeepSeek V3 模型
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请为以下业务流程生成流程图数据结构：\n\n${description}` }
      ],
      temperature: 0.7,  // 稍高的温度，让模型有更多创造性
      max_tokens: 4000,
      stream: false
    };

    // 调用 DeepSeek API
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API 错误:', errorData);
      return NextResponse.json({ 
        error: '调用 DeepSeek API 失败',
        details: errorData
      }, { status: 500 });
    }

    const data = await response.json();
    let jsonContent = data.choices?.[0]?.message?.content || '';

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
