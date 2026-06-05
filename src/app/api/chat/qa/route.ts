import { NextRequest } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';

const COZE_QA_API_URL = 'https://38y639jp6s.coze.site/stream_run';
const COZE_QA_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjMzOTRlNjFiLTAwYjEtNGE3Ny1iY2UzLWI4ZGYyMzI5MWE2NiJ9.eyJpc3MiOiJodHRwczovL2FwaS5jb3plLmNuIiwiYXVkIjpbIktIYll4dkRmS1ZvWDAyYUNEeVpvcUdKeVhjZG5ZV0dvIl0sImV4cCI6ODIxMDI2Njg3Njc5OSwiaWF0IjoxNzgwNjU2MDMzLCJzdWIiOiJzcGlmZmU6Ly9hcGkuY296ZS5jbi93b3JrbG9hZF9pZGVudGl0eS9pZDo3NjQ3NzEzMTg3NTcxMTcxMzM4Iiwic3JjIjoiaW5ib3VuZF9hdXRoX2FjY2Vzc190b2tlbl9pZDo3NjQ3ODU5NDI5NDc1MzUyNjExIn0.swMLhywAnhQ3ag34fzPlOn379cfpRTqLVWG2IsRmueVO7QieV90okea6Q9txyvVvpWHgp3QiS8kt0jlWBjTxtc5NjvZ7MYbwvS1QFw1S1DM30nNIS-itD1dVTQRl2uzN2A3o91TX8ixrvWfVc94q0JZyGzHUWrYXqcTpU_dJNqlHhKTwXOIGo0q03HlY3VT1erAPaLaEKL3INx5_A_Hhy7DX7i7GsDHIx44LwtfZ2LDKTq17Z-OoZa5HMMb_MC6alnldeGrxx5Mh9SNLeD2Jm84eTF1RuuWZAQ-zhqg2tHmxujLQ5tUAzf_GhBlQCZtS3xEK0pfuz50jhOd75U1rSg';

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

    // 只发送当前用户消息，不发送历史对话
    // 原因：Coze 侧可能存在历史缓存导致答非所问，且避免上下文超出限制
    const additionalMessages = [{
      role: 'user',
      content: userMessage,
      content_type: 'text',
    }];

    // 调用外部 Coze 智能体流式接口
    const requestBody = {
      user_id: `qa_${userInfo.id}_${Date.now()}`,
      conversation_id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      stream: true,
      additional_messages: additionalMessages,
      auto_save_history: false,
    };
    console.log('[QA] Request body:', JSON.stringify(requestBody, null, 2));
    const response = await fetch(COZE_QA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_QA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    console.log('[QA] Coze response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[QA] Coze API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: '答疑服务暂时不可用，请稍后重试' }), { status: 502 });
    }

    // 将外部 Coze SSE 流转换为前端可解析的统一 SSE 格式
    // 实际 SSE 格式:
    //   event: message
    //   data: {"type": "answer", "content": {"answer": "增量文本"}, "finish": false}
    //   data: {"type": "message_end", "content": {"message_end": {...}}, "finish": true}
    const encoder = new TextEncoder();
    const externalReader = response.body?.getReader();
    
    if (!externalReader) {
      return new Response(JSON.stringify({ error: '流式响应异常' }), { status: 500 });
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullAnswer = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const safeEnqueue = (data: Uint8Array) => {
          if (!closed) {
            try { controller.enqueue(data); } catch { /* already closed */ }
          }
        };
        const safeClose = () => {
          if (!closed) {
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
          }
        };
        try {
          while (true) {
            const { done, value } = await externalReader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();

              if (trimmed === '' || trimmed.startsWith('event:')) {
                continue;
              }

              if (trimmed.startsWith('data:')) {
                const raw = trimmed.slice('data:'.length).trim();

                if (raw === '[DONE]') {
                  safeEnqueue(encoder.encode('data: [DONE]\n\n'));
                  continue;
                }

                try {
                  const data = JSON.parse(raw);
                  const msgType = data.type;

                  // type=answer: 流式增量回答内容
                  if (msgType === 'answer') {
                    const content = data.content?.answer || '';
                    if (content) {
                      fullAnswer += content;
                      const outData = JSON.stringify({ content });
                      safeEnqueue(encoder.encode(`data: ${outData}\n\n`));
                    }
                    // finish=true 表示回答结束
                    if (data.finish === true) {
                      console.log('[QA] Full answer received:', fullAnswer.slice(0, 200));
                      safeEnqueue(encoder.encode('data: [DONE]\n\n'));
                      safeClose();
                      return;
                    }
                  }
                  // type=message_end: 消息完成
                  else if (msgType === 'message_end') {
                    console.log('[QA] Full answer received (message_end):', fullAnswer.slice(0, 200));
                    safeEnqueue(encoder.encode('data: [DONE]\n\n'));
                    safeClose();
                    return;
                  }
                  // type=error: 错误
                  else if (msgType === 'error') {
                    const errorMsg = data.content?.error || data.msg || data.message || '答疑服务异常';
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`));
                    safeEnqueue(encoder.encode('data: [DONE]\n\n'));
                    safeClose();
                    return;
                  }
                  // 其他类型（tool_request, tool_response, message_start 等）不转发给前端
                } catch {
                  // 忽略无法解析的行
                }
              }
            }
          }

          safeClose();
        } catch (error: any) {
          console.error('[QA] Stream error:', error);
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: '流式响应中断' })}\n\n`));
          safeEnqueue(encoder.encode('data: [DONE]\n\n'));
          safeClose();
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
