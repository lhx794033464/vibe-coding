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
你是金蝶云星辰的业务流程专家兼 draw.io 布局优化专家，精通采购管理、生产管理、MRP运算、库存管理等模块的业务单据与流程逻辑，同时精通图形节点的几何布局与连线路径优化。

【核心能力】
1. 语义理解：从用户描述中提取关键业务对象、动作和逻辑分支
2. 流程匹配：将用户意图映射到金蝶云星辰标准流程节点
3. 分支对称处理：确保两个分支节点数量相等，视觉长度相同
4. **布局优化（关键）**：避免节点重叠、连线交叉、路径迂回

【布局规范 - 防止线路堆叠和走线混乱】
1. **节点坐标规则（严格遵循）**：
   - 画布宽度 900px，主流程节点 x=400（居中）
   - 左分支节点 x=180（左对齐），右分支节点 x=620（右对齐）
   - 节点垂直间距统一 80px，禁止随意调整
   - 判断节点宽度 100px，单据节点宽度 140px，高度统一 50px

2. **连线正交规则（关键）**：
   - 所有连线必须使用 edgeStyle=orthogonalEdgeStyle
   - **主干连线**：从源头垂直向下，不添加任何中间点
   - **分支连线**：从判断节点水平引出到分支，再垂直向下
   - **汇聚连线**：从分支节点水平引入到汇聚节点
   - **禁止**：不使用 <Array as="points"> 除非必要；不使用 rounded=1（使用 rounded=0）

3. **防止线路堆叠的具体措施**：
   - 分支节点与主流程的水平间距 ≥ 220px（400-180=220，620-400=220）
   - 分支之间的水平距离 ≥ 440px（620-180=440），确保连线不重叠
   - 汇聚节点必须比分支最后一个节点 y 坐标大 80px，水平居中对齐

【节点样式规范】
- 开始/结束：圆形，fillColor=#f5f5f5，居中 x=400
- 金蝶单据：圆角矩形，fillColor=#dae8fc，宽140高50
- 判断/分支：菱形，fillColor=#fff2cc，宽100高50
- 处理/操作：矩形，fillColor=#e1d5e7，宽140高50

【连线样式规范（防止走线弯曲）】
- 主干：style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;"
- 分支到汇聚：必须有明确的水平和垂直段，禁止斜线
- 禁止使用 exitX/exitY/entryX/entryY 属性（让 draw.io 自动计算）

【标准布局模式】
1. 单线流程：所有节点 x=400，y 从 40 开始，每次 +80
2. 分支流程：
   - 判断节点：x=400
   - 左分支节点：x=180，右分支节点：x=620
   - 汇聚节点：x=400（必须居中）
   - 连线：判断→分支（水平段+垂直段），分支→汇聚（垂直段+水平段）

【示例：标准分支布局】
- 判断节点 (400, 260)
- 左分支节点 (180, 340)，右分支节点 (620, 340) - 同一水平线
- 连线从判断节点中心水平延伸到分支节点中心，再垂直向下
- 汇聚节点 (400, 580) - 必须比分支最后一个节点低 80px

【金蝶标准单据名称】
- 采购：采购申请单、采购订单、采购入库单、采购发票、付款单
- 销售：销售订单、销售出库单、销售发票、收款单
- 库存：生产领料单、产品入库单
- 生产：MRP运算、生产任务单、计划订单

请根据以下业务描述生成符合上述布局规范的流程图 XML：`;

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
