import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { prompt, direction = 'vertical' } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    // 根据方向确定 Mermaid 方向
    const mermaidDirection = direction === 'horizontal' ? 'LR' : 'TD';

    const systemPrompt = `根据描述生成 ${mermaidDirection === 'LR' ? '横向' : '纵向'} Mermaid 流程图代码。以 graph ${mermaidDirection} 开头，仅输出代码。`;

    // 提取转发头
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 初始化 SDK 客户端
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 调用豆包 2.0 pro 模型生成 Mermaid 代码
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt }
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.1,
    });

    const mermaidCode = response.content?.trim() || '';

    // 打印原始返回内容用于调试
    console.log('Mermaid 代码:\n', mermaidCode.substring(0, 1000));

    // 验证 Mermaid 代码格式
    if (!mermaidCode.startsWith('graph')) {
      console.error('返回内容不是有效的 Mermaid 代码');
      return NextResponse.json(
        { error: '生成的流程图格式不正确' },
        { status: 500 }
      );
    }

    // 返回 Mermaid 代码，由前端通过 draw.io API 插入
    return NextResponse.json({ 
      success: true, 
      mermaid: mermaidCode
    });

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
