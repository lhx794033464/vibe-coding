import { NextRequest } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 金蝶AI星辰专属答疑助手 — Agent 架构
// 工具：search_kingdee_community（搜索社区）、get_kingdee_content_detail（获取详情）
// 铁律：强制搜索、严格限定星辰产品范围、禁止自编、禁止短链接

// 星辰产品线 ID（预留，搜索工具已内置过滤）

// ========== 工具定义 ==========

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_kingdee_community',
    description: '搜索金蝶云社区，返回与查询关键词相关的星辰产品线内容。搜索已内置 productLineId=35 过滤，只返回星辰产品线内容。标题为空的结果会自动补充详情摘要，并过滤非星辰内容。',
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

// ========== 工具实现 ==========

async function searchKingdeeCommunity(query: string): Promise<string> {
  try {
    const { SearchClient, Config, HeaderUtils } = await import('coze-coding-dev-sdk');
    const config = new Config();
    const searchClient = new SearchClient(config);

    // 使用 advancedSearch 限定 vip.kingdee.com
    const results = await searchClient.advancedSearch(`金蝶云星辰 ${query}`, {
      sites: 'vip.kingdee.com',
      count: 8,
      needSummary: false,
    });

    const items: Array<{ title: string; url: string; snippet: string; type: string }> = [];

    if (results.web_items && results.web_items.length > 0) {
      for (const item of results.web_items.slice(0, 8)) {
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

        // 为标题为空的结果补充摘要
        const displayTitle = title || `[${type}] ${snippet.slice(0, 60)}...`;

        items.push({ title: displayTitle, url, snippet, type });
      }
    }

    if (items.length === 0) {
      return '搜索未找到相关结果。请尝试更换关键词。';
    }

    return items.map((item, i) =>
      `[${i + 1}] 标题: ${item.title}\n    类型: ${item.type}\n    链接: ${item.url}\n    摘要: ${item.snippet}`
    ).join('\n\n');
  } catch (error: any) {
    console.error('[QA] search_kingdee_community error:', error.message);
    return '搜索工具暂时不可用，请稍后重试。';
  }
}

async function getKingdeeContentDetail(url: string): Promise<string> {
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

    if (!content) {
      return '无法获取该页面的详细内容。';
    }

    // 限制内容长度
    return content.slice(0, 5000);
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

          const MAX_ITERATIONS = 6; // 防止死循环
          let iteration = 0;
          let finalAnswerStarted = false;

          while (iteration < MAX_ITERATIONS && !closed) {
            iteration++;

            let assistantResponse = '';
            let toolCallParsed: { name: string; args: Record<string, string> } | null = null;
            let collectingToolCall = false;
            let bufferBeforeToolCall = '';

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
                // 检查工具调用是否完整（包含闭合括号）
                const callMatch = assistantResponse.match(/\[CALL:(\w+)\(([^)]*)\)\]/);
                if (callMatch) {
                  toolCallParsed = {
                    name: callMatch[1],
                    args: {},
                  };
                  // 解析参数
                  const argsStr = callMatch[2];
                  for (const pair of argsStr.split(',')) {
                    const [key, ...valueParts] = pair.split('=');
                    if (key && valueParts.length > 0) {
                      toolCallParsed.args[key.trim()] = valueParts.join('=').trim();
                    }
                  }
                  break; // 工具调用已完整，停止当前流
                }
                // 工具调用还未完整，继续收集
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

              // 添加助手回复到历史（包含工具调用）
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

              // 将工具结果作为用户消息反馈给 LLM
              conversationHistory.push({
                role: 'user',
                content: `[工具 ${toolName} 返回结果]\n${toolResult}\n\n请根据以上结果继续回答用户的问题。如果需要更多信息，可以再次调用工具。如果信息已足够，请直接输出最终回答。`,
              });

              // 继续循环，让 LLM 基于工具结果继续回答
              continue;
            }

            // 没有工具调用，LLM 已经给出最终回答
            // 流式内容已在前面的循环中输出
            break;
          }

          // 如果从未输出任何内容，给一个兜底
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
