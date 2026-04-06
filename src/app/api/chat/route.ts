import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

// Coze Agent API 配置
const COZE_AGENT_URL = 'https://9xfg5j4czg.coze.site/stream_run';
const COZE_API_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE4NjZjYzMyLWNmZGYtNDM3Ni1iMDNhLWE1Nzk4NDk5NzJlMCJ9.eyJpc3MiOiJodHRwczovL2FwaS5jb3plLmNuIiwiYXVkIjpbIkJ1UW50SWtWN25oRVM4ZnNqZlpueXlpcmtENkk5dHRLIl0sImV4cCI6ODIxMDI2Njg3Njc5OSwiaWF0IjoxNzc1NDU0NzExLCJzdWIiOiJzcGlmZmU6Ly9hcGkuY296ZS5jbi93b3JrbG9hZF9pZGVudGl0eS9pZDo3NjIzNDM2MzY2ODA5OTIzNjE5Iiwic3JjIjoiaW5ib3VuZF9hdXRoX2FjY2Vzc190b2tlbl9pZDo3NjI1NTE5OTIwMDAzOTQwNDAzIn0.dzBHl3oJjgJ001pVAztCBY-B_a_C7F4LojB3K7VT6r6OQK6h-D0cl925K27w1mp0rLDg-8eybo8FR73MXvbAAynZVrQ9Fc2mrwxD_AKt6p7C7wCTxRX26EXwHZ1yLCXmd4OBFzxXcGQXK20DQ5GYU4M6S8UC2Dfj8OHz6c5j_sbNpWPy5JwWZk9Iq-Lk7yJyL0LB_dczqYuhihQtWgfyQJYwEVRa4LAaBZ3xdheL_l9kvtHnNDFpr8MlfST6wof3n2i69kL2JFb7mimQk4WfHzdLF_aZReNwAw6xrt8fg7RauAGX18CfXpQvEn-4YWEqjRbrXupIuQ2k5F_7X3_Q0w';

// 对话历史存储（简单实现，基于 conversation_id）
const conversationHistory: Map<string, Array<{role: string; content: string}>> = new Map();

export async function POST(request: NextRequest) {
  try {
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

    // 调用 Coze Agent API
    const response = await fetch(COZE_AGENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${COZE_API_TOKEN}`,
      },
      body: JSON.stringify({
        query: lastUserMessage.content,
        conversation_id: conversationId,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Coze Agent API 错误:', response.status, errorText);
      return new Response(JSON.stringify({ error: '智能助手服务暂时不可用' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 创建流式响应
    const encoder = new TextEncoder();
    let fullResponse = '';
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body?.getReader();
          if (!reader) {
            controller.enqueue(encoder.encode('抱歉，无法获取响应内容。'));
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // 解析 SSE 格式的数据（Coze Agent 格式）
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              const trimmedLine = line.trim();
              
              if (trimmedLine.startsWith('data: ')) {
                const data = trimmedLine.slice(6);
                
                if (data === '[DONE]') {
                  controller.close();
                  return;
                }
                
                try {
                  const parsed = JSON.parse(data);
                  
                  // Coze Agent 响应格式
                  if (parsed.type === 'answer' && parsed.content?.answer) {
                    fullResponse += parsed.content.answer;
                    controller.enqueue(encoder.encode(parsed.content.answer));
                  } else if (parsed.type === 'message_end') {
                    // 保存助手回复到历史
                    if (fullResponse) {
                      const currentHistory = conversationHistory.get(conversationId) || [];
                      currentHistory.push({ role: 'assistant', content: fullResponse });
                      conversationHistory.set(conversationId, currentHistory);
                    }
                    controller.close();
                    return;
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }
          }
          
          // 处理缓冲区中剩余的内容
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.trim().startsWith('data: ')) {
                const data = line.trim().slice(6);
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'answer' && parsed.content?.answer) {
                    fullResponse += parsed.content.answer;
                    controller.enqueue(encoder.encode(parsed.content.answer));
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }
          }
          
          // 保存助手回复到历史
          if (fullResponse) {
            const currentHistory = conversationHistory.get(conversationId) || [];
            currentHistory.push({ role: 'assistant', content: fullResponse });
            conversationHistory.set(conversationId, currentHistory);
          }
          
          controller.close();
        } catch (error) {
          console.error('流式输出错误:', error);
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
