import { NextRequest } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 金蝶AI星辰专属答疑助手 — Agent 架构
// 工具：search_kingdee_community（搜索社区）、get_kingdee_content_detail（获取详情）
// 铁律：强制搜索、严格限定星辰产品范围、禁止自编、禁止短链接

// ========== 工具定义 ==========

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_kingdee_community',
    description: '搜索金蝶云社区，返回与查询关键词相关的星辰产品线内容。搜索已内置 productLineId=35 过滤，只返回星辰产品线内容。标题为空的结果会自动补充详情摘要，并过滤非星辰内容。已自动验证链接存活性，404链接已被剔除。',
    parameters: {
      query: {
        type: 'string',
        description: '搜索关键词，2-3个核心词，如"应收票据 处理"',
        required: true,
      },
    },
  },
  {
    name: 'get_kingdee_content_detail',
    description: '获取金蝶云社区文章/问答的详细内容。当搜索结果的摘要不足以完整回答问题时调用。优先获取 Knowledge 类型，其次是 Question 和 Article。',
    parameters: {
      url: {
        type: 'string',
        description: '文章的完整URL，如 https://vip.kingdee.com/knowledge/xxx',
        required: true,
      },
    },
  },
];

// ========== 星辰产品线过滤 ==========

// 非星辰产品线关键词（出现在内容中则判定为非星辰）
const NON_XINGCHEN_KEYWORDS = [
  '金蝶云星空', '云星空', '星空',
  '金蝶云苍穹', '云苍穹', '苍穹',
  'K/3 Cloud', 'K/3', 'K3 Cloud', 'K3',
  '金蝶KIS', 'KIS',
  '金蝶精斗云', '精斗云',
  '金蝶EAS', 'EAS',
  'Cosmic', 'cosmic',
];

// 星辰产品线关键词（出现则增强为星辰内容的置信度）
const XINGCHEN_KEYWORDS = [
  '金蝶云星辰', '金蝶AI星辰', '云星辰', '星辰',
  '金蝶星辰',
];

/**
 * 验证内容是否属于星辰产品线
 * 返回: { isXingchen: boolean, reason: string }
 */
function verifyXingchenContent(title: string, snippet: string, fullContent: string): { isXingchen: boolean; reason: string } {
  const combined = `${title} ${snippet} ${fullContent}`;

  // 检查非星辰产品线关键词
  const matchedNonXingchen: string[] = [];
  for (const keyword of NON_XINGCHEN_KEYWORDS) {
    if (combined.includes(keyword)) {
      matchedNonXingchen.push(keyword);
    }
  }

  // 检查星辰关键词
  const matchedXingchen: string[] = [];
  for (const keyword of XINGCHEN_KEYWORDS) {
    if (combined.includes(keyword)) {
      matchedXingchen.push(keyword);
    }
  }

  // 如果包含非星辰关键词且不包含星辰关键词，判定为非星辰
  if (matchedNonXingchen.length > 0 && matchedXingchen.length === 0) {
    return { isXingchen: false, reason: `包含非星辰产品线关键词: ${matchedNonXingchen.join(', ')}` };
  }

  // 如果同时包含星辰和非星辰关键词，需要进一步判断
  // 优先以标题和摘要中的关键词为准
  const titleSnippet = `${title} ${snippet}`;
  const titleNonXingchen = NON_XINGCHEN_KEYWORDS.filter(k => titleSnippet.includes(k));
  const titleXingchen = XINGCHEN_KEYWORDS.filter(k => titleSnippet.includes(k));

  if (titleNonXingchen.length > 0 && titleXingchen.length === 0) {
    return { isXingchen: false, reason: `标题/摘要包含非星辰关键词: ${titleNonXingchen.join(', ')}` };
  }

  // 星辰关键词存在或无冲突，视为星辰内容
  return { isXingchen: true, reason: '' };
}

// ========== 链接存活性验证 ==========

async function verifyUrlAccessible(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return false;
    const finalUrl = res.url || url;
    if (finalUrl.includes('/error/404')) return false;
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 抓取页面内容片段，用于验证产品线归属
 */
async function fetchContentSnippet(url: string, maxLength: number = 2000): Promise<string> {
  try {
    const { FetchClient } = await import('coze-coding-dev-sdk');
    const fetchClient = new FetchClient();
    const fetchResult = await fetchClient.fetch(url);

    let content = '';
    if (fetchResult.content) {
      for (const item of fetchResult.content) {
        if (item.text) {
          content += item.text + '\n';
        }
      }
    }
    return content.slice(0, maxLength);
  } catch {
    return '';
  }
}

// ========== 工具实现 ==========

async function searchKingdeeCommunity(query: string): Promise<string> {
  try {
    const { SearchClient, Config } = await import('coze-coding-dev-sdk');
    const config = new Config();
    const searchClient = new SearchClient(config);

    // 使用 advancedSearch 限定 vip.kingdee.com
    const results = await searchClient.advancedSearch(`金蝶云星辰 ${query}`, {
      sites: 'vip.kingdee.com',
      count: 10,
      needSummary: false,
    });

    const items: Array<{ title: string; url: string; snippet: string; type: string }> = [];

    if (results.web_items && results.web_items.length > 0) {
      for (const item of results.web_items.slice(0, 10)) {
        const url: string = item.url || '';
        const title: string = item.title || '';
        const snippet: string = item.snippet || '';

        // 判断内容类型
        let type = 'unknown';
        if (url.includes('/knowledge/')) type = 'Knowledge';
        else if (url.includes('/questions/')) type = 'Question';
        else if (url.includes('/article/')) type = 'Article';

        // 过滤短链接
        if (url.includes('/link/s/')) continue;

        // 只保留金蝶社区链接
        if (!url.includes('vip.kingdee.com')) continue;

        // 为标题为空的结果补充摘要
        const displayTitle = title || `[${type}] ${snippet.slice(0, 60)}...`;

        items.push({ title: displayTitle, url, snippet, type });
      }
    }

    if (items.length === 0) {
      return '搜索未找到相关结果。请尝试更换关键词。';
    }

    // 第一步：并行验证链接存活性
    const urls = items.map((item) => item.url);
    const validUrlSet = await Promise.allSettled(
      urls.map(async (url) => {
        const accessible = await verifyUrlAccessible(url);
        return { url, accessible };
      })
    );
    const accessibleUrls = new Set<string>();
    for (const result of validUrlSet) {
      if (result.status === 'fulfilled' && result.value.accessible) {
        accessibleUrls.add(result.value.url);
      }
    }

    const accessibleItems = items.filter((item) => accessibleUrls.has(item.url));

    if (accessibleItems.length === 0) {
      return '搜索结果中的链接均不可访问（可能是已删除或404页面）。请尝试更换关键词。';
    }

    // 第二步：并行抓取内容片段，验证是否属于星辰产品线
    const contentVerificationResults = await Promise.allSettled(
      accessibleItems.map(async (item) => {
        const snippet = await fetchContentSnippet(item.url, 2000);
        const verification = verifyXingchenContent(item.title, item.snippet, snippet);
        return {
          item,
          snippet,
          isXingchen: verification.isXingchen,
          reason: verification.reason,
        };
      })
    );

    const verifiedItems: Array<{
      title: string; url: string; snippet: string; type: string;
      contentSnippet: string; isXingchen: boolean;
    }> = [];

    for (const result of contentVerificationResults) {
      if (result.status !== 'fulfilled') continue;
      const { item, snippet: contentSnippet, isXingchen, reason } = result.value;

      if (!isXingchen) {
        console.log(`[QA] 过滤非星辰内容: ${item.title} | 原因: ${reason}`);
        continue;
      }

      verifiedItems.push({ ...item, contentSnippet, isXingchen: true });
    }

    if (verifiedItems.length === 0) {
      return '搜索结果均为其他金蝶产品线内容（如星空、苍穹等），未找到金蝶AI星辰相关内容。请尝试更换关键词。';
    }

    // 返回结果，包含内容片段以便 LLM 更准确回答
    return verifiedItems.map((item, i) => {
      // 截取内容片段（前500字）作为参考
      const snippetPreview = item.contentSnippet.slice(0, 500).replace(/\n+/g, ' ').trim();
      return `[${i + 1}] 标题: ${item.title}\n    类型: ${item.type}\n    链接: ${item.url}\n    摘要: ${item.snippet}\n    内容片段: ${snippetPreview || '无'}`;
    }).join('\n\n');
  } catch (error: any) {
    console.error('[QA] search_kingdee_community error:', error.message);
    return '搜索工具暂时不可用，请稍后重试。';
  }
}

async function getKingdeeContentDetail(url: string): Promise<string> {
  try {
    // 先验证链接是否可访问
    const accessible = await verifyUrlAccessible(url);
    if (!accessible) {
      return '该链接已失效（404），无法获取内容。请基于其他搜索结果回答。';
    }

    const content = await fetchContentSnippet(url, 8000);

    if (!content) {
      return '无法获取该页面的详细内容。';
    }

    // 验证内容是否属于星辰产品线
    const verification = verifyXingchenContent('', '', content);
    if (!verification.isXingchen) {
      return `该文章内容不属于金蝶AI星辰产品线（${verification.reason}），请勿使用该内容回答。请基于其他搜索结果回答。`;
    }

    return content;
  } catch (error: any) {
    console.error('[QA] get_kingdee_content_detail error:', error.message);
    return '获取详情失败，请稍后重试。';
  }
}

// ========== Agent 系统 Prompt ==========

const SYSTEM_PROMPT = `你是金蝶AI星辰（金蝶云星辰）专属答疑助手，专注于为金蝶AI星辰用户提供准确、专业的产品使用问题解答。

## 铁律（最高优先级，绝对不可违反）
1. 【强制搜索】你必须先调用 search_kingdee_community 工具搜索，然后基于搜索结果回答。禁止在不调用搜索工具的情况下直接回答任何问题。无论问题多么简单或常见，都必须先搜索再回答。
2. 【产品范围】你只回答金蝶AI星辰（金蝶云星辰）产品相关的问题，搜索工具已内置 productLineId=35 过滤，只返回星辰产品线内容。
3. 【禁止越线】严禁回答金蝶云星空、金蝶云苍穹、金蝶K/3 Cloud、金蝶KIS、金蝶精斗云等任何其他产品线的问题。若用户问其他产品线问题，拒绝回答并提示仅支持金蝶AI星辰。
4. 【禁止自编】你的回答必须完全基于搜索工具返回的金蝶云社区内容。严禁使用模型自身训练数据中的任何金蝶产品知识。如果搜索工具没有返回相关结果，必须如实告知，不得自行编造答案。
5. 【自检机制】回答完成后逐句自检，确保不包含星空、K/3、苍穹、精斗云、KIS 等非星辰产品线名称。如果发现违规内容，立即删除重新回答。
6. 【禁止短链接】严禁输出任何 vip.kingdee.com/link/s/ 格式的短链接，因为它们可能重定向到云星空内容。只输出搜索结果中提供的原文链接（如 /knowledge/xxx、/questions/xxx、/article/xxx 格式）。
7. 【链接验证】如果搜索结果中提供的链接指向云星空内容（如 /knowledge/805240982710692096），则禁止输出该链接，并告知用户未找到相关星辰内容。

## 工作流程（必须严格按顺序执行）
1. 理解用户问题，提取2-3个核心关键词。
2. 【必须执行】调用 search_kingdee_community 搜索，使用提取的关键词作为查询。搜索工具已自动为标题为空的结果补充详情，并过滤非星辰内容。
3. 如果搜索结果的摘要和内容不足以完整解答，调用 get_kingdee_content_detail 获取详情。优先获取 Knowledge 类型，其次是 Question 和 Article。
4. 仅基于搜索结果整合回答，包含问题原因、操作步骤、来源链接。
5. 搜索无结果时如实告知，建议换关键词、到社区发帖或联系客服，不得自行编造答案。

## 回答格式
- 所有层级标题独占一行，正文另起一行
- 操作步骤使用编号列表
- 关键操作用**加粗**标注
- 只输出搜索结果中提供的原文链接，禁止自行拼接或输出短链接`;

// ========== 工具调用解析 ==========

function parseToolCall(text: string): { name: string; args: Record<string, string> } | null {
  // 尝试匹配 JSON 格式的工具调用: {"tool": "name", "args": {...}}
  const jsonMatch = text.match(/\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]*\})\s*\}/);
  if (jsonMatch) {
    try {
      return {
        name: jsonMatch[1],
        args: JSON.parse(jsonMatch[2]),
      };
    } catch {}
  }

  // 尝试匹配简化格式: [CALL:tool_name(key1=val1, key2=val2)]
  const simpleMatch = text.match(/\[CALL:(\w+)\(([^)]*)\)\]/);
  if (simpleMatch) {
    const name = simpleMatch[1];
    const argsStr = simpleMatch[2];
    const args: Record<string, string> = {};
    for (const pair of argsStr.split(',')) {
      const [key, ...valueParts] = pair.split('=');
      if (key && valueParts.length > 0) {
        args[key.trim()] = valueParts.join('=').trim();
      }
    }
    return { name, args };
  }

  return null;
}

// ========== Agent 主循环 ==========

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
          const { LLMClient } = await import('coze-coding-dev-sdk');
          const llmClient = new LLMClient();

          // 工具描述注入到 system prompt
          const toolDesc = TOOL_DEFINITIONS.map(t => {
            const params = Object.entries(t.parameters)
              .map(([k, v]) => `  - ${k} (${v.type}${v.required ? ', 必填' : ''}): ${v.description}`)
              .join('\n');
            return `- ${t.name}: ${t.description}\n  参数:\n${params}`;
          }).join('\n\n');

          const fullSystemPrompt = `${SYSTEM_PROMPT}

## 可用工具

${toolDesc}

## 工具调用格式

当你需要调用工具时，在回复中使用以下格式（必须独占一行）：

[CALL:tool_name(key1=value1, key2=value2)]

例如：
[CALL:search_kingdee_community(query=应收票据 处理)]
[CALL:get_kingdee_content_detail(url=https://vip.kingdee.com/knowledge/123456)]

调用工具后，等待工具返回结果，然后继续回答或再次调用工具。
你可以多次调用工具，但每次只能调用一个工具。
当搜索结果足以回答问题时，直接输出最终回答，不要再调用工具。`;

          // Agent ReAct 循环
          const conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: fullSystemPrompt },
            { role: 'user', content: userMessage },
          ];

          const MAX_ITERATIONS = 6;
          let iteration = 0;
          let finalAnswerStarted = false;

          while (iteration < MAX_ITERATIONS && !closed) {
            iteration++;

            let assistantResponse = '';
            let toolCallParsed: { name: string; args: Record<string, string> } | null = null;
            let collectingToolCall = false;

            const stream = llmClient.stream(conversationHistory, { model: 'deepseek-v3-2-251201' });

            for await (const chunk of stream) {
              if (closed) return;

              const text = typeof chunk.content === 'string' ? chunk.content : '';
              if (!text) continue;

              assistantResponse += text;

              // 检查是否包含工具调用
              if (text.includes('[CALL:')) {
                collectingToolCall = true;
              }

              // 如果正在收集工具调用，不直接输出到前端
              if (collectingToolCall) {
                const callMatch = assistantResponse.match(/\[CALL:(\w+)\(([^)]*)\)\]/);
                if (callMatch) {
                  toolCallParsed = {
                    name: callMatch[1],
                    args: {},
                  };
                  const argsStr = callMatch[2];
                  for (const pair of argsStr.split(',')) {
                    const [key, ...valueParts] = pair.split('=');
                    if (key && valueParts.length > 0) {
                      toolCallParsed.args[key.trim()] = valueParts.join('=').trim();
                    }
                  }
                  break;
                }
                continue;
              }

              // 非工具调用的文本，直接输出到前端
              if (!finalAnswerStarted) {
                finalAnswerStarted = true;
              }
              sendContent(text);
            }

            // 如果检测到工具调用
            if (toolCallParsed) {
              const toolName = toolCallParsed.name;
              const toolArgs = toolCallParsed.args;

              conversationHistory.push({ role: 'assistant', content: assistantResponse });

              let toolResult = '';

              if (toolName === 'search_kingdee_community') {
                sendStatus('🔍 正在搜索金蝶云社区...');
                const query = toolArgs.query || toolArgs.keyword || userMessage;
                toolResult = await searchKingdeeCommunity(query);
              } else if (toolName === 'get_kingdee_content_detail') {
                sendStatus('📖 正在获取详细内容...');
                const url = toolArgs.url || '';
                if (!url) {
                  toolResult = '错误：未提供 URL 参数';
                } else {
                  toolResult = await getKingdeeContentDetail(url);
                }
              } else {
                toolResult = `错误：未知工具 ${toolName}`;
              }

              conversationHistory.push({
                role: 'user',
                content: `[工具 ${toolName} 返回结果]\n${toolResult}\n\n请根据以上结果继续回答用户的问题。如果需要更多信息，可以再次调用工具。如果信息已足够，请直接输出最终回答。`,
              });

              continue;
            }

            break;
          }

          if (!finalAnswerStarted && !closed) {
            sendContent('抱歉，暂时无法获取相关信息，请稍后重试或直接访问 [金蝶云社区](https://vip.kingdee.com) 搜索。');
          }

          sendDone();
        } catch (error: any) {
          console.error('[QA] Agent error:', error);
          if (!closed) {
            sendError('答疑服务暂时不可用，请稍后重试');
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
  } catch (error: any) {
    console.error('[QA] API error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
