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
 * 验证 XML 完整性
 */
function validateXml(xml: string): { isValid: boolean; isComplete: boolean } {
  const hasStart = xml.includes('<mxGraphModel');
  const hasEnd = xml.includes('</mxGraphModel>');
  const hasCells = xml.includes('mxCell');
  
  return {
    isValid: hasStart && hasCells,
    isComplete: hasStart && hasEnd && hasCells
  };
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, direction = 'vertical', stream = true } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    // 如果不使用流式，返回普通JSON（向后兼容）
    if (!stream) {
      return handleNonStreaming(prompt, direction, request);
    }

    // 流式输出处理
    return handleStreaming(prompt, direction, request);

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * 处理非流式请求（向后兼容）
 */
async function handleNonStreaming(prompt: string, direction: string, request: NextRequest) {
  const systemPrompt = buildSystemPrompt(direction);
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
    return NextResponse.json({ error: error || '提取 XML 失败' }, { status: 500 });
  }

  const { isComplete } = validateXml(xml);
  if (!isComplete) {
    return NextResponse.json(
      { error: 'XML 不完整', detail: '请简化流程描述' },
      { status: 500 }
    );
  }

  recordFlowChartGenerated();

  return NextResponse.json({ success: true, xml });
}

/**
 * 处理流式请求（模拟流式效果）
 * 注意：由于豆包 SDK 不支持真正的流式输出，这里使用模拟流式：
 * 1. 先发送开始事件
 * 2. 等待 AI 完整响应
 * 3. 将响应分块发送给客户端
 */
async function handleStreaming(prompt: string, direction: string, request: NextRequest) {
  const systemPrompt = buildSystemPrompt(direction, true); // 流式模式下放宽节点限制
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: prompt }
  ];

  // 创建 ReadableStream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 发送开始事件
        controller.enqueue(encoder.encode('event: start\ndata: {"status":"started"}\n\n'));

        // 模拟进度更新（因为 SDK 不支持真正的流式）
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress += 5;
          if (progress <= 90) {
            const progressData = {
              chunk: Math.floor(progress / 5),
              length: progress * 100,
              preview: 'AI 正在生成流程图...'
            };
            controller.enqueue(
              encoder.encode(`event: progress\ndata: ${JSON.stringify(progressData)}\n\n`)
            );
          }
        }, 500);

        // 调用 AI（非流式）
        const response = await client.invoke(messages, {
          model: 'doubao-seed-2-0-pro-260215',
          temperature: 0.01,
        });

        // 停止进度更新
        clearInterval(progressInterval);

        const fullContent = response.content || '';
        
        if (!fullContent) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'AI 返回内容为空' })}\n\n`)
          );
          controller.close();
          return;
        }

        // 发送 100% 进度
        controller.enqueue(
          encoder.encode(`event: progress\ndata: ${JSON.stringify({ chunk: 20, length: fullContent.length, preview: '接收完成' })}\n\n`)
        );

        // 提取 XML
        const { xml, error } = extractMxGraphModel(fullContent);

        if (!xml || error) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ 
              error: error || '提取 XML 失败',
              detail: `内容长度: ${fullContent.length}，可能被截断`
            })}\n\n`)
          );
          controller.close();
          return;
        }

        const { isValid, isComplete } = validateXml(xml);

        if (!isValid) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'XML 格式无效' })}\n\n`)
          );
          controller.close();
          return;
        }

        // 记录统计
        recordFlowChartGenerated();

        // 发送完成事件
        const completeData = {
          success: true,
          xml: xml,
          isComplete: isComplete,
          totalLength: fullContent.length,
          xmlLength: xml.length
        };
        controller.enqueue(
          encoder.encode(`event: complete\ndata: ${JSON.stringify(completeData)}\n\n`)
        );

        controller.close();

      } catch (error) {
        console.error('流式处理错误:', error);
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ 
            error: '流式处理失败',
            detail: error instanceof Error ? error.message : '未知错误'
          })}\n\n`)
        );
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

const encoder = new TextEncoder();

/**
 * 构建系统提示词
 */
function buildSystemPrompt(direction: string, isStreaming: boolean = false): string {
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

  // 流式模式下放宽节点限制，但仍给出建议
  const nodeLimitPrompt = isStreaming 
    ? `【节点数量建议】
- 建议控制在 30 个节点以内以获得最佳效果
- 如果流程复杂，请确保每个节点的标签简洁明了
- 流式输出支持超长内容，但生成时间会更长`
    : `【节点数量限制 - 强制要求】
- **绝对限制：最多 18 个节点**（包括开始、结束、单据、判断、处理节点）
- 如果用户描述的流程超过 18 个节点，必须合并相似节点、删除次要分支`;

  return `【角色定位】
你是金蝶云星辰的业务流程专家，精通采购管理、生产管理、MRP运算、库存管理等模块的业务单据与流程逻辑。你的核心任务是根据用户的自然语言描述，理解其业务场景，匹配标准的金蝶云星辰业务流程，并生成专业级 draw.io 流程图 XML。

【语义解析指南】
1. **箭头识别**：无论用户使用 "->"、"-->"、"--->" 或任何变体，都视为流程连接
2. **并列处理**：用户用 "+"、"/"、"、"或括号（）表示并行流程时，应拆分为多个并行分支
3. **条件分支**："如果...则..."、"是否"、"有无"等关键词表示判断节点，需用菱形表示
4. **分支对称**：存在多条分支时，确保分支结构对称美观

【能力要求】
1. 语义理解：从用户描述中提取关键业务对象、动作和逻辑分支
2. 流程匹配：将用户意图映射到金蝶云星辰标准流程节点
3. 分支对称处理：确保分支节点数量相等或视觉长度相同，最后汇聚到同一节点
4. 专业命名：所有节点必须使用金蝶云星辰标准单据名称

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

${nodeLimitPrompt}

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
}
