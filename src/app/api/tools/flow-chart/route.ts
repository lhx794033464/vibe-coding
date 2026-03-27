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
- 必须以 \`graph TD\`（纵向）或 \`graph LR\`（横向）开头
- 节点定义：
  - 开始/结束: id(["文本"])，如 start(["开始"])
  - 处理步骤: id["文本"]，如 input["输入数据"]
  - 判断分支: id{"文本"}，如 check{"是否有效"}
- 连接: A --> B 或 A -->|"标签"| B
- 仅输出代码，不要解释、不要 Markdown 代码块

【示例】
graph TD
    start(["开始"]) --> input["输入数据"]
    input --> check{"检查格式"}
    check -->|"有效"| process["处理数据"]
    check -->|"无效"| error["报错"]
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
    console.log('原始 Mermaid 代码:\n', mermaidCode.substring(0, 1000));

    // 清理可能的 Markdown 代码块标记和其他多余内容
    let cleanedCode = mermaidCode;
    
    // 移除开头的 ```mermaid 或 ```
    cleanedCode = cleanedCode.replace(/^```mermaid\s*\n?/i, '');
    cleanedCode = cleanedCode.replace(/^```\s*\n?/, '');
    
    // 移除结尾的 ```
    cleanedCode = cleanedCode.replace(/\n?```\s*$/i, '');
    
    // 移除开头的空行和多余空格
    cleanedCode = cleanedCode.trim();
    
    // 如果包含 GRAPH 开头，转换为小写 graph（兼容之前的提示词）
    cleanedCode = cleanedCode.replace(/^GRAPH\s+/i, 'graph ');

    // 打印清理后的代码
    console.log('清理后 Mermaid 代码:\n', cleanedCode.substring(0, 1000));

    // 验证 Mermaid 代码格式（支持 graph TD/LR/TB/RL/BT）
    const mermaidRegex = /^graph\s+(TD|TB|LR|RL|BT)/i;
    if (!mermaidRegex.test(cleanedCode)) {
      console.error('返回内容不是有效的 Mermaid 代码，前200字符:', cleanedCode.substring(0, 200));
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
