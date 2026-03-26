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

    const systemPrompt = `你是一个专业的流程图生成助手。根据用户描述，生成 draw.io 可加载的 mxGraphModel XML 格式的流程图代码。

要求：
1. 布局为自上而下垂直排列，连线正交（无斜线）
2. 节点名称清晰，流程逻辑正确
3. 只输出 XML 内容，不要任何额外解释
4. XML 必须包含完整的 mxGraphModel 结构
5. 节点使用矩形形状（shape=rectangle）
6. 连线使用正交路由（edgeStyle=orthogonalEdgeStyle）

示例输出格式：
<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <!-- 节点和连线在这里 -->
  </root>
</mxGraphModel>`;

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
        temperature: 0.2,
        max_tokens: 4000
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
    let xml = data.choices[0]?.message?.content || '';

    // 清理可能的 markdown 代码块标记
    xml = xml.replace(/```xml\s*|\s*```/g, '').trim();

    // 验证 XML 是否包含基本的 mxGraphModel 结构
    if (!xml.includes('<mxGraphModel') || !xml.includes('</mxGraphModel>')) {
      return NextResponse.json(
        { error: '生成的流程图格式不正确' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      xml 
    });

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
