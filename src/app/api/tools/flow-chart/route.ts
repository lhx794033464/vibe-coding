import { NextRequest, NextResponse } from 'next/server';

// DeepSeek API 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-a576af7e052748d9a5a64f5171adaaa6';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// Vercel 最大执行时间（秒）
export const maxDuration = 60;

// 生成系统提示词
function generateSystemPrompt(direction: 'vertical' | 'horizontal'): string {
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

  return `【角色定位】
你是金蝶云星辰的业务流程专家，精通采购管理、生产管理、MRP运算、库存管理等模块的业务单据与流程逻辑。

【输出格式 - 严格遵循】
1. 只输出纯 mxGraphModel XML 代码，不要任何解释
2. ${layoutRules}
3. 节点居中对齐：同层级节点 x 或 y 坐标严格相等
4. 节点尺寸统一：开始/结束 120x80，判断 100x100，单据 160x60，处理 140x60，全部加 aspect=fixed
5. 连线样式：edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
6. 严禁 points 数组，严禁斜线
7. 判断节点出口：exitX/exitY 区分方向（0/0.5左，0.5/1下，1/0.5右）
8. 分支条件：edge 加 value="是"/"否"/"通过"/"驳回"等标签
9. 分支对称：节点数不等时补"等待"节点，最终汇聚

【节点样式】
- 开始/结束：ellipse;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12
- 单据：rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11
- 判断：diamond;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11
- 处理：rounded=0;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11

【标准单据名称】
采购申请单、采购订单、采购入库单、采购发票、付款单、销售订单、销售出库单、销售发票、收款单、生产领料单、生产退料单、产品入库单、调拨单、盘点单、生产任务单、MRP运算、计划订单、凭证、日记账

请生成专业流程图 XML：`;
}

// 简化版提示词（用于复杂流程）
function generateSimplifiedPrompt(direction: 'vertical' | 'horizontal'): string {
  const isHorizontal = direction === 'horizontal';
  
  return `你是金蝶云星辰流程专家。请根据描述生成简洁的 draw.io 流程图 XML。

【关键规则】
1. 只输出 XML，不要任何解释
2. 布局：${isHorizontal ? '从左到右，主流程y=300' : '从上到下，主流程x=400'}
3. 节点：开始/结束120x80椭圆，判断100x100菱形，单据160x60圆角矩形，处理140x60矩形，全部aspect=fixed
4. 连线：style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;"
5. 禁止 points 数组，禁止斜线
6. 判断分支：用 exitX/exitY 区分方向，加 value 标签

【样式】
- 椭圆：fillColor=#f5f5f5;strokeColor=#666666
- 单据：fillColor=#dae8fc;strokeColor=#6c8ebf
- 判断：fillColor=#fff2cc;strokeColor=#d6b656
- 处理：fillColor=#e1d5e7;strokeColor=#9673a6

请生成 XML：`;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, direction = 'vertical', simplified = false } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    // 根据复杂度选择提示词
    const systemPrompt = simplified 
      ? generateSimplifiedPrompt(direction)
      : generateSystemPrompt(direction);

    console.log('[流程图生成] 开始调用 DeepSeek API...');
    
    // 调用 DeepSeek API
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 4096, // 降低限制以获得更快响应
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API 错误:', response.status, errorData);
      return NextResponse.json(
        { error: '调用 AI 服务失败，请稍后重试' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log(`[流程图生成] DeepSeek 返回，长度: ${content.length}`);

    // 检查返回内容是否被截断
    if (content.endsWith('...') || content.endsWith('<') || content.endsWith('</')) {
      console.error('返回内容可能被截断');
      return NextResponse.json(
        { error: '生成的流程图内容过长，请简化流程描述或使用"简化模式"', truncated: true },
        { status: 500 }
      );
    }

    // 使用正则表达式提取 <mxGraphModel>...</mxGraphModel> 部分
    const mxGraphModelMatch = content.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
    
    if (!mxGraphModelMatch) {
      console.error('无法从返回内容中提取 mxGraphModel XML');
      
      // 尝试查找是否有 <mxGraphModel 开头但缺少结束标签
      if (content.includes('<mxGraphModel') && !content.includes('</mxGraphModel>')) {
        return NextResponse.json(
          { error: '生成的流程图 XML 不完整，请简化流程描述或使用"简化模式"', truncated: true },
          { status: 500 }
        );
      }
      
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
    console.error('[流程图生成] 错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
