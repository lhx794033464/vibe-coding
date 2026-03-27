import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { prompt, direction = 'vertical', mode = 'mermaid', mermaid } = await request.json();

    // 模式1：将 Mermaid 转换为 XML
    if (mode === 'convert' && mermaid) {
      return await convertMermaidToXml(mermaid, direction, request.headers);
    }

    // 模式2：生成 Mermaid 代码
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    return await generateMermaid(prompt, direction, request.headers);

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * 生成 Mermaid 代码
 */
async function generateMermaid(
  prompt: string, 
  direction: 'vertical' | 'horizontal',
  headers: Headers
): Promise<NextResponse> {
  const isHorizontal = direction === 'horizontal';
  const flowDirection = isHorizontal ? 'LR' : 'TD';

  const systemPrompt = `【角色定位】
你是金蝶云星辰的业务流程专家，精通采购管理、生产管理、MRP运算、库存管理等模块的业务单据与流程逻辑。

【任务】
根据用户的自然语言描述，生成标准的 Mermaid flowchart 代码。

【输出要求】
1. 只输出纯 Mermaid 代码，不要任何解释或 Markdown 标记
2. 使用 flowchart ${flowDirection} 语法
3. 节点命名使用中文
4. 连接线使用 --> 箭头

【Mermaid 语法规范】
- 开始节点：A([开始])
- 结束节点：Z([结束])
- 判断节点：B{判断条件}
- 处理节点：C[处理步骤]
- 子流程：D[[子流程名称]]
- 连接线带标签：A -->|标签| B

【金蝶云星辰标准单据名称】
- 采购管理：采购申请单、采购订单、采购入库单、采购发票、付款单
- 销售管理：销售订单、销售出库单、销售发票、收款单
- 库存管理：生产领料单、生产退料单、产品入库单、调拨单、盘点单
- 生产管理：生产任务单、生产工单、MRP运算、计划订单

请生成流程图：`;

  const customHeaders = HeaderUtils.extractForwardHeaders(headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: prompt }
  ];

  const response = await client.invoke(messages, {
    model: 'doubao-seed-2-0-pro-260215',
    temperature: 0.01,
  });

  let content = response.content || '';

  // 提取 Mermaid 代码
  // 尝试匹配 ```mermaid ... ``` 或 ``` ... ``` 或直接 flowchart 代码
  let mermaidCode = content;
  
  // 匹配代码块
  const codeBlockMatch = content.match(/```(?:mermaid)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    mermaidCode = codeBlockMatch[1].trim();
  } else {
    // 直接提取 flowchart 开头的代码
    const flowchartMatch = content.match(/flowchart\s+\w+[\s\S]*/);
    if (flowchartMatch) {
      mermaidCode = flowchartMatch[0].trim();
    }
  }

  // 验证是否为有效的 Mermaid 代码
  if (!mermaidCode.includes('flowchart')) {
    console.error('生成的 Mermaid 代码无效:', content.substring(0, 500));
    return NextResponse.json(
      { error: '生成的 Mermaid 代码格式不正确' },
      { status: 500 }
    );
  }

  return NextResponse.json({ 
    success: true, 
    mermaid: mermaidCode 
  });
}

/**
 * 将 Mermaid 转换为 draw.io XML
 */
async function convertMermaidToXml(
  mermaid: string,
  direction: 'vertical' | 'horizontal',
  headers: Headers
): Promise<NextResponse> {
  const isHorizontal = direction === 'horizontal';
  
  const layoutRules = isHorizontal 
    ? `【横向布局规则】
- 整体从左到右水平排列
- 主流程垂直居中对齐（y=300）
- 分支流程上下对称分布
- 每个节点水平间距 160-180px
- 开始节点在左侧（x=40）`
    : `【纵向布局规则】
- 整体自上而下垂直排列
- 主流程水平居中对齐（x=400）
- 分支流程左右对称分布
- 每个节点垂直间距 100-120px
- 开始节点在顶部（y=40）`;

  const systemPrompt = `【角色定位】
你是 draw.io XML 专家，需要将 Mermaid flowchart 代码转换为专业的 draw.io mxGraphModel XML。

【输入】
用户会提供 Mermaid flowchart 代码

【输出要求】
1. 只输出纯 mxGraphModel XML 代码，不要任何解释或 Markdown 标记
2. ${layoutRules}
3. **节点居中对齐规则**：
   - 所有节点相对于中心线对称排列
   - 同层级节点中心点对齐
   - 节点尺寸统一：开始/结束 120x80px，判断节点 100x100px，标准节点 160x60px
4. **连接线规则**：
   - 使用 edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
   - 严禁定义 points 数组
   - 连接线只能是水平或垂直线段

【节点样式】
- 开始/结束：ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;
- 判断节点：diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;
- 标准节点：rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;
- 处理节点：rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;

【XML 结构示例】
<mxGraphModel dx="800" dy="600" grid="1" gridSize="10">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- 节点定义 -->
    <mxCell id="2" value="开始" style="ellipse;..." vertex="1" parent="1">
      <mxGeometry x="340" y="40" width="120" height="80" as="geometry"/>
    </mxCell>
    <!-- 连线定义 -->
    <mxCell id="3" edge="1" parent="1" source="2" target="4" style="edgeStyle=orthogonalEdgeStyle;...">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>

请将以下 Mermaid 代码转换为 XML：`;

  const customHeaders = HeaderUtils.extractForwardHeaders(headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: mermaid }
  ];

  const response = await client.invoke(messages, {
    model: 'doubao-seed-2-0-pro-260215',
    temperature: 0.01,
  });

  const content = response.content || '';

  // 提取 mxGraphModel
  const mxGraphModelMatch = content.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
  
  if (!mxGraphModelMatch) {
    console.error('无法从返回内容中提取 mxGraphModel XML');
    console.error('返回内容片段:', content.substring(0, 2000));
    
    return NextResponse.json(
      { error: '生成的流程图 XML 格式不正确' },
      { status: 500 }
    );
  }

  let xml = mxGraphModelMatch[0];
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
}
