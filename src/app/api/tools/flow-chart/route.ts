import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { recordFlowChartGenerated } from '@/services/globalStats';

/**
 * 从 AI 返回内容中提取 mxGraphModel XML
 */
function extractMxGraphModel(content: string): { xml: string | null; error: string | null } {
  if (!content || typeof content !== 'string') {
    return { xml: null, error: '返回内容为空' };
  }

  // 移除 Markdown 代码块标记
  let cleanedContent = content
    .replace(/```xml\s*/gi, '')
    .replace(/```\s*$/gm, '')
    .replace(/```/g, '')
    .trim();

  const startTag = '<mxGraphModel';
  const endTag = '</mxGraphModel>';
  
  // 查找所有 mxGraphModel 候选
  const startIndices: number[] = [];
  let searchIndex = 0;
  while ((searchIndex = cleanedContent.indexOf(startTag, searchIndex)) !== -1) {
    startIndices.push(searchIndex);
    searchIndex += startTag.length;
  }

  const candidates: string[] = [];
  for (const startIdx of startIndices) {
    const afterStart = cleanedContent.substring(startIdx + startTag.length);
    const endIdx = afterStart.indexOf(endTag);
    if (endIdx !== -1) {
      const xml = cleanedContent.substring(
        startIdx, 
        startIdx + startTag.length + endIdx + endTag.length
      );
      candidates.push(xml);
    }
  }

  // 选择最佳候选
  if (candidates.length > 0) {
    const bestCandidate = candidates.sort((a, b) => {
      const countA = (a.match(/<mxCell/g) || []).length;
      const countB = (b.match(/<mxCell/g) || []).length;
      return countB - countA;
    })[0];
    return { xml: bestCandidate, error: null };
  }

  // 尝试基于索引提取
  if (cleanedContent.includes(startTag)) {
    const startIndex = cleanedContent.indexOf(startTag);
    const endIndex = cleanedContent.lastIndexOf(endTag);
    if (endIndex > startIndex) {
      const xml = cleanedContent.substring(startIndex, endIndex + endTag.length);
      return { xml, error: null };
    }
  }

  return { 
    xml: null, 
    error: `无法提取有效 XML。内容长度: ${content.length}` 
  };
}

/**
 * 从 XML 中提取节点信息
 */
function extractNodesFromXml(xml: string): Array<{
  id: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'node' | 'edge';
}> {
  const nodes: Array<{
    id: string;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'node' | 'edge';
  }> = [];

  // 匹配 mxCell 节点
  const nodeRegex = /<mxCell[^>]*vertex="1"[^>]*>/g;
  let match;
  while ((match = nodeRegex.exec(xml)) !== null) {
    const cellStr = match[0];
    const idMatch = cellStr.match(/id="([^"]+)"/);
    const valueMatch = cellStr.match(/value="([^"]*)"/);
    
    // 提取 geometry
    const geometryMatch = xml.substring(match.index).match(/<mxGeometry[^>]*>/);
    if (geometryMatch) {
      const geoStr = geometryMatch[0];
      const xMatch = geoStr.match(/x="([^"]+)"/);
      const yMatch = geoStr.match(/y="([^"]+)"/);
      const widthMatch = geoStr.match(/width="([^"]+)"/);
      const heightMatch = geoStr.match(/height="([^"]+)"/);
      
      nodes.push({
        id: idMatch?.[1] || '',
        value: valueMatch?.[1] || '',
        x: parseFloat(xMatch?.[1] || '0'),
        y: parseFloat(yMatch?.[1] || '0'),
        width: parseFloat(widthMatch?.[1] || '0'),
        height: parseFloat(heightMatch?.[1] || '0'),
        type: 'node'
      });
    }
  }

  return nodes.sort((a, b) => b.y - a.y); // 按Y坐标降序，找最下面的节点
}

/**
 * 提取最后一个主流程节点
 */
function findLastMainNode(nodes: Array<{id: string; value: string; x: number; y: number}>): {
  id: string;
  value: string;
  x: number;
  y: number;
} | null {
  if (nodes.length === 0) return null;
  
  // 找到Y坐标最大（最下面）且X坐标居中（主流程）的节点
  const mainX = 400; // 假设主流程在 x=400 附近
  const mainNodes = nodes.filter(n => Math.abs(n.x - mainX) < 100);
  
  if (mainNodes.length === 0) return nodes[0]; // 如果没有明显的居中节点，返回最下面的
  
  return mainNodes.reduce((max, node) => node.y > max.y ? node : max);
}

/**
 * 合并两个XML片段
 */
function mergeXmlParts(firstXml: string, secondXml: string): string {
  // 提取第一个XML的节点和边
  const firstRootMatch = firstXml.match(/<root>([\s\S]*?)<\/root>/);
  const secondRootMatch = secondXml.match(/<root>([\s\S]*?)<\/root>/);
  
  if (!firstRootMatch || !secondRootMatch) {
    throw new Error('无法提取 root 元素');
  }

  // 解析第一个XML的节点，找到最大ID
  const firstCells = firstRootMatch[1];
  const idMatches = firstCells.match(/id="(\d+)"/g);
  let maxId = 0;
  if (idMatches) {
    maxId = Math.max(...idMatches.map(m => parseInt(m.match(/\d+/)?.[0] || '0')));
  }

  // 对第二个XML的节点ID进行偏移
  let secondCells = secondRootMatch[1];
  const secondIdMap = new Map<string, string>();
  
  // 找到第二个XML中所有的ID
  const secondIds = [...secondCells.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const uniqueSecondIds = [...new Set(secondIds)];
  
  // 生成新的ID映射（跳过 parent 和 0、1）
  for (const id of uniqueSecondIds) {
    if (id === '0' || id === '1') continue;
    if (!secondIdMap.has(id)) {
      maxId++;
      secondIdMap.set(id, maxId.toString());
    }
  }

  // 替换第二个XML中的ID
  for (const [oldId, newId] of secondIdMap) {
    // 替换 id="xxx"
    secondCells = secondCells.replace(new RegExp(`id="${oldId}"`, 'g'), `id="${newId}"`);
    // 替换 parent="xxx"
    secondCells = secondCells.replace(new RegExp(`parent="${oldId}"`, 'g'), `parent="${newId}"`);
    // 替换 source="xxx"
    secondCells = secondCells.replace(new RegExp(`source="${oldId}"`, 'g'), `source="${newId}"`);
    // 替换 target="xxx"
    secondCells = secondCells.replace(new RegExp(`target="${oldId}"`, 'g'), `target="${newId}"`);
  }

  // 合并cells（移除第二个的 root 开始标记中的 parent="0" cell）
  const cleanSecondCells = secondCells
    .replace(/<mxCell id="0"\/>/, '')
    .replace(/<mxCell id="1" parent="0"\/>/, '');

  // 构建合并后的XML
  const mergedRoot = firstRootMatch[1] + cleanSecondCells;
  
  // 提取第一个XML的头部属性
  const headerMatch = firstXml.match(/<mxGraphModel([^>]*)>/);
  const header = headerMatch ? headerMatch[1] : '';
  
  return `<mxGraphModel${header}>\n  <root>\n${mergedRoot}\n  </root>\n</mxGraphModel>`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      prompt, 
      direction = 'vertical', 
      batchMode = false,
      batchIndex = 0,
      previousNodes = null 
    } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    // 分批生成模式
    if (batchMode) {
      return handleBatchGeneration(
        prompt, 
        direction, 
        batchIndex, 
        previousNodes, 
        request
      );
    }

    // 普通单次生成（保持向后兼容）
    return handleSingleGeneration(prompt, direction, request);

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * 处理单次生成（普通模式）
 */
async function handleSingleGeneration(
  prompt: string, 
  direction: string, 
  request: NextRequest
) {
  const systemPrompt = buildSystemPrompt(direction, false);
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
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

  const content = response.content || '';
  
  if (!content) {
    return NextResponse.json(
      { error: 'AI 返回内容为空' },
      { status: 500 }
    );
  }

  const { xml, error } = extractMxGraphModel(content);
  
  if (!xml || error) {
    // 如果单次生成失败且内容很长，建议分批生成
    if (content.length > 8000) {
      return NextResponse.json({
        error: '流程图太复杂，单次生成失败',
        detail: '建议使用分批生成模式（batchMode: true）',
        suggestBatch: true,
        contentLength: content.length
      }, { status: 500 });
    }
    return NextResponse.json({ error: error || '提取 XML 失败' }, { status: 500 });
  }

  recordFlowChartGenerated();

  return NextResponse.json({ success: true, xml });
}

/**
 * 处理分批生成
 */
async function handleBatchGeneration(
  prompt: string,
  direction: string,
  batchIndex: number,
  previousNodes: any,
  request: NextRequest
) {
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  // 第一批：生成主干流程（18个节点）
  if (batchIndex === 0) {
    const systemPrompt = buildBatchSystemPrompt(direction, 0);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt }
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.01,
    });

    const content = response.content || '';
    if (!content) {
      return NextResponse.json({ error: '第一批生成失败' }, { status: 500 });
    }

    const { xml, error } = extractMxGraphModel(content);
    if (!xml || error) {
      return NextResponse.json({ error: error || '第一批提取失败' }, { status: 500 });
    }

    // 提取最后一个节点信息
    const nodes = extractNodesFromXml(xml);
    const lastNode = findLastMainNode(nodes);

    recordFlowChartGenerated();

    return NextResponse.json({
      success: true,
      xml: xml,
      batchComplete: false,
      nextBatchIndex: 1,
      lastNode: lastNode,
      totalNodes: nodes.length
    });
  }

  // 第二批及以后：续写剩余流程
  if (batchIndex >= 1 && previousNodes) {
    const systemPrompt = buildBatchSystemPrompt(direction, batchIndex, previousNodes);
    
    // 构建续写提示词
    const continuePrompt = buildContinuePrompt(prompt, previousNodes, batchIndex);
    
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: continuePrompt }
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.01,
    });

    const content = response.content || '';
    if (!content) {
      return NextResponse.json({ error: `第${batchIndex + 1}批生成失败` }, { status: 500 });
    }

    const { xml: secondXml, error } = extractMxGraphModel(content);
    if (!secondXml || error) {
      return NextResponse.json({ error: error || `第${batchIndex + 1}批提取失败` }, { status: 500 });
    }

    // 合并XML
    const firstXml = previousNodes.firstXml;
    const mergedXml = mergeXmlParts(firstXml, secondXml);

    recordFlowChartGenerated();

    // 检查是否还有更多节点需要生成
    const nodes = extractNodesFromXml(mergedXml);
    const lastNode = findLastMainNode(nodes);
    const hasMoreNodes = content.length > 8000 || nodes.length > 25;

    return NextResponse.json({
      success: true,
      xml: mergedXml,
      firstXml: previousNodes.firstXml, // 传递原始第一批XML供后续批次使用
      batchComplete: !hasMoreNodes,
      nextBatchIndex: hasMoreNodes ? batchIndex + 1 : null,
      lastNode: lastNode,
      totalNodes: nodes.length
    });
  }

  return NextResponse.json({ error: '无效的分批参数' }, { status: 400 });
}

/**
 * 构建分批生成的续写提示词
 */
function buildContinuePrompt(
  originalPrompt: string, 
  previousNodes: any, 
  batchIndex: number
): string {
  const lastNode = previousNodes.lastNode;
  
  return `【续写任务 - 第${batchIndex + 1}批】

原始流程描述：
${originalPrompt}

上一批生成的最后一个节点信息：
- 节点ID: ${lastNode?.id || '未知'}
- 节点名称: ${lastNode?.value || '未知'}
- 位置: x=${lastNode?.x || 0}, y=${lastNode?.y || 0}

要求：
1. 从上一个节点"${lastNode?.value || '最后一个节点'}"之后继续生成流程
2. 保持坐标连续性，新节点 Y 坐标应大于 ${lastNode?.y || 0}
3. 添加连接线将上一个节点连接到新生成的第一个节点
4. 最多生成 15 个新节点
5. 如果流程已经完整（有结束节点），直接返回结束标记

请生成续写的 mxGraphModel XML（只输出XML代码）：`;
}

/**
 * 构建分批生成的系统提示词
 */
function buildBatchSystemPrompt(
  direction: string, 
  batchIndex: number,
  previousNodes?: any
): string {
  const isHorizontal = direction === 'horizontal';
  
  const layoutRules = isHorizontal 
    ? `【横向布局规则】
- 整体从左到右水平排列
- 主流程垂直居中对齐（y=300）
- 分支流程上下对称分布
- 每个节点水平间距 160-180px`
    : `【纵向布局规则】
- 整体自上而下垂直排列
- 主流程水平居中对齐（x=400）
- 分支流程左右对称分布
- 每个节点垂直间距 100-120px`;

  if (batchIndex === 0) {
    return `【角色定位】
你是金蝶云星辰的业务流程专家。请根据用户描述生成流程图的第一批节点（主干流程）。

【任务要求】
1. 生成流程的**主干节点**，约 15-18 个节点
2. 优先包含：开始、核心业务流程、主要判断节点
3. 次要分支（如异常处理、边缘场景）可以暂时省略
4. 确保最后一个节点是主流程的重要节点（不要是结束节点，除非流程真的很短）

${layoutRules}

【节点样式规范】
- 开始/结束：椭圆，fillColor=#f5f5f5
- 金蝶单据：圆角矩形，fillColor=#dae8fc
- 判断节点：菱形，fillColor=#fff2cc
- 处理节点：矩形，fillColor=#e1d5e7

【输出要求】
只输出完整的 mxGraphModel XML，包含完整的节点和连线。`;
  }

  // 续写批次的提示词
  return `【角色定位】
你是金蝶云星辰的业务流程专家。请续写流程图的剩余部分。

【任务要求】
1. 从上一批的终点继续生成剩余流程节点
2. 保持与上一批的坐标、样式一致性
3. 添加连接线将上一批终点与这一批起点连接
4. 生成剩余的所有节点，直到流程结束
5. 最多生成 15 个新节点

${layoutRules}

【重要规则】
- 新节点的 ID 从 "${previousNodes?.lastNode?.id ? parseInt(previousNodes.lastNode.id) + 1 : 'n20'}" 开始
- 新节点 Y 坐标必须大于上一批最后一个节点的 Y 坐标
- 必须添加边（edge）连接上一批终点和这一批起点

【节点样式规范】
- 开始/结束：椭圆，fillColor=#f5f5f5
- 金蝶单据：圆角矩形，fillColor=#dae8fc
- 判断节点：菱形，fillColor=#fff2cc
- 处理节点：矩形，fillColor=#e1d5e7

【输出要求】
只输出完整的 mxGraphModel XML（只包含这一批的新节点）。`;
}

/**
 * 构建普通单次生成的系统提示词
 */
function buildSystemPrompt(direction: string, isStreaming: boolean = false): string {
  const isHorizontal = direction === 'horizontal';
  
  const layoutRules = isHorizontal 
    ? `【横向布局规则】
- 整体从左到右水平排列
- 主流程垂直居中对齐（y=300）
- 分支流程上下对称分布
- 每个节点水平间距 160-180px`
    : `【纵向布局规则】
- 整体自上而下垂直排列
- 主流程水平居中对齐（x=400）
- 分支流程左右对称分布
- 每个节点垂直间距 100-120px`;

  return `【角色定位】
你是金蝶云星辰的业务流程专家。

【能力要求】
1. 语义理解：从用户描述中提取关键业务对象、动作和逻辑分支
2. 流程匹配：将用户意图映射到金蝶云星辰标准流程节点
3. 分支对称处理：确保分支节点数量相等或视觉长度相同
4. 专业命名：所有节点必须使用金蝶云星辰标准单据名称

【输出要求】
1. **只输出一个完整的 mxGraphModel XML 代码块**
2. **XML 必须是完整且有效的**，包含完整的 <mxGraphModel>...</mxGraphModel> 和 <root>...</root>
3. ${layoutRules}
4. **节点居中对齐规则**：
   - 所有节点必须相对于中心线对称排列
   - 节点尺寸统一：开始/结束120x80px，判断100x100px，单据160x60px，处理140x60px
5. **连接线路由规则**：
   - 所有连线style包含：edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
   - **严禁在edge中定义points数组**

【节点数量限制 - 强制要求】
- **绝对限制：最多 18 个节点**（单次生成）
- 如果流程超过 18 个节点，必须合并相似节点、删除次要分支
- 优先保证 XML 结构完整闭合

【节点样式规范】
- 开始/结束：椭圆，style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;"
- 金蝶单据：圆角矩形，style="rounded=1;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;" 
- 判断节点：菱形，style="diamond;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;"
- 处理节点：矩形，style="rounded=0;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;"

请直接输出完整的 mxGraphModel XML（只输出XML代码，不要任何其他内容）：`;
}
