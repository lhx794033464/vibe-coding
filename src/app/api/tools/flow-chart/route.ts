import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

/**
 * 从 AI 返回内容中提取 mxGraphModel XML
 * 支持多种格式：直接 XML、Markdown 代码块、有/无 XML 声明等
 */
function extractMxGraphModel(content: string): { xml: string | null; error: string | null } {
  if (!content || typeof content !== 'string') {
    return { xml: null, error: '返回内容为空' };
  }

  // 打印前 1000 字符用于调试
  console.log('AI 返回内容（前1000字符）:', content.substring(0, 1000));

  // 步骤1: 移除 Markdown 代码块标记
  let cleanedContent = content
    .replace(/```xml\s*/gi, '')
    .replace(/```\s*$/gm, '')
    .replace(/```/g, '')
    .trim();

  // 步骤2: 尝试提取 <mxGraphModel>...</mxGraphModel>
  const mxGraphModelMatch = cleanedContent.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
  if (mxGraphModelMatch) {
    const xml = mxGraphModelMatch[0];
    console.log('成功提取 mxGraphModel XML，长度:', xml.length);
    return { xml, error: null };
  }

  // 步骤3: 尝试提取 <?xml ... ?> 声明后的内容
  const xmlDeclarationMatch = cleanedContent.match(/<\?xml[\s\S]*?<\/mxGraphModel>/);
  if (xmlDeclarationMatch) {
    const xml = xmlDeclarationMatch[0];
    console.log('成功提取带 XML 声明的内容，长度:', xml.length);
    return { xml, error: null };
  }

  // 步骤4: 如果内容以 <mxGraphModel 开头，尝试提取到结尾
  if (cleanedContent.includes('<mxGraphModel')) {
    const startIndex = cleanedContent.indexOf('<mxGraphModel');
    // 查找最后一个 </mxGraphModel>
    const endIndex = cleanedContent.lastIndexOf('</mxGraphModel>');
    if (endIndex > startIndex) {
      const xml = cleanedContent.substring(startIndex, endIndex + '</mxGraphModel>'.length);
      console.log('通过索引提取 mxGraphModel，长度:', xml.length);
      return { xml, error: null };
    }
  }

  // 步骤5: 如果看起来是 XML 但格式不对，尝试修复
  if (cleanedContent.includes('<mxGraphModel') && cleanedContent.includes('</mxCell>')) {
    // 可能缺少闭合标签，尝试包装
    const startIndex = cleanedContent.indexOf('<mxGraphModel');
    if (startIndex >= 0) {
      let xml = cleanedContent.substring(startIndex);
      // 确保有闭合标签
      if (!xml.includes('</mxGraphModel>')) {
        xml += '</mxGraphModel>';
      }
      console.log('尝试修复不完整的 XML，长度:', xml.length);
      return { xml, error: null };
    }
  }

  // 所有提取方法都失败
  console.error('无法提取 mxGraphModel，内容片段:', cleanedContent.substring(0, 500));
  return { 
    xml: null, 
    error: `无法从返回内容中提取有效 XML。内容长度: ${content.length}，包含 mxGraphModel: ${content.includes('<mxGraphModel')}` 
  };
}

/**
 * 验证和清理 XML
 */
function validateAndCleanXml(xml: string): { xml: string | null; error: string | null } {
  // 移除 XML 注释
  let cleaned = xml.replace(/<!--[\s\S]*?-->/g, '');
  
  // 移除多余的空白
  cleaned = cleaned.replace(/\n\s*\n/g, '\n').trim();

  // 验证基本结构
  if (!cleaned.includes('<mxGraphModel')) {
    return { xml: null, error: 'XML 缺少 mxGraphModel 根元素' };
  }

  if (!cleaned.includes('<root>') || !cleaned.includes('</root>')) {
    console.warn('XML 缺少 root 元素，尝试添加...');
    // 尝试修复：如果没有 root，添加一个空的
    if (!cleaned.includes('<root>')) {
      // 在 </mxGraphModel> 前添加 root
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

【输出要求 - 重要】
1. **只输出纯 mxGraphModel XML 代码**，不要任何解释、Markdown 标记或代码块
2. **XML 必须是完整且有效的**，包含完整的 <mxGraphModel> 标签和 <root> 元素
3. ${layoutRules}
4. **节点居中对齐规则（关键 - 确保直线不歪）**：
   - 所有节点必须相对于中心线对称排列
   - 同层级节点的中心点必须对齐（x或y坐标相同）
   - 节点尺寸锁定纵横比：所有节点必须包含 aspect=fixed 属性
   - 节点宽度高度严格统一：
     * 开始/结束节点：120x80px（椭圆）
     * 判断节点：100x100px（菱形）
     * 标准单据节点：160x60px（圆角矩形）
     * 处理节点：140x60px（矩形）
5. **连接线路由规则**：
   - 所有连线edge的style必须包含：edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
   - **严禁在edge中定义points数组**（禁止<Array as="points">标签）
   - 让draw.io自动计算正交路由，不要手动指定中间点
   - 连接线只能是水平或垂直线段，不允许斜线
   - **出口位置规则（关键 - 防止重叠）**：
     * 从判断节点引出的多条连线必须设置不同的exitX/exitY出口位置
     * 上分支连线：style中添加 exitX=0;exitY=0.5;（从母节点左侧中点引出）
     * 中分支连线：style中添加 exitX=0.5;exitY=1;（从母节点下边中点引出）
     * 下分支连线：style中添加 exitX=1;exitY=0.5;（从母节点右侧中点引出）
     * 示例style：edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;
6. **线段条件标签规则（关键）**：
   - 判断节点的每条出边（分支连线）必须在edge的mxCell中添加value属性表示条件
   - 例如：<mxCell edge="1" value="是" ...> 表示满足条件走此分支
   - 常见条件标签："是"/"否"、"通过"/"驳回"、"缺料"/"不缺料"、"成功"/"失败"

【节点样式规范（严格遵循）】
- 开始/结束节点：椭圆，shape=ellipse，尺寸120x80px，style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;"
- 金蝶单据节点：圆角矩形，shape=rounded=1，尺寸160x60px，style="rounded=1;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;" 
- 判断/分支节点：菱形，shape=rhombus/diamond，尺寸100x100px，style="diamond;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;"
- 处理/操作节点：矩形，shape=rectangle，尺寸140x60px，style="rounded=0;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;"

【金蝶云星辰标准单据名称（必须使用）】
- 采购管理：采购申请单、采购订单、采购入库单、采购发票、付款单
- 销售管理：销售订单、销售出库单、销售发票、收款单
- 库存管理：生产领料单、生产退料单、产品入库单、调拨单、盘点单
- 生产管理：生产任务单、生产工单、MRP运算、计划订单
- 财务管理：凭证、日记账、应收应付单

请直接输出完整的 mxGraphModel XML 代码（不要包含 Markdown 代码块标记）：`;

    // 提取转发头
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 初始化 SDK 客户端
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 调用豆包 2.0 pro 模型
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
      console.error('AI 返回内容为空');
      return NextResponse.json(
        { error: 'AI 返回内容为空' },
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
