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

    const systemPrompt = `你是金蝶云星辰的交付专家，精通采购、生产、MRP、委外、销售等模块的业务流程与单据。根据用户的描述，生成一份 draw.io 可加载的流程图 XML（mxGraphModel 格式）。要求节点布局清晰，连线使用正交路由，避免重叠和交叉。只输出 XML 代码，不包含任何额外解释。`;

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
