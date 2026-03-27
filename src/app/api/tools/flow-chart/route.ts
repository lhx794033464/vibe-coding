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

    const systemPrompt = `根据用户描述生成 Mermaid 流程图代码。

【语法要求】
- 必须以大写字母 GRAPH 开头，后跟方向 TD（纵向）或 LR（横向）
- 每个节点格式：
  - 开始结束: ID(["文本"])  例如：start(["开始"])
  - 处理步骤: ID["文本"]    例如：input["输入数据"]  
  - 判断分支: ID{"文本"}    例如：check{"是否有效"}
- 连接格式：SOURCE --> TARGET 或 SOURCE -->|"标签"| TARGET

【示例】
GRAPH TD
    START(["开始"]) --> INPUT["输入数据"]
    INPUT --> CHECK{"检查格式"}
    CHECK -->|"有效"| PROCESS["处理数据"]
    CHECK -->|"无效"| ERROR["报错"]
    PROCESS --> END1(["结束"])
    ERROR --> END1

【输出规则】
仅输出 Mermaid 代码，不要任何解释、不要 Markdown 代码块标记（\`\`\`）。`;    

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

    // 清理可能的 Markdown 代码块标记
    let cleanedCode = mermaidCode;
    if (cleanedCode.startsWith('```')) {
      // 移除开头的 ```mermaid 或 ```
      cleanedCode = cleanedCode.replace(/^```\w*\n?/, '');
      // 移除结尾的 ```
      cleanedCode = cleanedCode.replace(/```$/, '');
      cleanedCode = cleanedCode.trim();
    }

    // 验证 Mermaid 代码格式
    if (!cleanedCode.match(/^graph\s+(TD|TB|LR|RL|BT)/m)) {
      console.error('返回内容不是有效的 Mermaid 代码:', cleanedCode.substring(0, 200));
      return NextResponse.json(
        { error: '生成的流程图格式不正确' },
        { status: 500 }
      );
    }

    // 返回 Mermaid 代码，由前端通过 draw.io API 插入
    return NextResponse.json({ 
      success: true, 
      mermaid: cleanedCode
    });

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
