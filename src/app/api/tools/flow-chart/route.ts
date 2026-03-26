import { NextRequest, NextResponse } from 'next/server';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: '服务器配置错误，缺少 API Key' },
        { status: 500 }
      );
    }

    const systemPrompt = `你是金蝶云星辰的交付专家，精通采购、生产、MRP、委外、销售等模块的业务流程与单据。根据用户的自然语言描述，准确理解业务场景，生成清晰、结构化的流程图。流程图应采用文字或符号形式，包含节点、分支、汇聚，逻辑准确，易于理解。

【输出要求】
1. 使用文本符号绘制流程图，如：
   - 使用「├──」表示分支
   - 使用「──→」表示流向
   - 使用「◆」表示判断/分支节点
   - 使用「□」表示处理/单据节点
   - 使用「○」表示开始/结束
2. 流程图必须包含：
   - 清晰的开始和结束
   - 正确的分支判断条件
   - 分支后的汇聚点
   - 金蝶标准单据名称
3. 对于多分支流程，确保各分支逻辑完整，最终汇聚到统一节点
4. 只输出流程图文本，不要任何额外解释

请根据以下业务描述生成流程图：`;

    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('DeepSeek API 错误:', errorData);
      return NextResponse.json(
        { error: '生成流程图失败，请稍后重试' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const flowchart = data.choices[0]?.message?.content || '';

    return NextResponse.json({ 
      success: true, 
      flowchart 
    });

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
