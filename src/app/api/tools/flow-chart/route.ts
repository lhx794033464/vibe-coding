import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { recordFlowChartGenerated } from '@/services/globalStats';

// 模型配置：主模型 + 降级模型
const PRIMARY_MODEL = 'doubao-seed-2-0-pro-260215';
const FALLBACK_MODEL = 'deepseek-v3-2-251201'; // 平衡推理能力与输出长度

// 最大重试次数
const MAX_RETRIES = 2;

/**
 * 流式调用大模型生成流程图
 * 流式模式可以突破 invoke() 的 max_tokens 限制
 */
async function callLLMStream(
  messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}>,
  customHeaders: Record<string, string>,
  model: string = PRIMARY_MODEL
): Promise<string> {
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  let fullContent = '';
  const stream = client.stream(messages, {
    model,
    temperature: 0.01,
  });

  for await (const chunk of stream) {
    if (chunk.content) {
      fullContent += chunk.content.toString();
    }
  }

  return fullContent;
}

/**
 * 非流式调用（降级方案）
 */
async function callLLMInvoke(
  messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}>,
  customHeaders: Record<string, string>,
  model: string = PRIMARY_MODEL
): Promise<string> {
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const response = await client.invoke(messages, {
    model,
    temperature: 0.01,
  });

  return response.content || '';
}

/**
 * 从 AI 返回内容中提取 mxGraphModel XML
 * 支持多种格式：直接 XML、Markdown 代码块、嵌套结构、截断内容等
 */
function extractMxGraphModel(content: string): { xml: string | null; error: string | null; isTruncated: boolean } {
  if (!content || typeof content !== 'string') {
    return { xml: null, error: '返回内容为空', isTruncated: false };
  }

  console.log('AI 返回内容总长度:', content.length);

  // 步骤1: 移除 Markdown 代码块标记
  let cleanedContent = content
    .replace(/```xml\s*/gi, '')
    .replace(/```\s*$/gm, '')
    .replace(/```/g, '')
    .trim();

  // 步骤2: 查找所有 <mxGraphModel> 的起始位置
  const startTag = '<mxGraphModel';
  const endTag = '</mxGraphModel>';
  
  const startIndices: number[] = [];
  let searchIndex = 0;
  while ((searchIndex = cleanedContent.indexOf(startTag, searchIndex)) !== -1) {
    startIndices.push(searchIndex);
    searchIndex += startTag.length;
  }

  // 步骤3: 对每个起始位置，尝试找到匹配的闭合标签
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

  // 步骤4: 选择最佳候选（包含最多 mxCell 的）
  if (candidates.length > 0) {
    const bestCandidate = candidates.sort((a, b) => {
      const countA = (a.match(/<mxCell/g) || []).length;
      const countB = (b.match(/<mxCell/g) || []).length;
      return countB - countA;
    })[0];
    
    console.log('选择最佳候选，包含 mxCell 数量:', (bestCandidate.match(/<mxCell/g) || []).length);
    return { xml: bestCandidate, error: null, isTruncated: false };
  }

  // 步骤5: 没有完整闭合标签 - 可能是截断
  if (cleanedContent.includes(startTag)) {
    const startIndex = cleanedContent.indexOf(startTag);
    const hasEndTag = cleanedContent.includes(endTag);
    const endIndex = cleanedContent.lastIndexOf(endTag);
    
    if (endIndex > startIndex) {
      const xml = cleanedContent.substring(startIndex, endIndex + endTag.length);
      console.log('通过索引提取 mxGraphModel，长度:', xml.length);
      return { xml, error: null, isTruncated: false };
    }

    // 检测截断：有开始标签但没有闭合标签
    if (!hasEndTag || endIndex <= startIndex) {
      console.warn('检测到可能截断的 XML，尝试修复...');
      
      let xml = cleanedContent.substring(startIndex);
      
      // 尝试修复截断的 XML
      // 1. 找到最后一个完整的 </mxCell> 标签
      const lastCompleteCell = xml.lastIndexOf('</mxCell>');
      if (lastCompleteCell > 0) {
        xml = xml.substring(0, lastCompleteCell + '</mxCell>'.length);
      }
      
      // 2. 确保有 </root> 和 </mxGraphModel> 闭合标签
      if (!xml.includes('</root>')) {
        xml += '</root>';
      }
      if (!xml.includes('</mxGraphModel>')) {
        xml += '</mxGraphModel>';
      }
      
      const cellCount = (xml.match(/<mxCell/g) || []).length;
      console.log('修复截断 XML，包含 mxCell 数量:', cellCount);
      
      if (cellCount >= 3) {
        return { xml, error: null, isTruncated: true };
      }
    }
  }

  // 所有提取方法都失败
  console.error('无法提取 mxGraphModel，内容片段:', cleanedContent.substring(0, 500));
  return { 
    xml: null, 
    error: `无法从返回内容中提取有效 XML。内容长度: ${content.length}`,
    isTruncated: false
  };
}

/**
 * 转义 XML 属性值中的特殊字符
 */
function escapeXmlAttributes(xml: string): string {
  return xml.replace(
    /value="([^"]*)"/g,
    (match, content) => {
      const unescaped = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      
      const escaped = unescaped
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      return `value="${escaped}"`;
    }
  );
}

/**
 * 根据节点实际坐标动态调整画布尺寸
 * 解决：长流程图节点超出默认 pageHeight(1100) 时，
 * orthogonalEdgeStyle 连线路由计算失败导致边不显示的问题
 */
function adjustCanvasSize(xml: string, isSwimlane: boolean = false): string {
  // 提取所有节点的坐标
  const cellPattern = /<mxCell\s([^>]*?)>([\s\S]*?)<\/mxCell>/g;
  let match: RegExpExecArray | null;
  let maxX = 0;
  let maxY = 0;

  while ((match = cellPattern.exec(xml)) !== null) {
    const attrs = match[1];
    const inner = match[2];

    // 只处理 vertex 节点
    if (!/vertex="1"/.test(attrs)) continue;

    const xMatch = inner.match(/x="(\d+)"/);
    const yMatch = inner.match(/y="(\d+)"/);
    const wMatch = inner.match(/width="(\d+)"/);
    const hMatch = inner.match(/height="(\d+)"/);

    const x = xMatch ? parseInt(xMatch[1]) : 0;
    const y = yMatch ? parseInt(yMatch[1]) : 0;
    const w = wMatch ? parseInt(wMatch[1]) : 100;
    const h = hMatch ? parseInt(hMatch[1]) : 60;

    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  // 加上边距（泳道图需要更大的边距）
  const padding = isSwimlane ? 300 : 200;
  const neededWidth = maxX + padding;
  const neededHeight = maxY + padding;

  // 默认页面尺寸
  const defaultPageWidth = 850;
  const defaultPageHeight = 1100;

  // 泳道图默认使用更大的页面
  const minPageWidth = isSwimlane ? 1600 : defaultPageWidth;
  const minPageHeight = isSwimlane ? 1400 : defaultPageHeight;

  const newPageWidth = Math.max(minPageWidth, neededWidth);
  const newPageHeight = Math.max(minPageHeight, neededHeight);

  // dx/dy 是编辑器视口偏移，设为页面尺寸的合理倍数以支持滚动查看
  const newDx = Math.max(1200, newPageWidth);
  const newDy = Math.max(800, newPageHeight);

  // 替换 mxGraphModel 的属性
  let adjusted = xml;

  // 替换 pageHeight
  adjusted = adjusted.replace(
    /pageHeight="\d+"/,
    `pageHeight="${newPageHeight}"`
  );

  // 替换 pageWidth
  adjusted = adjusted.replace(
    /pageWidth="\d+"/,
    `pageWidth="${newPageWidth}"`
  );

  // 替换 dx
  adjusted = adjusted.replace(
    /dx="\d+"/,
    `dx="${newDx}"`
  );

  // 替换 dy
  adjusted = adjusted.replace(
    /dy="\d+"/,
    `dy="${newDy}"`
  );

  return adjusted;
}

/**
 * 解析 mxCell 元素，正确区分自闭合标签 <mxCell ... /> 和开闭标签 <mxCell ...>...</mxCell>
 * 返回所有非根节点的 mxCell 信息
 */
function parseMxCells(xml: string): Array<{
  fullMatch: string;
  attrs: string;
  inner: string;
  id: string;
  parent: string;
  value: string;
  isSwimlane: boolean;
  isEdge: boolean;
  isVertex: boolean;
}> {
  const results: Array<{
    fullMatch: string;
    attrs: string;
    inner: string;
    id: string;
    parent: string;
    value: string;
    isSwimlane: boolean;
    isEdge: boolean;
    isVertex: boolean;
  }> = [];

  // 匹配开闭标签 <mxCell ...>...</mxCell>，排除自闭合 <mxCell ... />
  // 先将自闭合标签临时替换，再匹配，最后恢复
  const placeholder = '__SELF_CLOSE_PLACEHOLDER__';
  const selfClosePattern = /<mxCell\s[^>]*\/>/g;
  const xmlWithoutSelfClose = xml.replace(selfClosePattern, placeholder);
  
  const openClosePattern = /<mxCell\s([^>]*?)>([\s\S]*?)<\/mxCell>/g;
  let match: RegExpExecArray | null;
  while ((match = openClosePattern.exec(xmlWithoutSelfClose)) !== null) {
    const attrs = match[1];
    const inner = match[3] || '';
    const idM = attrs.match(/id="([^"]+)"/);
    const parentM = attrs.match(/parent="([^"]+)"/);
    const valueM = attrs.match(/value="([^"]*)"/);

    const id = idM ? idM[1] : '';
    const parent = parentM ? parentM[1] : '1';
    const value = valueM ? valueM[1] : '';
    const isEdge = /edge="1"/.test(attrs);
    const isVertex = /vertex="1"/.test(attrs);
    const isSwimlane = /swimlane|swimline|shape=mxgraph\.flowchart\.annotation/i.test(attrs + inner);

    if (id && id !== '0' && id !== '1') {
      results.push({ fullMatch: match[0], attrs, inner, id, parent, value, isSwimlane, isEdge, isVertex });
    }
  }

  return results;
}

/**
 * 泳道图后处理：
 * 1. 确保边的 parent 属性正确
 * 2. 将泳道标题整合到泳道容器的 value 属性中
 */
function fixSwimlaneEdges(xml: string): string {
  // 1. 解析所有 mxCell 元素
  const cells = parseMxCells(xml);

  const swimlaneChildren = new Map<string, string>(); // nodeId -> swimlaneId
  const swimlanes = new Set<string>();

  for (const cell of cells) {
    // 记录泳道容器
    if (cell.isSwimlane) {
      swimlanes.add(cell.id);
    }
    // 记录节点属于哪个泳道
    if (cell.parent !== '0' && cell.parent !== '1') {
      swimlaneChildren.set(cell.id, cell.parent);
    }
  }

  // 2. 修复边的 parent
  // 对于跨泳道的边，确保 parent="1"
  // 对于同泳道的边，parent 设为该泳道 id
  let fixed = xml;
  const edgePattern = /<mxCell\s([^>]*?)edge="1"([^>]*?)>([\s\S]*?)<\/mxCell>/g;

  fixed = fixed.replace(edgePattern, (fullMatch, before: string, after: string, inner: string) => {
    const allAttrs = before + after;
    const sourceMatch = allAttrs.match(/source="([^"]+)"/);
    const targetMatch = allAttrs.match(/target="([^"]+)"/);

    if (!sourceMatch || !targetMatch) return fullMatch;

    const sourceSwimlane = swimlaneChildren.get(sourceMatch[1]);
    const targetSwimlane = swimlaneChildren.get(targetMatch[1]);

    let correctParent: string;
    if (sourceSwimlane && targetSwimlane && sourceSwimlane === targetSwimlane) {
      // 同一泳道内
      correctParent = sourceSwimlane;
    } else {
      // 跨泳道
      correctParent = '1';
    }

    // 替换或添加 parent 属性
    const parentMatch = allAttrs.match(/parent="([^"]+)"/);
    if (parentMatch) {
      const currentParent = parentMatch[1];
      if (currentParent !== correctParent) {
        // 替换 parent
        return fullMatch.replace(/parent="[^"]+"/, `parent="${correctParent}"`);
      }
    }

    return fullMatch;
  });

  // 3. 泳道标题整合：将泳道容器内的标题文本节点合并到泳道的 value 属性
  fixed = integrateSwimlaneTitles(fixed);

  return fixed;
}

/**
 * 将泳道内独立的标题文本节点整合到泳道容器的 value 属性
 * 并移除该独立标题节点
 */
function integrateSwimlaneTitles(xml: string): string {
  const cells = parseMxCells(xml);
  
  // 找出所有泳道容器
  const swimlaneIds = new Set<string>();
  const swimlaneValues = new Map<string, string>(); // swimlaneId -> 当前 value
  
  for (const cell of cells) {
    if (cell.isSwimlane) {
      swimlaneIds.add(cell.id);
      swimlaneValues.set(cell.id, cell.value);
    }
  }
  
  // 找到需要整合的标题节点（在泳道内且是文本样式、部门名称的节点）
  let result = xml;
  for (const cell of cells) {
    // 标题节点特征：vertex=1，没有明显业务语义（像部门名称），位于泳道容器内
    // 通过 parent 归属于泳道、value 短文本（<=10字）、可能是文本样式或普通样式来判断
    const isTitleNode = cell.isVertex && !cell.isEdge
      && cell.value.length > 0 && cell.value.length <= 10
      && swimlaneIds.has(cell.parent)
      // 排除包含"单""流程"等业务语义的节点（这些是流程步骤不是标题）
      && !/单|流程|通知|审批|检验|入库|执行|确认|退货|返工|订单|领料/.test(cell.value);

    if (isTitleNode) {
      const swimlaneId = cell.parent;
      const currentValue = swimlaneValues.get(swimlaneId) || '';
      
      // 只有当泳道容器的 value 为空时才整合
      if (!currentValue || currentValue.trim() === '') {
        // 将标题文本设置到泳道的 value 属性
        result = result.replace(
          new RegExp(`(<mxCell\\s[^>]*?id="${swimlaneId}"[^>]*?)value="[^"]*"`, 'i'),
          `$1value="${cell.value}"`
        );
        // 更新 swimlaneValues 以供后续判断
        swimlaneValues.set(swimlaneId, cell.value);
      }
      
      // 移除独立的标题节点
      result = result.replace(cell.fullMatch, '');
    }
  }
  
  return result;
}

/**
 * 验证和清理 XML
 */
function validateAndCleanXml(xml: string, isSwimlane: boolean = false): { xml: string | null; error: string | null } {
  let cleaned = xml.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n').trim();
  cleaned = escapeXmlAttributes(cleaned);

  if (!cleaned.includes('<mxGraphModel')) {
    return { xml: null, error: 'XML 缺少 mxGraphModel 根元素' };
  }

  // 确保只有一个 mxGraphModel（取第一个）
  const firstStart = cleaned.indexOf('<mxGraphModel');
  const firstEnd = cleaned.indexOf('</mxGraphModel>');
  if (firstStart >= 0 && firstEnd > firstStart) {
    const secondStart = cleaned.indexOf('<mxGraphModel', firstStart + 1);
    if (secondStart > 0 && secondStart < firstEnd) {
      cleaned = cleaned.substring(firstStart, firstEnd + '</mxGraphModel>'.length);
    }
  }

  if (!cleaned.includes('<root>') || !cleaned.includes('</root>')) {
    if (!cleaned.includes('<root>')) {
      cleaned = cleaned.replace(
        '</mxGraphModel>',
        '<root><mxCell id="0" /><mxCell id="1" parent="0" /></root></mxGraphModel>'
      );
    }
  }

  if (!cleaned.includes('mxCell')) {
    return { xml: null, error: 'XML 缺少 mxCell 元素' };
  }

  // 泳道图后处理：确保跨泳道连线的 parent 为 "1"
  if (isSwimlane) {
    cleaned = fixSwimlaneEdges(cleaned);
  }

  // 根据节点坐标动态调整画布尺寸，修复长流程图连线不显示问题
  cleaned = adjustCanvasSize(cleaned, isSwimlane);

  return { xml: cleaned, error: null };
}

/**
 * 生成精简版系统提示词
 * 策略：减少冗余描述，使用缩写样式，降低 token 消耗
 */
function buildSystemPrompt(direction: 'vertical' | 'horizontal'): string {
  const layoutRule = direction === 'horizontal'
    ? '横向布局：从左到右，主流程y=300居中，分支y=150/450，节点水平间距160px'
    : '纵向布局：从上到下，主流程x=400居中，分支x=200/600，节点垂直间距110px';

  return `你是金蝶云星辰业务流程专家，生成draw.io流程图XML。

规则：
1.只输出完整mxGraphModel XML，无解释无Markdown
2.${layoutRule}
3.节点尺寸：开始/结束120x80，判断100x100，单据160x60，处理140x60
4.分支对称，条件用value标注在连线上
5.连线style含edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
6.禁止edge中定义points数组，判断节点出边设不同exitX/exitY
7.输出紧凑XML，无需缩进换行，id用简短数字

样式：
开始/结束：ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;
单据：rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;
判断：diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;
处理：rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;

金蝶单据：采购申请单/采购订单/采购入库单/采购发票/付款单/销售订单/销售出库单/销售发票/收款单/销售退货单/生产领料单/生产退料单/产品入库单/调拨单/盘点单/生产任务单/生产工单/MRP运算/计划订单/委外加工单/委外入库单/凭证/日记账/应收应付单

直接输出XML：`;
}

/**
 * 生成泳道图系统提示词
 * 泳道按部门划分，每个部门是一个水平泳道容器
 */
function buildSwimlanePrompt(direction: 'vertical' | 'horizontal'): string {
  const layoutRule = direction === 'horizontal'
    ? '横向泳道：每列一个部门，从左到右排列，流程从上到下在各列中展开'
    : '纵向泳道：每行一个部门，从上到下排列，流程从左到右在各行中展开';

  return `你是金蝶云星辰业务流程专家，生成draw.io泳道流程图XML。

规则：
1.只输出完整mxGraphModel XML，无解释无Markdown
2.${layoutRule}
3.先识别流程中涉及的部门，为每个部门创建一个swimlane容器
4.节点放在所属部门的swimlane内（parent=该swimlane的id），跨部门节点放在流程起止部门
5.连线跨泳道时source和target用对应节点id，parent统一为"1"
6.输出紧凑XML，无需缩进换行，id用简短数字

泳道容器样式：
swimline容器：shape=mxgraph.flowchart.annotation_2;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;fontStyle=1;spacingLeft=10;rounded=1;arcSize=6;
泳道标题文字用独立的mxCell，放在泳道顶部，style：text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;fontSize=13;fontStyle=1;

节点样式（放在泳道内部）：
开始/结束：ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;
单据：rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;
判断：diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;
处理：rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;

连线样式：edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;

部门参考：采购部/销售部/生产部/仓储部/财务部/质检部/管理层/信息部
金蝶单据：采购申请单/采购订单/采购入库单/采购发票/付款单/销售订单/销售出库单/销售发票/收款单/销售退货单/生产领料单/生产退料单/产品入库单/调拨单/盘点单/生产任务单/生产工单/MRP运算/计划订单/委外加工单/委外入库单/凭证/日记账/应收应付单

泳道布局参考（${direction === 'horizontal' ? '每列一个部门' : '每行一个部门'}）：
- 第一个泳道id=2，后续+1
- 泳道尺寸：${direction === 'horizontal' ? '宽250px，高=所有节点总高+150' : '高100px，宽=所有节点总宽+150'}
- 泳道${direction === 'horizontal' ? '水平排列，间距0' : '垂直排列，间距0'}
- 泳道内节点x/y相对于泳道容器内部坐标(0,0)

关键：跨泳道连线的parent必须为"1"（根容器），不是某个swimlane。

直接输出XML：`;
}

/**
 * 生成精简版提示词（重试时使用，进一步压缩）
 */
function buildCompactPrompt(direction: 'vertical' | 'horizontal', layoutStyle: 'regular' | 'swimlane'): string {
  const layoutRule = direction === 'horizontal'
    ? '横向，左到右'
    : '纵向，上到下';

  if (layoutStyle === 'swimlane') {
    return `生成draw.io泳道流程图XML。${layoutRule}泳道。每行/列一个部门（swimlane容器），节点放所属部门swimlane内（parent=swimlane id），跨泳道连线parent="1"。只输出mxGraphModel XML，无缩进无换行无解释。节点样式：开始/结束=ellipse fillColor=#f5f5f5;单据=rounded fillColor=#dae8fc;判断=diamond fillColor=#fff2cc;处理=矩形 fillColor=#e1d5e7。连线用orthogonalEdgeStyle。用金蝶标准单据名。`;
  }

  return `生成draw.io流程图XML。${layoutRule}。只输出mxGraphModel XML，无缩进无换行无解释。节点样式：开始/结束=ellipse fillColor=#f5f5f5;单据=rounded fillColor=#dae8fc;判断=diamond fillColor=#fff2cc;处理=矩形 fillColor=#e1d5e7。连线用orthogonalEdgeStyle。用金蝶标准单据名。`;
}

export async function POST(request: NextRequest) {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const { prompt, direction = 'vertical', layoutStyle = 'regular' } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    const systemPrompt = layoutStyle === 'swimlane'
      ? buildSwimlanePrompt(direction)
      : buildSystemPrompt(direction);
    const messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    console.log('开始生成流程图（流式模式）...');
    const startTime = Date.now();

    let lastError: string | null = null;
    let resultXml: string | null = null;

    // 重试策略：先尝试主模型流式，失败后降级模型，再失败用精简提示词
    const attempts: Array<{
      name: string;
      model: string;
      msgs: typeof messages;
      useStream: boolean;
    }> = [
      { name: '主模型流式', model: PRIMARY_MODEL, msgs: messages, useStream: true },
      { name: '降级模型流式', model: FALLBACK_MODEL, msgs: messages, useStream: true },
      { name: '精简提示词+主模型', model: PRIMARY_MODEL, msgs: [
        { role: 'system', content: buildCompactPrompt(direction, layoutStyle) },
        { role: 'user', content: prompt }
      ], useStream: true },
    ];

    for (let i = 0; i < attempts.length && i <= MAX_RETRIES; i++) {
      const attempt = attempts[i];
      console.log(`尝试 ${i + 1}/${attempts.length}: ${attempt.name}`);

      try {
        let content: string;
        if (attempt.useStream) {
          content = await callLLMStream(attempt.msgs, customHeaders, attempt.model);
        } else {
          content = await callLLMInvoke(attempt.msgs, customHeaders, attempt.model);
        }

        console.log(`${attempt.name} 返回完成，耗时: ${Date.now() - startTime}ms，内容长度: ${content.length}`);

        if (!content || content.trim() === '') {
          lastError = 'AI 返回内容为空';
          console.warn(`${attempt.name}: 返回内容为空，尝试下一策略`);
          continue;
        }

        // 提取 XML
        const { xml: rawXml, error: extractError, isTruncated } = extractMxGraphModel(content);
        
        if (!rawXml || extractError) {
          lastError = extractError || '未能提取有效 XML';
          console.warn(`${attempt.name}: XML 提取失败 - ${lastError}`);
          continue;
        }

        if (isTruncated) {
          console.warn(`${attempt.name}: XML 可能被截断，但尝试继续处理`);
        }

        // 验证和清理 XML
        const { xml: cleanedXml, error: validateError } = validateAndCleanXml(rawXml, layoutStyle === 'swimlane');
        
        if (!cleanedXml || validateError) {
          lastError = validateError || 'XML 验证失败';
          console.warn(`${attempt.name}: XML 验证失败 - ${lastError}`);
          continue;
        }

        console.log(`成功生成流程图（${attempt.name}），XML长度: ${cleanedXml.length}，耗时: ${Date.now() - startTime}ms`);
        resultXml = cleanedXml;
        break;

      } catch (err) {
        lastError = err instanceof Error ? err.message : '未知错误';
        console.error(`${attempt.name} 调用失败:`, lastError);
        continue;
      }
    }

    if (!resultXml) {
      console.error('所有生成策略均失败，最后错误:', lastError);
      return NextResponse.json(
        { 
          error: '流程图生成失败，请简化流程描述后重试',
          detail: lastError 
        },
        { status: 500 }
      );
    }

    // 记录统计
    const stats = recordFlowChartGenerated();
    console.log('流程图生成统计:', stats);

    return NextResponse.json({ 
      success: true, 
      xml: resultXml 
    });

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
