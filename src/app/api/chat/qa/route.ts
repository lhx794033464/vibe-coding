import { NextRequest } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 金蝶云社区搜索 + FetchClient 提取 + LLM 筛选答疑
// 铁律：严格限定星辰产品范围，严禁回答其他产品线问题

const KDT_TOKEN = 'kdt_8f3980077028f2f4d45c862a6acbcc76';

// 星辰产品关键词白名单 — 用于识别问题是否属于星辰产品范围
const XINGCHEN_KEYWORDS = [
  '星辰', '云星辰', '金蝶云星辰', '金蝶AI星辰',
  '应收', '应付', '收款', '付款', '采购', '销售', '库存',
  '凭证', '科目', '总账', '明细账', '资产负债', '利润',
  '核算', '结账', '反结账', '过账', '期末', '期初',
  '客户', '供应商', '商品', '仓库', '出库', '入库',
  '发票', '税务', '增值税', '开票', '报销', '费用',
  '银行', '资金', '现金', '存款', '转账',
  '单据', '审批', '流程', '权限', '角色', '用户',
  '报表', '对账', '调汇', '核销', '坏账',
  '预收', '预付', '其他应收', '其他应付',
  '票据', '背书', '贴现', '承兑',
  '成本', '毛利', '进价', '售价',
  '序列号', '批号', '保质期', '多单位',
  '组装', '拆卸', '委外', '生产',
  '赠品', '促销', '折扣',
  // 旗舰版也属于星辰
  '旗舰版', '专业版', '标准版',
];

// 非星辰产品关键词 — 用于排除
const NON_XINGCHEN_KEYWORDS = [
  '星空', 'K/3', 'K3 Cloud', 'K3', 'BOS', '苍穹',
  'EAS', 's-HR', '管易', '精斗云', '金蝶云之家',
  'BI', '数据中台', 'APaaS', '低代码',
];

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
          // Step 1: 检查问题是否属于星辰产品范围
          sendStatus('🔍 正在分析问题...');

          const isXingchenRelated = checkXingchenScope(userMessage);

          if (!isXingchenRelated) {
            sendContent('\n\n⚠️ 很抱歉，我只能回答**金蝶云·星辰**产品相关的问题。您的问题似乎不属于星辰产品范围，请重新描述您在星辰产品中遇到的具体问题。');
            sendDone();
            return;
          }

          // Step 2: 使用 SearchClient 搜索金蝶社区
          sendStatus('🔍 正在搜索金蝶云社区...');

          let searchResults: Array<{ title: string; url: string; snippet: string }> = [];

          try {
            const { SearchClient, Config, HeaderUtils } = await import('coze-coding-dev-sdk');
            const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
            const config = new Config();
            const searchClient = new SearchClient(config, customHeaders);
            const searchQuery = `金蝶云星辰 ${userMessage}`;
            const results = await searchClient.advancedSearch(searchQuery, {
              sites: 'vip.kingdee.com',
              count: 8,
              needSummary: false,
            });

            if (results.web_items && results.web_items.length > 0) {
              searchResults = results.web_items.slice(0, 8).map((item: any) => ({
                title: item.title || '',
                url: item.url || '',
                snippet: item.snippet || '',
              }));
            }
          } catch (searchError: any) {
            console.error('[QA] Search error:', searchError.message);
          }

          // 同时用通用搜索补充
          try {
            const { SearchClient, Config, HeaderUtils } = await import('coze-coding-dev-sdk');
            const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
            const config = new Config();
            const searchClient = new SearchClient(config, customHeaders);
            const results = await searchClient.webSearch(`金蝶云星辰 ${userMessage}`, 5, false);

            if (results.web_items && results.web_items.length > 0) {
              for (const item of results.web_items.slice(0, 5)) {
                const url: string = item.url || '';
                // 只补充 vip.kingdee.com 的结果
                if (url.includes('vip.kingdee.com') && !searchResults.some(r => r.url === url)) {
                  searchResults.push({
                    title: item.title || '',
                    url: url,
                    snippet: item.snippet || '',
                  });
                }
              }
            }
          } catch (searchError: any) {
            console.error('[QA] Supplementary search error:', searchError.message);
          }

          if (searchResults.length === 0) {
            sendContent('\n\n未在金蝶云社区找到相关内容，请尝试更具体的描述或直接访问 [金蝶云社区](https://vip.kingdee.com) 搜索。');
            sendDone();
            return;
          }

          // Step 3: 用 FetchClient 提取排名靠前的文章内容
          sendStatus('📖 正在获取详细内容...');

          const fetchPromises = searchResults.slice(0, 3).map(async (result) => {
            try {
              const { FetchClient } = await import('coze-coding-dev-sdk');
              const fetchClient = new FetchClient();
              const fetchResult = await fetchClient.fetch(result.url);

              let content = '';
              if (fetchResult.content) {
                for (const item of fetchResult.content) {
                  if (item.text) {
                    content += item.text + '\n';
                  }
                }
              }
              return {
                ...result,
                fullContent: content.slice(0, 3000), // 限制内容长度
              };
            } catch {
              return result;
            }
          });

          const enrichedResults = await Promise.all(fetchPromises);

          // Step 4: 使用 LLM 生成最终回答
          sendStatus('🤔 正在生成回答...');

          try {
            const { LLMClient } = await import('coze-coding-dev-sdk');
            const llmClient = new LLMClient();

            const systemPrompt = `你是金蝶云·星辰产品的专业答疑助手。你的职责是根据搜索到的金蝶云社区内容，为用户解答关于金蝶云·星辰产品的问题。

## 铁律（必须严格遵守）
1. **只回答金蝶云·星辰产品相关问题**，如果搜索结果中涉及其他产品线（如星空、K/3、苍穹等），必须忽略
2. 回答必须基于搜索结果，不要编造不存在的内容
3. 如果搜索结果不足以回答问题，如实告知并建议用户访问金蝶云社区
4. 引用内容时附上来源链接

## 回答格式
- 使用清晰的分段和列表
- 操作步骤要详细具体
- 引用来源时使用格式：[来源](URL)
- 在回答末尾列出参考链接`;

            const searchContext = enrichedResults.map((r: any, i: number) => {
              return `### 搜索结果 ${i + 1}: ${r.title}\n链接: ${r.url}\n摘要: ${r.snippet}\n${r.fullContent ? `详细内容:\n${r.fullContent}` : ''}`;
            }).join('\n\n---\n\n');

            const llmMessages = [
              { role: 'system' as const, content: systemPrompt },
              { role: 'user' as const, content: `## 用户问题\n${userMessage}\n\n## 搜索结果\n${searchContext}\n\n请根据以上搜索结果回答用户的问题。` },
            ];

            const stream = llmClient.stream(llmMessages, { model: 'deepseek-v3-2-251201' });

            for await (const chunk of stream) {
              if (closed) return;

              const text = typeof chunk.content === 'string' ? chunk.content : '';
              if (text) {
                sendContent(text);
              }
            }

            sendDone();
          } catch (llmError: any) {
            console.error('[QA] LLM error:', llmError.message);
            // 如果 LLM 失败，直接返回搜索结果
            const fallbackContent = enrichedResults.map((r: any, i: number) => {
              return `${i + 1}. **${r.title}**\n   ${r.snippet}\n   链接: ${r.url}`;
            }).join('\n\n');

            sendContent(`\n\n以下是从金蝶云社区搜索到的相关内容：\n\n${fallbackContent}`);
            sendDone();
          }
        } catch (error: any) {
          console.error('[QA] Error:', error);
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

/**
 * 检查问题是否属于星辰产品范围
 */
function checkXingchenScope(question: string): boolean {
  // 如果明确提到非星辰产品，直接拒绝
  const lowerQuestion = question.toLowerCase();
  for (const keyword of NON_XINGCHEN_KEYWORDS) {
    if (lowerQuestion.includes(keyword.toLowerCase())) {
      return false;
    }
  }

  // 检查是否包含星辰相关关键词
  for (const keyword of XINGCHEN_KEYWORDS) {
    if (question.includes(keyword)) {
      return true;
    }
  }

  // 默认允许 — 大多数ERP问题都可能属于星辰
  // 通过搜索结果和LLM进一步过滤
  return true;
}
