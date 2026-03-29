import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { recordFlowChartGenerated } from '@/services/globalStats';

// 使用豆包 2.0 Pro 模型
const FLOW_CHART_MODEL = 'doubao-seed-2-0-pro-260215';

/**
 * 调用豆包模型生成流程图 (使用 coze-coding-dev-sdk)
 */
async function callDoubao(
  messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}>,
  customHeaders: Record<string, string>
): Promise<string> {
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const response = await client.invoke(messages, {
    model: FLOW_CHART_MODEL,
    temperature: 0.01,
  });

  return response.content || '';
}

/**
 * 从 AI 返回内容中提取 mxGraphModel XML
 * 支持多种格式：直接 XML、Markdown 代码块、嵌套结构、截断内容等
 */
function extractMxGraphModel(content: string): { xml: string | null; error: string | null } {
  if (!content || typeof content !== 'string') {
    return { xml: null, error: '返回内容为空' };
  }

  // 打印前 1500 字符用于调试
  console.log('AI 返回内容（前1500字符）:', content.substring(0, 1500));
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

  console.log('找到', startIndices.length, '个 mxGraphModel 起始位置');

  // 步骤3: 对每个起始位置，尝试找到匹配的闭合标签
  const candidates: string[] = [];
  
  for (const startIdx of startIndices) {
    // 从起始位置之后开始找闭合标签
    const afterStart = cleanedContent.substring(startIdx + startTag.length);
    const endIdx = afterStart.indexOf(endTag);
    
    if (endIdx !== -1) {
      // 找到了闭合标签，提取完整片段
      const xml = cleanedContent.substring(
        startIdx, 
        startIdx + startTag.length + endIdx + endTag.length
      );
      candidates.push(xml);
    }
  }

  console.log('找到', candidates.length, '个完整的 mxGraphModel 候选');

  // 步骤4: 选择最佳候选（包含最多 mxCell 的）
  if (candidates.length > 0) {
    // 按 mxCell 数量排序，选择最完整的
    const bestCandidate = candidates.sort((a, b) => {
      const countA = (a.match(/<mxCell/g) || []).length;
      const countB = (b.match(/<mxCell/g) || []).length;
      return countB - countA; // 降序，mxCell 最多的优先
    })[0];
    
    console.log('选择最佳候选，包含 mxCell 数量:', (bestCandidate.match(/<mxCell/g) || []).length);
    return { xml: bestCandidate, error: null };
  }

  // 步骤5: 如果没有找到完整标签，尝试基于索引提取
  if (cleanedContent.includes(startTag)) {
    const startIndex = cleanedContent.indexOf(startTag);
    const endIndex = cleanedContent.lastIndexOf(endTag);
    
    if (endIndex > startIndex) {
      const xml = cleanedContent.substring(startIndex, endIndex + endTag.length);
      console.log('通过索引提取 mxGraphModel，长度:', xml.length);
      return { xml, error: null };
    }
  }

  // 步骤6: 紧急修复 - 如果看起来是 XML 但格式混乱
  if (cleanedContent.includes('<mxGraphModel') && cleanedContent.includes('</mxCell>')) {
    const startIndex = cleanedContent.indexOf('<mxGraphModel');
    if (startIndex >= 0) {
      let xml = cleanedContent.substring(startIndex);
      
      // 清理可能的嵌套问题 - 保留第一个完整的 mxGraphModel 结构
      const firstEnd = xml.indexOf('</mxGraphModel>');
      if (firstEnd > 0) {
        xml = xml.substring(0, firstEnd + '</mxGraphModel>'.length);
      } else {
        // 没有闭合标签，尝试添加
        xml += '</mxGraphModel>';
      }
      
      console.log('尝试修复不完整的 XML，长度:', xml.length);
      return { xml, error: null };
    }
  }

  // 所有提取方法都失败
  console.error('无法提取 mxGraphModel，内容片段:', cleanedContent.substring(0, 800));
  return { 
    xml: null, 
    error: `无法从返回内容中提取有效 XML。内容长度: ${content.length}，包含 mxGraphModel: ${content.includes('<mxGraphModel')}` 
  };
}

/**
 * 转义 XML 属性值中的特殊字符
 * 主要处理 value 属性中可能包含的 < > & 字符
 */
function escapeXmlAttributes(xml: string): string {
  // 专门处理 value="..." 属性，这是最容易出问题的地方
  // 使用正则匹配 value 属性
  return xml.replace(
    /value="([^"]*)"/g,
    (match, content) => {
      // 先还原已转义的字符，避免重复转义
      const unescaped = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      
      // 重新转义特殊字符
      const escaped = unescaped
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      return `value="${escaped}"`;
    }
  );
}

/**
 * 验证和清理 XML
 */
function validateAndCleanXml(xml: string): { xml: string | null; error: string | null } {
  // 移除 XML 注释
  let cleaned = xml.replace(/<!--[\s\S]*?-->/g, '');
  
  // 移除多余的空白
  cleaned = cleaned.replace(/\n\s*\n/g, '\n').trim();
  
  // 转义属性值中的特殊字符（关键修复）
  cleaned = escapeXmlAttributes(cleaned);

  // 验证基本结构
  if (!cleaned.includes('<mxGraphModel')) {
    return { xml: null, error: 'XML 缺少 mxGraphModel 根元素' };
  }

  // 确保只有一个 mxGraphModel（取第一个）
  const firstStart = cleaned.indexOf('<mxGraphModel');
  const firstEnd = cleaned.indexOf('</mxGraphModel>');
  if (firstStart >= 0 && firstEnd > firstStart) {
    const secondStart = cleaned.indexOf('<mxGraphModel', firstStart + 1);
    if (secondStart > 0 && secondStart < firstEnd) {
      // 有嵌套，只保留第一个完整的
      cleaned = cleaned.substring(firstStart, firstEnd + '</mxGraphModel>'.length);
      console.log('清理嵌套的 mxGraphModel，新长度:', cleaned.length);
    }
  }

  if (!cleaned.includes('<root>') || !cleaned.includes('</root>')) {
    console.warn('XML 缺少 root 元素，尝试添加...');
    if (!cleaned.includes('<root>')) {
      cleaned = cleaned.replace(
        '</mxGraphModel>',
        '<root><mxCell id="0" /><mxCell id="1" parent="0" /></root></mxGraphModel>'
      );
    }
  }

  // 确保有基本的 mxCell 元素
  if (!cleaned.includes('mxCell')) {
    return { xml: null, error: 'XML 缺少 mxCell 元素' };
  }

  return { xml: cleaned, error: null };
}

export async function POST(request: NextRequest) {
  try {
    // 提取请求头用于转发
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    
    const { prompt, direction = 'vertical' } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    // 根据方向生成不同的布局规则
    const isHorizontal = direction === 'horizontal';
    
    const layoutRules = isHorizontal 
      ? `【横向布局规则】
- 整体从左到右水平排列
- 主流程垂直居中对齐（y=300）
- 分支流程上下对称分布（上分支y=150，下分支y=450）
- 每个节点水平间距 160-180px
- 开始节点在左侧（x=40），结束节点在右侧（x=最右）`
      : `【纵向布局规则】
- 整体自上而下垂直排列
- 主流程水平居中对齐（x=400）
- 分支流程左右对称分布（左分支x=200，右分支x=600）
- 每个节点垂直间距 100-120px
- 开始节点在顶部（y=40），结束节点在底部（y=最下）`;

    const systemPrompt = `【角色定位】
你是金蝶云星辰的业务流程专家，精通采购管理、生产管理、MRP运算、库存管理等模块的业务单据与流程逻辑。你的核心任务是根据用户的自然语言描述，理解其业务场景，匹配标准的金蝶云星辰业务流程，并生成专业级 draw.io 流程图 XML。

【语义解析指南】
1. **箭头识别**：无论用户使用 "->"、"-->"、"--->" 或任何变体，都视为流程连接
2. **并列处理**：用户用 "+"、"/"、"、"或括号（）表示并行流程时，应拆分为多个并行分支
3. **条件分支**："如果...则..."、"是否"、"有无"等关键词表示判断节点，需用菱形表示
4. **分支对称**：存在多条分支时，确保分支结构对称美观

【能力要求】
1. 语义理解：从用户描述中提取关键业务对象（物料、单据类型、库存状态、运算结果）、动作（MRP计算、采购、领料）和逻辑分支（缺料/不缺料）。
2. 流程匹配：将用户意图映射到金蝶云星辰标准流程节点：
   - MRP运算 → 生成计划订单
   - 缺料分支 → 采购申请 → 采购订单 → 收料 → 质检 → 入库 → 领料
   - 不缺料分支 → 直接领料生产
   - 销售流程 → 销售订单 → 发货 → 出库 → 开票 → 收款
   - 采购流程 → 采购申请 → 采购订单 → 收料 → 入库 → 发票 → 付款
3. 分支对称处理：当存在分支流程（如缺料与不缺料、通过/驳回）时，必须确保两个分支节点数量相等或视觉长度相同，最后汇聚到同一节点，保持流程图对称美观。
4. 专业命名：所有节点必须使用金蝶云星辰标准单据名称（如"采购申请单"而非"申请采购"）。

【输出要求 - 非常重要】
1. **只输出一个完整的 mxGraphModel XML 代码块**，不要任何解释、Markdown 标记
2. **XML 必须是完整且有效的**，包含完整的 <mxGraphModel>...</mxGraphModel> 和 <root>...</root>
3. ${layoutRules}
4. **节点居中对齐规则**：
   - 所有节点必须相对于中心线对称排列
   - 同层级节点的中心点必须对齐（x或y坐标相同）
   - 节点尺寸统一：开始/结束120x80px，判断100x100px，单据160x60px，处理140x60px
5. **连接线路由规则**：
   - 所有连线style包含：edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
   - **严禁在edge中定义points数组**
   - 从判断节点引出的连线必须设置不同的exitX/exitY出口位置
6. **线段条件标签规则**：
   - 判断节点的出边必须在mxCell中添加value属性表示条件（如value="是"/"否"）

【节点样式规范】
- 开始/结束：椭圆，style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;"
- 金蝶单据：圆角矩形，style="rounded=1;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;" 
- 判断节点：菱形，style="diamond;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;"
- 处理节点：矩形，style="rounded=0;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;"

【金蝶云星辰标准单据名称】
- 采购管理：采购申请单、采购订单、采购入库单、采购发票、付款单
- 销售管理：销售订单、销售出库单、销售发票、收款单、销售退货单
- 库存管理：生产领料单、生产退料单、产品入库单、调拨单、盘点单
- 生产管理：生产任务单、生产工单、MRP运算、计划订单、委外加工单、委外入库单
- 财务管理：凭证、日记账、应收应付单

请直接输出完整的 mxGraphModel XML（只输出XML代码，不要任何其他内容）：`;

    // 调用豆包模型
    const messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    console.log('开始调用豆包生成流程图...');
    const startTime = Date.now();

    const content = await callDoubao(messages, customHeaders);

    console.log('豆包返回完成，耗时:', Date.now() - startTime, 'ms');

    // 处理空内容情况 - 添加备用提示词
    if (!content || content.trim() === '') {
      console.error('AI 返回内容为空');
      return NextResponse.json(
        { 
          error: 'AI 返回内容为空，请重试',
          detail: '模型未返回任何内容，可能是网络波动或模型超时' 
        },
        { status: 500 }
      );
    }

    // 提取 XML
    const { xml: rawXml, error: extractError } = extractMxGraphModel(content);
    
    if (!rawXml || extractError) {
      console.error('XML 提取失败:', extractError);
      return NextResponse.json(
        { error: extractError || '未能提取有效 XML' },
        { status: 500 }
      );
    }

    // 验证和清理 XML
    const { xml: cleanedXml, error: validateError } = validateAndCleanXml(rawXml);
    
    if (!cleanedXml || validateError) {
      console.error('XML 验证失败:', validateError);
      return NextResponse.json(
        { error: validateError || 'XML 验证失败' },
        { status: 500 }
      );
    }

    console.log('成功生成流程图 XML，最终长度:', cleanedXml.length);

    // 记录统计
    const stats = recordFlowChartGenerated();
    console.log('流程图生成统计:', stats);

    return NextResponse.json({ 
      success: true, 
      xml: cleanedXml 
    });

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
