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

    const systemPrompt = `你是一个专业的流程图生成助手。根据用户描述的业务流程，生成 draw.io 可加载的 mxGraphModel XML 格式的流程图代码。

【输出要求】
1. 只输出纯 XML 代码，不要任何解释、Markdown 标记或代码块
2. 布局为自上而下垂直排列，连线使用正交路由（edgeStyle=orthogonalEdgeStyle）
3. 节点名称清晰，流程逻辑正确完整
4. XML 必须包含完整的 mxGraphModel 根元素

【节点样式规范】
- 开始/结束节点：使用 ellipse（圆形），style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;"
- 处理步骤：使用 rounded=1（圆角矩形），style="rounded=1;whiteSpace=wrap;html=1;"
- 判断条件：使用 diamond（菱形），style="diamond;whiteSpace=wrap;html=1;"

【示例格式】（仅供参考结构）：
<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="2" value="开始" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;" vertex="1" parent="1">
      <mxGeometry x="400" y="40" width="80" height="80" as="geometry" />
    </mxCell>
    <mxCell id="3" value="处理步骤" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="360" y="160" width="160" height="60" as="geometry" />
    </mxCell>
    <mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="2" target="3">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>

请根据以下业务流程描述生成 XML：`;

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
        temperature: 0.1,
        top_p: 0.95,
        max_tokens: 8000
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
    let content = data.choices[0]?.message?.content || '';

    // 打印原始返回内容用于调试
    console.log('DeepSeek 原始返回:', content.substring(0, 500) + '...');

    // 使用正则表达式提取 <mxGraphModel>...</mxGraphModel> 部分
    const mxGraphModelMatch = content.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
    
    if (!mxGraphModelMatch) {
      console.error('无法从返回内容中提取 mxGraphModel XML');
      return NextResponse.json(
        { error: '生成的流程图格式不正确，未能提取有效 XML' },
        { status: 500 }
      );
    }

    let xml = mxGraphModelMatch[0];

    // 清理可能的 XML 注释
    xml = xml.replace(/<!--[\s\S]*?-->/g, '');
    
    // 验证 XML 基本结构
    if (!xml.includes('<root>') || !xml.includes('</root>')) {
      console.error('提取的 XML 缺少 root 元素');
      return NextResponse.json(
        { error: '生成的流程图结构不完整' },
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
