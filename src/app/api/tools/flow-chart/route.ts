import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getCurrentUserInfo } from '@/lib/serverAuth';
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
 * 策略：page 尺寸刚好容纳所有节点 + 适度边距，dx/dy 与 page 一致
 * 避免出现多页拼接、流程图偏居角落的问题
 */
function adjustCanvasSize(xml: string): string {
  // 提取所有节点的坐标
  const cellPattern = /<mxCell\s([^>]*?)>([\s\S]*?)<\/mxCell>/g;
  let match: RegExpExecArray | null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;

  while ((match = cellPattern.exec(xml)) !== null) {
    const attrs = match[1];
    const inner = match[2];

    // 只处理 vertex 节点
    if (!/vertex="1"/.test(attrs)) continue;

    const xMatch = inner.match(/x="(-?\d+)"/);
    const yMatch = inner.match(/y="(-?\d+)"/);
    const wMatch = inner.match(/width="(\d+)"/);
    const hMatch = inner.match(/height="(\d+)"/);

    const x = xMatch ? parseInt(xMatch[1]) : 0;
    const y = yMatch ? parseInt(yMatch[1]) : 0;
    const w = wMatch ? parseInt(wMatch[1]) : 100;
    const h = hMatch ? parseInt(hMatch[1]) : 60;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  // 如果没有找到节点，使用默认值
  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  // 负坐标偏移：将所有节点平移到正坐标区域
  const offsetX = minX < 50 ? (50 - minX) : 0;
  const offsetY = minY < 50 ? (50 - minY) : 0;

  // 应用坐标偏移
  let adjusted = xml;
  if (offsetX > 0 || offsetY > 0) {
    adjusted = adjusted.replace(
      /(<mxCell\s[^>]*?vertex="1"[^>]*?>)([\s\S]*?)(<\/mxCell>)/g,
      (_fullMatch: string, prefix: string, inner: string, suffix: string) => {
        let newInner = inner;
        if (offsetX > 0) {
          newInner = newInner.replace(/x="(-?\d+)"/, (_: string, v: string) => `x="${parseInt(v) + offsetX}"`);
        }
        if (offsetY > 0) {
          newInner = newInner.replace(/y="(-?\d+)"/, (_: string, v: string) => `y="${parseInt(v) + offsetY}"`);
        }
        return `${prefix}${newInner}${suffix}`;
      }
    );
    // 更新 maxX/maxY
    maxX += offsetX;
    maxY += offsetY;
  }

  // 页面尺寸 = 内容区域 + 边距，紧凑适配
  const padding = 80;
  const contentWidth = maxX + padding;
  const contentHeight = maxY + padding;

  // 单页尺寸上限，避免生成巨幅多页画布
  const maxPageWidth = 1600;
  const maxPageHeight = 2200;

  const newPageWidth = Math.min(Math.max(850, contentWidth), maxPageWidth);
  const newPageHeight = Math.min(Math.max(1100, contentHeight), maxPageHeight);

  // dx/dy 控制编辑器视口偏移，设小值让内容从左上角开始显示
  // 不设为 page 尺寸，否则视口偏移一整页，内容只在角落可见
  const newDx = Math.min(100, newPageWidth / 4);
  const newDy = Math.min(80, newPageHeight / 4);

  // 替换 mxGraphModel 的属性
  adjusted = adjusted.replace(
    /pageHeight="\d+"/,
    `pageHeight="${newPageHeight}"`
  );

  adjusted = adjusted.replace(
    /pageWidth="\d+"/,
    `pageWidth="${newPageWidth}"`
  );

  adjusted = adjusted.replace(
    /dx="\d+"/,
    `dx="${newDx}"`
  );

  adjusted = adjusted.replace(
    /dy="\d+"/,
    `dy="${newDy}"`
  );

  return adjusted;
}

/**
 * 验证和清理 XML
 */
function validateAndCleanXml(xml: string): { xml: string | null; error: string | null } {
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

  // 根据节点坐标动态调整画布尺寸，修复长流程图连线不显示问题
  cleaned = adjustCanvasSize(cleaned);

  // 修复孤立节点：为没有连线的节点自动连接到最近的前序节点
  cleaned = fixOrphanNodes(cleaned);

  return { xml: cleaned, error: null };
}

/**
 * 修复孤立节点：检测没有入边和出边的vertex节点，自动连线
 */
function fixOrphanNodes(xml: string): string {
  // 提取所有vertex和edge
  const cellRegex = /<mxCell\s+([^>]*)\/?>/g;
  const vertices: { id: string; value: string; x: number; y: number; style: string }[] = [];
  const edges: { id: string; source: string; target: string }[] = [];
  const allIds = new Set<string>();

  let match;
  while ((match = cellRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const idMatch = attrs.match(/id="([^"]*)"/);
    if (!idMatch) continue;
    const id = idMatch[1];
    allIds.add(id);

    const parentMatch = attrs.match(/parent="([^"]*)"/);
    const parent = parentMatch ? parentMatch[1] : '';

    // Skip root cells (id=0, id=1, or parent != "1")
    if (id === '0' || id === '1' || parent !== '1') continue;

    const sourceMatch = attrs.match(/source="([^"]*)"/);
    const targetMatch = attrs.match(/target="([^"]*)"/);

    if (sourceMatch || targetMatch) {
      // This is an edge
      edges.push({
        id,
        source: sourceMatch ? sourceMatch[1] : '',
        target: targetMatch ? targetMatch[1] : '',
      });
    } else {
      // This is a vertex - extract position
      const valueMatch = attrs.match(/value="([^"]*)"/);
      const styleMatch = attrs.match(/style="([^"]*)"/);
      const geoMatch = xml.match(new RegExp(`<mxCell[^>]*id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?<mxGeometry[^>]*x="([^"]*)"[^>]*y="([^"]*)"`));

      if (geoMatch) {
        vertices.push({
          id,
          value: valueMatch ? valueMatch[1] : '',
          x: parseFloat(geoMatch[1]) || 0,
          y: parseFloat(geoMatch[2]) || 0,
          style: styleMatch ? styleMatch[1] : '',
        });
      }
    }
  }

  // Build connectivity maps
  const hasIncoming = new Set<string>();
  const hasOutgoing = new Set<string>();
  for (const edge of edges) {
    if (edge.source) hasIncoming.add(edge.target);
    if (edge.target) hasOutgoing.add(edge.source);
  }

  // Find orphan vertices (no incoming AND no outgoing edges)
  const isEllipse = (style: string) => style.includes('ellipse');
  const orphans = vertices.filter(v => !hasIncoming.has(v.id) && !hasOutgoing.has(v.id) && !isEllipse(v.style));

  if (orphans.length === 0) return xml;

  // For each orphan, find the closest vertex that is before it (smaller y for vertical, smaller x for horizontal)
  // and connect them
  const newEdges: string[] = [];
  let maxId = 0;
  allIds.forEach(id => { const n = parseInt(id); if (!isNaN(n) && n > maxId) maxId = n; });

  for (const orphan of orphans) {
    // Find the closest non-orphan vertex that is visually before this one
    const candidates = vertices.filter(v =>
      v.id !== orphan.id &&
      (hasOutgoing.has(v.id) || hasIncoming.has(v.id)) &&
      v.y < orphan.y
    );

    if (candidates.length > 0) {
      // Pick the one closest in Y (just above)
      candidates.sort((a, b) => {
        const distA = Math.abs(a.y - orphan.y) + Math.abs(a.x - orphan.x) * 0.5;
        const distB = Math.abs(b.y - orphan.y) + Math.abs(b.x - orphan.x) * 0.5;
        return distA - distB;
      });

      const closest = candidates[0];
      maxId++;
      newEdges.push(
        `<mxCell id="${maxId}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" source="${closest.id}" target="${orphan.id}" parent="1"><mxGeometry relative="1" as="geometry" /></mxCell>`
      );
    } else {
      // No candidate above - try to connect to the nearest vertex regardless
      const allCandidates = vertices.filter(v => v.id !== orphan.id);
      if (allCandidates.length > 0) {
        allCandidates.sort((a, b) => {
          const distA = Math.hypot(a.x - orphan.x, a.y - orphan.y);
          const distB = Math.hypot(b.x - orphan.x, b.y - orphan.y);
          return distA - distB;
        });
        const nearest = allCandidates[0];
        maxId++;
        newEdges.push(
          `<mxCell id="${maxId}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" source="${nearest.id}" target="${orphan.id}" parent="1"><mxGeometry relative="1" as="geometry" /></mxCell>`
        );
      }
    }
  }

  if (newEdges.length > 0) {
    // Insert new edges before </root>
    xml = xml.replace('</root>', newEdges.join('') + '</root>');
    console.log(`[flow-chart] Fixed ${newEdges.length} orphan nodes by adding missing edges`);
  }

  return xml;
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
4.分支对称，条件用value标注在连线上（如"是"/"否"/"通过"/"驳回"）
5.连线style含edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
6.禁止edge中定义points数组，判断节点出边设不同exitX/exitY
7.输出紧凑XML，无需缩进换行，id用简短数字

连线完整性规则（最重要）：
- 每个vertex节点（除了开始节点无入边、结束节点无出边）必须有至少一条入边和一条出边
- 所有节点必须通过边连接成一条完整路径，禁止出现孤立节点
- 判断节点(diamond)必须有2个出边，每个出边的value标注条件
- 如果XML被截断，优先保证所有节点之间的连线完整，节点可以省略但边不能省略
- edge必须有source和target属性指向有效的vertex节点id

分支规则：
- 判断节点出边分别从不同方向离开：纵向布局时左分支exitX=0 exitY=0.5，右分支exitX=1 exitY=0.5，下方exitX=0.5 exitY=1
- 分支结束后应回到主流程（合并节点或汇合连线）
- 多分支时每个条件都独立标注

循环规则：
- 循环回路用一条边从后方节点连回前方节点，value标注返回条件（如"不合格"/"驳回"）
- 回路边使用curved=1样式使连线呈弧形，避免与正向连线重叠
- 纵向布局时回路边从节点左侧exitX=0 exitY=0.5出发，回到目标节点左侧entryX=0 entryY=0.5
- 横向布局时回路边从节点上方exitX=0.5 exitY=0出发，回到目标节点上方entryX=0.5 entryY=0

样式：
开始/结束：ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;
单据：rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;
判断：diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;
处理：rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;

金蝶单据：采购申请单/采购订单/采购入库单/采购发票/付款单/销售订单/销售出库单/销售发票/收款单/销售退货单/生产领料单/生产退料单/产品入库单/调拨单/盘点单/生产任务单/生产工单/MRP运算/计划订单/委外加工单/委外入库单/凭证/日记账/应收应付单

直接输出XML：`;
}

/**
 * 生成精简版提示词（重试时使用，进一步压缩）
 */
function buildCompactPrompt(direction: 'vertical' | 'horizontal'): string {
  const layoutRule = direction === 'horizontal'
    ? '横向，左到右'
    : '纵向，上到下';

  return `生成draw.io流程图XML。${layoutRule}。只输出mxGraphModel XML，无缩进无换行无解释。重要：每个vertex节点必须有入边和出边（开始仅出边、结束仅入边），禁止孤立节点，edge必须同时有source和target。节点样式：开始/结束=ellipse fillColor=#f5f5f5;单据=rounded fillColor=#dae8fc;判断=diamond fillColor=#fff2cc;处理=矩形 fillColor=#e1d5e7。连线用orthogonalEdgeStyle。用金蝶标准单据名。`;
}

export async function POST(request: NextRequest) {
  // 认证检查
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未认证' }, { status: 401 });
  }

  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const { prompt, direction = 'vertical' } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(direction);
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
        { role: 'system', content: buildCompactPrompt(direction) },
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
        const { xml: cleanedXml, error: validateError } = validateAndCleanXml(rawXml);
        
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
