import { NextRequest, NextResponse } from 'next/server';

// DeepSeek API 配置
const DEEPSEEK_API_KEY = 'sk-a576af7e052748d9a5a64f5171adaaa6';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * 调用 DeepSeek API
 */
async function callDeepSeek(messages: Array<{role: string; content: string}>): Promise<string> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.01,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 错误: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, direction = 'vertical' } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    const isHorizontal = direction === 'horizontal';

    const systemPrompt = `【角色定位】
你是金蝶云星辰的业务流程专家，精通采购管理、生产管理、MRP运算、库存管理等模块的业务单据与流程逻辑。你的核心任务是根据用户的自然语言描述，生成简洁专业的 Mermaid 流程图代码。

【输出规则】
1. **只输出 Mermaid 代码**，不要任何解释、Markdown 标记
2. **必须使用 flowchart 语法**（不是 graph）
3. **必须在开头添加 ELK 布局配置**：
   \`\`\`
   %%{init: {'flowchart': {'defaultRenderer': 'elk', 'curve': 'step'}}}%%
   flowchart ${isHorizontal ? 'LR' : 'TD'}
   \`\`\`
4. **必须使用泳道(subgraph)按部门划分**：
   - 销售部：销售订单、销售出库、销售退货等
   - 采购部：采购申请、采购订单、采购入库等
   - 生产部：生产任务、MRP运算、产品入库等
   - 财务部：收款单、付款单、发票等
   - 仓储部：入库、出库、调拨等
5. **线条精简规则**：
   - 避免重复连线，相同起点终点的线只画一条
   - 使用简洁的连接方式，减少交叉
6. **节点合并规则**：
   - 相同类型的单据尽量合并，如多个入库单可合并为"各类入库单"
   - 同一部门的连续处理可合并为一个节点
   - 减少不必要的中间节点
7. 节点命名规范：
   - 使用中文节点名，如 A[销售订单]
   - 判断节点使用菱形，如 B{是否有质量问题?}
   - 开始/结束使用圆角矩形，如 START([开始])
8. 连接符统一使用 --> 
9. 分支条件使用 |文字| 标注

【完整示例格式】
%%{init: {'flowchart': {'defaultRenderer': 'elk', 'curve': 'step'}}}%%
flowchart TD
    subgraph 销售部
        A[销售订单]
    end
    subgraph 生产部
        B[[MRP运算]]
    end
    subgraph 采购部
        C[采购入库单]
    end
    A --> B
    B --> C

【金蝶云星辰标准单据名称】
- 采购管理：采购申请单、采购订单、采购入库单、采购发票、付款单
- 销售管理：销售订单、销售出库单、销售发票、收款单、销售退货单
- 库存管理：生产领料单、生产退料单、产品入库单、调拨单、盘点单
- 生产管理：生产任务单、生产工单、MRP运算、计划订单、委外加工单、委外入库单
- 财务管理：凭证、日记账、应收应付单

请直接输出 Mermaid 代码（不要 \`\`\`mermaid 标记）：`;

    // 调用 DeepSeek 模型
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    console.log('开始调用 DeepSeek 生成 Mermaid...');
    const startTime = Date.now();

    const content = await callDeepSeek(messages);
    const duration = Date.now() - startTime;

    if (!content) {
      return NextResponse.json(
        { error: '生成失败，AI返回为空' },
        { status: 500 }
      );
    }

    // 清理可能的 markdown 标记
    let mermaidCode = content
      .replace(/```mermaid\s*/gi, '')
      .replace(/```\s*$/g, '')
      .trim();

    console.log('Mermaid 代码生成完成，耗时:', duration, 'ms');

    return NextResponse.json({
      success: true,
      mermaid: mermaidCode,
      duration
    });

  } catch (error) {
    console.error('生成 Mermaid 错误:', error);
    return NextResponse.json(
      { 
        error: '生成失败',
        detail: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}
