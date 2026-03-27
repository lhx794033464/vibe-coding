import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { prompt, direction = 'vertical', mode = 'generate', mermaid } = await request.json();

    // 模式1：优化 - 将 Mermaid 转换为专业 XML
    if (mode === 'optimize' && mermaid) {
      return await optimizeMermaidToXml(mermaid, direction, request.headers);
    }

    // 模式2：生成 - 生成流程图（Mermaid -> 简单 XML）
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    return await generateFlowChart(prompt, direction, request.headers);

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * 生成流程图：先生成 Mermaid，再转换为简单 XML（快速预览）
 */
async function generateFlowChart(
  prompt: string, 
  direction: 'vertical' | 'horizontal',
  headers: Headers
): Promise<NextResponse> {
  const isHorizontal = direction === 'horizontal';
  const flowDirection = isHorizontal ? 'LR' : 'TD';

  // 第一步：生成 Mermaid
  const mermaidPrompt = `你是流程图专家。根据用户描述生成 Mermaid flowchart 代码。
只输出代码，不要解释。使用 flowchart ${flowDirection} 语法。
节点命名用中文，开始用([开始])，结束用([结束])，判断用{条件}，处理用[步骤]。

用户描述：${prompt}`;

  const customHeaders = HeaderUtils.extractForwardHeaders(headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const messages = [
    { role: 'user' as const, content: mermaidPrompt }
  ];

  const mermaidResponse = await client.invoke(messages, {
    model: 'doubao-seed-2-0-pro-260215',
    temperature: 0.01,
  });

  let mermaidContent = mermaidResponse.content || '';
  
  // 提取 Mermaid 代码
  let mermaidCode = mermaidContent;
  const codeBlockMatch = mermaidContent.match(/```(?:mermaid)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    mermaidCode = codeBlockMatch[1].trim();
  } else {
    const flowchartMatch = mermaidContent.match(/flowchart\s+\w+[\s\S]*/);
    if (flowchartMatch) {
      mermaidCode = flowchartMatch[0].trim();
    }
  }

  if (!mermaidCode.includes('flowchart')) {
    console.error('生成的 Mermaid 代码无效:', mermaidContent.substring(0, 500));
    return NextResponse.json(
      { error: '生成的流程图代码格式不正确' },
      { status: 500 }
    );
  }

  // 第二步：将 Mermaid 转换为简单 XML（快速预览）
  const xmlPrompt = `将以下 Mermaid 代码转换为 draw.io mxGraphModel XML。
只输出 XML，不要解释。使用简单的自动布局，节点间距合理即可。

节点样式：
- 开始/结束：ellipse，120x60
- 判断：diamond，100x80  
- 其他：rounded=1，160x50
连接线：orthogonalEdgeStyle

Mermaid代码：
${mermaidCode}`;

  const xmlResponse = await client.invoke([
    { role: 'user' as const, content: xmlPrompt }
  ], {
    model: 'doubao-seed-2-0-pro-260215',
    temperature: 0.01,
  });

  const xmlContent = xmlResponse.content || '';
  
  // 提取 XML
  const mxGraphModelMatch = xmlContent.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
  
  if (!mxGraphModelMatch) {
    console.error('无法提取 XML:', xmlContent.substring(0, 1000));
    return NextResponse.json(
      { error: '生成流程图失败，请重试' },
      { status: 500 }
    );
  }

  let xml = mxGraphModelMatch[0].replace(/<!--[\s\S]*?-->/g, '');

  return NextResponse.json({ 
    success: true, 
    xml,
    mermaid: mermaidCode  // 返回 Mermaid 用于后续优化
  });
}

/**
 * 优化流程图：将 Mermaid 转换为专业布局的 XML
 */
async function optimizeMermaidToXml(
  mermaid: string,
  direction: 'vertical' | 'horizontal',
  headers: Headers
): Promise<NextResponse> {
  const isHorizontal = direction === 'horizontal';
  
  const layoutRules = isHorizontal 
    ? `横向布局：从左到右排列，主流程居中(y=300)，分支对称分布`
    : `纵向布局：从上到下排列，主流程居中(x=400)，分支对称分布`;

  const optimizePrompt = `你是 draw.io 专家。将 Mermaid 转换为专业的 mxGraphModel XML。

【布局要求】
${layoutRules}
- 节点居中对齐，同层节点中心点对齐
- 节点尺寸：开始/结束 120x80，判断 100x100，标准 160x60
- 连线：orthogonalEdgeStyle，无手动 points

【节点样式】
- 开始/结束：ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;
- 判断：diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;
- 标准节点：rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;
- 处理节点：rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;

只输出 XML：

${mermaid}`;

  const customHeaders = HeaderUtils.extractForwardHeaders(headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const response = await client.invoke([
    { role: 'user' as const, content: optimizePrompt }
  ], {
    model: 'doubao-seed-2-0-pro-260215',
    temperature: 0.01,
  });

  const content = response.content || '';

  // 提取 mxGraphModel
  const mxGraphModelMatch = content.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
  
  if (!mxGraphModelMatch) {
    console.error('优化失败，无法提取 XML:', content.substring(0, 1000));
    return NextResponse.json(
      { error: '优化失败，请重试' },
      { status: 500 }
    );
  }

  let xml = mxGraphModelMatch[0].replace(/<!--[\s\S]*?-->/g, '');

  return NextResponse.json({ 
    success: true, 
    xml 
  });
}
