import { NextRequest } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';

const COZE_QA_API_URL = 'https://38y639jp6s.coze.site/stream_run';
const COZE_QA_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjMzOTRlNjFiLTAwYjEtNGE3Ny1iY2UzLWI4ZGYyMzI5MWE2NiJ9.eyJpc3MiOiJodHRwczovL2FwaS5jb3plLmNuIiwiYXVkIjpbIktIYll4dkRmS1ZvWDAyYUNEeVpvcUdKeVhjZG5ZV0dvIl0sImV4cCI6ODIxMDI2Njg3Njc5OSwiaWF0IjoxNzgwNjQzMzM4LCJzdWIiOiJzcGlmZmU6Ly9hcGkuY296ZS5jbi93b3JrbG9hZF9pZGVudGl0eS9pZDo3NjQ3NzEzMTg3NTcxMTcxMzM4Iiwic3JjIjoiaW5ib3VuZF9hdXRoX2FjY2Vzc190b2tlbl9pZDo3NjQ3ODA0OTAyOTMxOTU1NzE4In0.BUUTZaKghTwqDwt93Hp1vlo5Rao9aRwgCgzsikr6jwQWUUlei6AwjR2KPDUhHhHqzng-cP9j7KqGq6OJ6p_lPZyNyvKhUUJeIMbkkfjckbcr2cG_inL1AXWYL85-GjDiJ78dzAe0jX61p914sPfzJwgy021yog0OVolnAV2qg8NlyqQaieCRI5GXo5F3LMlI6T2mxhPV1jyXLearV9USJPD4oiyr9WqgfABVleCSExT6p9a4QuhdveiB_QJsx9PQBWiDdUaeZc0TO4pUv9qdvalECvh0Rs1Cg76e7Q4oCjMs32x-yw0LDk2rASkKOfujFXHW-GZV89HJTIrqaE0Dfw';

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return new Response(JSON.stringify({ error: '未认证' }), { status: 401 });
    }

    const body = await request.json();
    const messages = body.messages || [];
    const userMessage = messages.length > 0 ? messages[messages.length - 1].content : '';

    if (!userMessage) {
      return new Response(JSON.stringify({ error: '消息不能为空' }), { status: 400 });
    }

    // 只取最近几轮对话作为上下文，避免超出智能体上下文窗口限制
    const recentMessages = messages.slice(-6);
    const additionalMessages = recentMessages.map((msg: { role: string; content: string }) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
      content_type: 'text',
    }));

    // 调用外部 Coze 智能体流式接口
    const response = await fetch(COZE_QA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_QA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userInfo.id || 'default_user',
        stream: true,
        additional_messages: additionalMessages,
        auto_save_history: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[QA] Coze API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: '答疑服务暂时不可用，请稍后重试' }), { status: 502 });
    }

    // 将外部 Coze SSE 流转换为前端可解析的统一 SSE 格式
    const encoder = new TextEncoder();
    const externalReader = response.body?.getReader();
    
    if (!externalReader) {
      return new Response(JSON.stringify({ error: '流式响应异常' }), { status: 500 });
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await externalReader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();

              if (trimmed === '') {
                currentEvent = '';
                continue;
              }

              if (trimmed.startsWith('event:')) {
                currentEvent = trimmed.slice('event:'.length).trim();
                continue;
              }

              if (trimmed.startsWith('data:')) {
                const raw = trimmed.slice('data:'.length).trim();

                if (currentEvent === 'done' || raw === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  continue;
                }

                try {
                  const data = JSON.parse(raw);

                  if (currentEvent === 'conversation.message.delta') {
                    // 提取实际回答内容（支持深度思考模式）
                    let content = '';
                    if (data.content) {
                      content = data.content;
                    } else if (data.reasoning_content) {
                      // 深度思考模式：思考过程暂不展示
                      continue;
                    }

                    if (content) {
                      const outData = JSON.stringify({ content });
                      controller.enqueue(encoder.encode(`data: ${outData}\n\n`));
                    }
                  } else if (currentEvent === 'conversation.chat.failed' || currentEvent === 'error') {
                    const errorMsg = data.msg || data.message || '答疑服务异常';
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`));
                  }
                } catch {
                  // 忽略无法解析的行
                }
              }
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error: any) {
          console.error('[QA] Stream error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: '流式响应中断' })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('[QA] API error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
