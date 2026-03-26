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

【输出要求】
1. 只输出纯 mxGraphModel XML 代码，不要任何解释、Markdown 标记或代码块
2. ${layoutRules}
3. **节点居中对齐规则（关键 - 确保直线不歪）**：
   - 所有节点必须相对于中心线对称排列
   - 同层级节点的中心点必须对齐（x或y坐标相同）
   - 节点尺寸锁定纵横比：所有节点必须包含 aspect=fixed 属性
   - 节点宽度高度严格统一：
     * 开始/结束节点：120x80px（椭圆）
     * 判断节点：100x100px（菱形）
     * 标准单据节点：160x60px（圆角矩形）
     * 处理节点：140x60px（矩形）
4. **连接线路由规则**：
   - 所有连线edge的style必须包含：edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
   - **严禁在edge中定义points数组**（禁止<Array as="points">标签）
   - 让draw.io自动计算正交路由，不要手动指定中间点
   - 连接线只能是水平或垂直线段，不允许斜线
   - **纵向布局连接规则**：平行分支收束到下一节点时，必须从分支节点的下端（source的底部）连接到目标节点的侧端（左侧或右侧）
5. 分支对齐规则：
   - 若存在分支，两个分支的节点数必须相等
   - 节点少的分支添加"等待"或"自动过渡"节点补齐
   - 两个分支最终必须汇聚到同一节点

【节点样式规范（严格遵循）】
- 开始/结束节点：椭圆，shape=ellipse，尺寸120x80px，style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;"
- 金蝶单据节点：圆角矩形，shape=rounded=1，尺寸160x60px，style="rounded=1;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;" 
- 判断/分支节点：菱形，shape=rhombus/diamond，尺寸100x100px，style="diamond;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;"
- 处理/操作节点：矩形，shape=rectangle，尺寸140x60px，style="rounded=0;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;"

【层级规则（重要）】
- **生成顺序：必须先定义所有节点 mxCell，再定义所有连线 edge**
- 所有节点 mxCell 的 parent 必须指向 "1"（根节点）
- 所有连线 edge 的 parent 也必须指向 "1"
- 所有节点必须设置 vertex="1"，所有连线必须设置 edge="1"
- **连接线不能遮盖节点**：确保连线在节点下方显示，通过正确的 XML 顺序实现（节点在前，连线在后）

【金蝶云星辰标准单据名称（必须使用）】
- 采购管理：采购申请单、采购订单、采购入库单、采购发票、付款单
- 销售管理：销售订单、销售出库单、销售发票、收款单
- 库存管理：生产领料单、生产退料单、产品入库单、调拨单、盘点单
- 生产管理：生产任务单、生产工单、MRP运算、计划订单
- 财务管理：凭证、日记账、应收应付单

请根据以下业务描述生成专业流程图 XML：`;

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
      temperature: 0.1,
    });

    const content = response.content || '';

    // 打印原始返回内容用于调试
    console.log('豆包 2.0 pro 原始返回:', content.substring(0, 500) + '...');

    // 使用正则表达式提取 <mxGraphModel>...</mxGraphModel> 部分
    const mxGraphModelMatch = content.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
    
    if (!mxGraphModelMatch) {
      console.error('无法从返回内容中提取 mxGraphModel XML');
      return NextResponse.json(
        { error: '生成的流程图格式不正确，未能提取有效 XML' },
        { status: 500 }
      );
    }

    let xml = mxGraphModelMatch[0];

    // 清理可能的 XML 注释
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

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
