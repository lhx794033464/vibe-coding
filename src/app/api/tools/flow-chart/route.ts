import { NextRequest, NextResponse } from 'next/server';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: '服务器配置错误，缺少 API Key' },
        { status: 500 }
      );
    }

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
2. 布局规则：
   - 整体自上而下垂直排列
   - 主流程居中对齐（x=400）
   - 分支流程左右对称分布（左分支x=200，右分支x=600）
   - 每个节点垂直间距 80-100px
3. **连接线路由规则（关键 - 防止线路重叠）**：
   - 所有连线edge的style必须包含：edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
   - **严禁在edge中定义points数组**（禁止<Array as=\"points\">标签）
   - 让draw.io自动计算正交路由，不要手动指定中间点
   - 连接线只能是水平或垂直线段，不允许斜线
4. 分支对齐规则：
   - 若存在分支，两个分支的节点数必须相等
   - 节点少的分支添加"等待"或"自动过渡"节点补齐
   - 两个分支最终必须汇聚到同一节点

【节点样式规范（严格遵循）】
- 开始/结束节点：圆形，style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#f5f5f5;strokeColor=#666666;"
- 金蝶单据节点：圆角矩形，style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" 
- 判断/分支节点：菱形，style="diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;"
- 处理/操作节点：矩形，style="rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;"

【完整示例：MRP运算分支流程】
<mxGraphModel dx="900" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="900" pageHeight="1200">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    
    <!-- 开始 -->
    <mxCell id="start" value="开始" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1">
      <mxGeometry x="400" y="40" width="80" height="80" as="geometry" />
    </mxCell>
    
    <!-- MRP运算 -->
    <mxCell id="mrp" value="MRP运算&#xa;(生成计划订单)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
      <mxGeometry x="360" y="160" width="160" height="60" as="geometry" />
    </mxCell>
    
    <!-- 库存判断 -->
    <mxCell id="check" value="库存是否&#xa;满足?" style="diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="380" y="260" width="120" height="80" as="geometry" />
    </mxCell>
    
    <!-- 左分支：缺料 -->
    <mxCell id="purchase_apply" value="采购申请单" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="160" y="380" width="140" height="50" as="geometry" />
    </mxCell>
    
    <mxCell id="purchase_order" value="采购订单" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="160" y="460" width="140" height="50" as="geometry" />
    </mxCell>
    
    <mxCell id="purchase_in" value="采购入库单" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="160" y="540" width="140" height="50" as="geometry" />
    </mxCell>
    
    <!-- 右分支：不缺料（使用等待节点补齐） -->
    <mxCell id="direct" value="库存充足&#xa;(直接领料)" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
      <mxGeometry x="580" y="380" width="140" height="50" as="geometry" />
    </mxCell>
    
    <mxCell id="wait1" value="等待" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#999999;dashed=1;" vertex="1" parent="1">
      <mxGeometry x="580" y="460" width="140" height="50" as="geometry" />
    </mxCell>
    
    <mxCell id="wait2" value="等待" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#999999;dashed=1;" vertex="1" parent="1">
      <mxGeometry x="580" y="540" width="140" height="50" as="geometry" />
    </mxCell>
    
    <!-- 汇聚：生产领料 -->
    <mxCell id="issue" value="生产领料单" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="360" y="640" width="160" height="60" as="geometry" />
    </mxCell>
    
    <!-- 结束 -->
    <mxCell id="end" value="结束" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1">
      <mxGeometry x="400" y="740" width="80" height="80" as="geometry" />
    </mxCell>
    
    <!-- 连线：主干（简洁格式，无points数组） -->
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="start" target="mrp">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="mrp" target="check">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    
    <!-- 连线：左分支（无points数组，让系统自动路由） -->
    <mxCell id="e3" value="缺料" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="check" target="purchase_apply">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e4" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="purchase_apply" target="purchase_order">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e5" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="purchase_order" target="purchase_in">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e6" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="purchase_in" target="issue">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    
    <!-- 连线：右分支（无points数组） -->
    <mxCell id="e7" value="充足" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="check" target="direct">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e8" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="direct" target="wait1">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e9" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="wait1" target="wait2">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e10" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="wait2" target="issue">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    
    <!-- 连线：结束 -->
    <mxCell id="e11" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="issue" target="end">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>

【金蝶云星辰标准单据名称（必须使用）】
- 采购管理：采购申请单、采购订单、采购入库单、采购发票、付款单
- 销售管理：销售订单、销售出库单、销售发票、收款单
- 库存管理：生产领料单、生产退料单、产品入库单、调拨单、盘点单
- 生产管理：生产任务单、生产工单、MRP运算、计划订单
- 财务管理：凭证、日记账、应收应付单

请根据以下业务描述生成专业流程图 XML：`;

    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        top_p: 0.95,
        max_tokens: 8000
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('DeepSeek API 错误:', errorData);
      return NextResponse.json(
        { error: '生成流程图失败，请稍后重试' },
        { status: 500 }
      );
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content || '';

    // 打印原始返回内容用于调试
    console.log('DeepSeek 原始返回:', content.substring(0, 500) + '...');

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
