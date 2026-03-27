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

    const systemPrompt = `生成 Mermaid 流程图代码。

【格式要求】
1. 以 graph ${mermaidDirection} 开头
2. 节点定义：
   - 开始/结束: id(["文本"])
   - 处理: id["文本"]
   - 判断: id{"文本"}
3. 连接: A --> B 或 A -->|"条件"| B
4. 仅输出代码，不输出解释

【示例】
graph TD
    start(["开始"]) --> input["输入数据"]
    input --> check{"检查格式"}
    check -->|"正确"| process["处理数据"]
    check -->|"错误"| error["报错"]
    process --> end1(["结束"])
    error --> end1`;    

    // 提取转发头

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
