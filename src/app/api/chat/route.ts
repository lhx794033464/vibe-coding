import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { dbGetCustomers, dbGetSchedules, dbGetImplementationLogs } from '@/services/dbService';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';

// 对话历史存储（基于 conversation_id）
const conversationHistory: Map<string, Array<{role: string; content: string}>> = new Map();

// 估算 token 数量（中文约1.3 tokens/字，英文约0.75 tokens/word）
function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const nonChineseLength = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.3 + nonChineseLength * 0.4);
}

// 记录 token 用量
async function recordTokenUsage(params: {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  apiType: string;
}) {
  try {
    const client = getSupabaseClient();
    await client.from('token_usage').insert({
      user_id: params.userId,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      total_tokens: params.inputTokens + params.outputTokens,
      api_type: params.apiType,
    });
  } catch (error) {
    console.error('记录 token 用量失败:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const { messages, userId } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: '消息格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取最后一条用户消息
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage.role !== 'user') {
      return new Response(JSON.stringify({ error: '最后一条消息必须是用户消息' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 构建对话历史
    const conversationId = userId || 'default';
    const history = conversationHistory.get(conversationId) || [];

    // 添加当前消息到历史
    const updatedHistory = [...history, { role: 'user', content: lastUserMessage.content }];

    // 保留最近 10 轮对话
    if (updatedHistory.length > 20) {
      updatedHistory.splice(0, updatedHistory.length - 20);
    }

    conversationHistory.set(conversationId, updatedHistory);

    console.log('Chat API - 请求:', {
      query: lastUserMessage.content,
      conversationId,
      historyLength: updatedHistory.length,
    });

    // 获取用户相关业务数据，注入系统提示词
    const customers = await dbGetCustomers({ userId: userInfo?.id, isAdmin });
    const customerSummary = customers.map((c: any) =>
      `${c.name}（状态：${c.status}，版本：${c.version || '未知'}）`
    ).join('\n');

    const todayDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

    const schedules = await dbGetSchedules({ userId: userInfo?.id, isAdmin });
    const scheduleSummary = schedules.slice(0, 10).map((s: any) =>
      `${s.schedule_date} - ${s.customer_name || '未知客户'}`
    ).join('\n');

    const systemPrompt = `你是"小蝶"，金蝶云星辰交付集成平台的智能助手。你的职责是帮助交付顾问管理客户、日程、实施日志等工作。

## 当前信息
- 当前用户：${userInfo?.username || '未知'}（角色：${isAdmin ? '管理员' : '普通用户'}）
- 当前日期：${todayDate}

## 用户的客户列表
${customerSummary || '暂无客户数据'}

## 近期日程
${scheduleSummary || '暂无日程数据'}

## 你的能力
1. 回答关于客户状态、日程安排、实施进度的问题
2. 帮助用户了解各客户的上线和验收情况
3. 提供金蝶云星辰产品的实施建议和最佳实践
4. 解答关于交付流程的疑问

## 注意事项
- 回答要简洁专业，使用中文
- 如果用户问到具体客户，优先从上面的客户列表中查找
- 如果无法确定答案，坦诚告知并建议用户查看相关页面
- 不要编造不存在的客户或数据`;

    // 构建消息列表
    const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...updatedHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // 估算输入 tokens
    const inputText = llmMessages.map(m => m.content).join('');
    const inputTokens = estimateTokens(inputText);
    const model = 'deepseek-v3-2-251201';

    // 使用 coze-coding-dev-sdk 流式调用
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const encoder = new TextEncoder();
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const llmStream = await llmClient.stream(llmMessages, {
            model,
            temperature: 0.7,
          });

          for await (const chunk of llmStream) {
            const content = typeof chunk.content === 'string' ? chunk.content : '';
            if (content) {
              fullResponse += content;
              controller.enqueue(encoder.encode(content));
            }
          }

          // 保存助手回复到历史
          if (fullResponse) {
            const currentHistory = conversationHistory.get(conversationId) || [];
            currentHistory.push({ role: 'assistant', content: fullResponse });
            conversationHistory.set(conversationId, currentHistory);
          }

          // 记录 token 用量
          const outputTokens = estimateTokens(fullResponse);
          await recordTokenUsage({
            userId: userInfo?.id || 'anonymous',
            model,
            inputTokens,
            outputTokens,
            apiType: 'chat',
          });

          controller.close();
        } catch (error) {
          console.error('LLM 流式输出错误:', error);
          controller.enqueue(encoder.encode('抱歉，我遇到了一些问题，请稍后再试。'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('对话API错误:', error);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
