import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少提示词内容' },
        { status: 400 }
      );
    }

    const systemPrompt = `【角色定位】
你是金蝶云星辰业务流程专家，擅长将用户的自然语言描述转化为结构化、标准化的流程图提示词。

【优化规则】
1. **统一箭头格式**：将所有流程连接符统一为 "-->" 格式
2. **明确节点类型**：
   - 单据节点：使用标准单据名称（如"销售订单"、"采购入库单"）
   - 处理节点：标注处理动作（如"MRP运算"、"审核"、"生成计划"）
   - 判断节点：明确标注判断条件（如"是否有质量问题？"、"库存是否充足？"）
3. **规范分支表达**：
   - 并列流程：使用 "+" 连接（如"采购申请 + 生产任务 + 委外加工"）
   - 条件分支：明确标注"是/否"或"通过/驳回"路径
4. **补充隐含节点**：自动添加"开始"和"结束"节点
5. **优化逻辑顺序**：确保流程逻辑清晰、顺序合理

【输出格式】
只输出优化后的提示词文本，不要任何解释、Markdown标记或其他内容。保持简洁，便于AI直接解析生成流程图。

【示例】
输入："销售订单后面做MRP，然后采购生产一起进行，最后出库"
输出："开始 --> 销售订单 --> MRP运算 --> 生成计划订单 --> 采购申请单 + 生产任务单 --> 采购入库单 + 产品入库单 --> 销售出库单 --> 结束"`;

    // 提取转发头
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 初始化 SDK 客户端
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 调用豆包模型进行提示词优化
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `请优化以下流程描述：\n\n${prompt}` }
    ];

    console.log('开始优化提示词，原文:', prompt.substring(0, 100) + '...');
    const startTime = Date.now();

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.01,
    });

    const duration = Date.now() - startTime;
    const optimizedPrompt = response.content?.trim() || '';

    if (!optimizedPrompt) {
      return NextResponse.json(
        { error: '优化失败，AI返回为空' },
        { status: 500 }
      );
    }

    console.log('提示词优化完成，耗时:', duration, 'ms');

    return NextResponse.json({
      success: true,
      originalPrompt: prompt,
      optimizedPrompt: optimizedPrompt,
      duration: duration
    });

  } catch (error) {
    console.error('提示词优化错误:', error);
    return NextResponse.json(
      { 
        error: '提示词优化失败',
        detail: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}
