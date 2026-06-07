import { NextRequest } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

// 金蝶产品智能问答 — 使用 kdclub-ai-product-qa 技能
// 通过 cosmic_qa.py 调用金蝶云社区智能服务接口，支持流式输出

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/kdclub-ai-product-qa/scripts/cosmic_qa.py');

// ========== 辅助函数 ==========

/** 调用 cosmic_qa.py 并返回 stdout */
async function runScript(args: string[], timeout = 120000): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('python3', [SCRIPT_PATH, ...args], {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    if (stderr) {
      console.warn('[QA] Script stderr:', stderr.slice(0, 500));
    }

    return stdout;
  } catch (error: any) {
    console.error('[QA] Script error:', error.message);
    // 如果有 stdout 输出（部分结果），尝试使用
    if (error.stdout) {
      return error.stdout;
    }
    throw error;
  }
}

/** 解析脚本输出的 JSON Lines */
function parseJsonLines(output: string): any[] {
  const lines = output.split('\n').filter(l => l.trim());
  const results: any[] = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line));
    } catch {}
  }
  return results;
}

// ========== API 路由 ==========

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return new Response(JSON.stringify({ error: '未认证' }), { status: 401 });
    }

    const body = await request.json();
    const { action, token, productId, question, sessionId } = body;

    // ========== action: init — 初始化（检查 Token + 获取产品列表）==========
    if (action === 'init') {
      const stdout = await runScript(['--init']);
      const results = parseJsonLines(stdout);
      const initResult = results.find(r => r.type === 'init');

      if (!initResult) {
        return new Response(JSON.stringify({ error: '初始化失败' }), { status: 500 });
      }

      return new Response(JSON.stringify(initResult), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ========== action: save-token — 保存 Token ==========
    if (action === 'save-token') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token 不能为空' }), { status: 400 });
      }

      const stdout = await runScript(['--save-token', token]);
      const results = parseJsonLines(stdout);
      const saveResult = results.find(r => r.type === 'token_saved');

      if (!saveResult) {
        const errResult = results.find(r => r.type === 'error');
        return new Response(JSON.stringify({ error: errResult?.error || '保存 Token 失败' }), { status: 500 });
      }

      return new Response(JSON.stringify(saveResult), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ========== action: ask — 流式问答 ==========
    if (action === 'ask') {
      if (!question) {
        return new Response(JSON.stringify({ error: '问题不能为空' }), { status: 400 });
      }
      if (!productId) {
        return new Response(JSON.stringify({ error: '请先选择产品' }), { status: 400 });
      }

      const args = [
        '--question', question,
        '--product-id', String(productId),
      ];
      if (sessionId) {
        args.push('--session-id', sessionId);
      }

      const encoder = new TextEncoder();
      const safeEnqueue = (controller: any, data: Uint8Array) => {
        try { controller.enqueue(data); } catch { /* already closed */ }
      };

      const readableStream = new ReadableStream({
        async start(controller) {
          let closed = false;
          const close = () => {
            if (!closed) { closed = true; try { controller.close(); } catch {} }
          };
          const send = (data: string) => {
            if (!closed) safeEnqueue(controller, encoder.encode(`data: ${data}\n\n`));
          };
          const sendStatus = (text: string) => {
            send(JSON.stringify({ status: text }));
          };
          const sendContent = (text: string) => {
            send(JSON.stringify({ content: text }));
          };
          const sendDone = () => {
            send('[DONE]');
            close();
          };
          const sendError = (msg: string) => {
            send(JSON.stringify({ error: msg }));
            sendDone();
          };

          try {
            sendStatus('🔍 正在查询金蝶云社区...');

            const stdout = await runScript(args);
            const results = parseJsonLines(stdout);

            let fullAnswer = '';
            let answerFormat = 'markdown';
            let endSessionId = '';
            let searchSources: any[] = [];
            let thinkContent = '';

            for (const item of results) {
              if (item.type === 'error') {
                // 检查是否是 Token 相关错误
                if (item.errorCode === 'TOKEN_NOT_FOUND' || item.errorCode === 'UNAUTHORIZED') {
                  sendContent('\n\n⚠️ Token 已过期或无效，请重新配置 Token 后再试。');
                } else {
                  sendContent(`\n\n⚠️ ${item.error || '查询失败'}`);
                }
                continue;
              }

              if (item.type === 'think') {
                // 思考过程，不展示
                thinkContent += item.content || '';
                continue;
              }

              if (item.type === 'answer') {
                // 回答内容片段（流式输出）
                const content = item.content || '';
                fullAnswer += content;
                sendContent(content);
                continue;
              }

              if (item.type === 'end') {
                fullAnswer = item.fullAnswer || fullAnswer;
                answerFormat = item.answerFormat || 'markdown';
                endSessionId = item.sessionId || '';
                searchSources = item.searchSources || [];
                thinkContent = item.thinkContent || thinkContent;
              }
            }

            // 如果 fullAnswer 和已发送内容不一致，用 fullAnswer 重新发送
            // 但脚本输出中 answer 事件的内容拼接应该等于 fullAnswer
            // 所以这里只需要追加参考来源

            // 追加参考来源
            if (searchSources && searchSources.length > 0) {
              let sourcesMd = '\n\n---\n\n**参考来源**\n\n';
              searchSources.forEach((source: any, idx: number) => {
                const title = source.title || '文档';
                const url = source.url || '#';
                sourcesMd += `${idx + 1}. [${title}](${url})\n`;
              });
              sendContent(sourcesMd);
            }

            // 发送元数据（sessionId 用于多轮对话）
            send(JSON.stringify({
              meta: {
                sessionId: endSessionId,
                answerFormat,
              },
            }));

            sendDone();
          } catch (error: any) {
            console.error('[QA] Error:', error);
            if (!closed) {
              sendError('查询失败，请稍后重试');
            }
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
    }

    return new Response(JSON.stringify({ error: '未知操作' }), { status: 400 });
  } catch (error: any) {
    console.error('[QA] API error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
