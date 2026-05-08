/**
 * LLM 调用模块（原生 fetch，OpenAI 兼容格式）
 * 零外部依赖，支持流式/非流式调用
 */

/** 模型配置 */
export const PRIMARY_MODEL = 'doubao-seed-2-0-pro-260215';
export const FALLBACK_MODEL = 'deepseek-v3-2-251201';

/** 消息类型（OpenAI 兼容格式） */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCallOptions {
  /** 使用指定模型 */
  model?: string;
  /** 温度 */
  temperature?: number;
  /** 是否流式输出 */
  streaming?: boolean;
  /** 自定义 baseUrl */
  baseUrl?: string;
  /** 自定义 API key */
  apiKey?: string;
}

/**
 * 获取 API 配置（从环境变量或参数）
 */
function getApiConfig(options: LLMCallOptions): { baseUrl: string; apiKey: string } {
  const baseUrl = options.baseUrl
    || process.env.FLOWCHART_LLM_BASE_URL
    || process.env.COZE_INTEGRATION_MODEL_BASE_URL
    || 'https://integration.coze.cn/api/v3';

  const apiKey = options.apiKey
    || process.env.FLOWCHART_LLM_API_KEY
    || process.env.COZE_LOOP_API_TOKEN
    || '';

  if (!apiKey) {
    throw new Error(
      '未配置 LLM API Key。请设置以下环境变量之一：\n' +
      '  FLOWCHART_LLM_API_KEY（推荐）\n' +
      '  COZE_LOOP_API_TOKEN'
    );
  }

  return { baseUrl, apiKey };
}

/**
 * 解析 SSE 流
 */
async function* parseSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string, void, unknown> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // 忽略解析失败的行
      }
    }
  }

  // 处理缓冲区剩余内容
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim();
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // ignore
        }
      }
    }
  }
}

/**
 * 流式调用大模型
 * 流式模式可以突破 max_tokens 限制
 */
export async function callLLMStream(
  messages: Message[],
  options: LLMCallOptions = {},
): Promise<string> {
  const { baseUrl, apiKey } = getApiConfig(options);
  const model = options.model || PRIMARY_MODEL;
  const temperature = options.temperature ?? 0.01;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LLM API 错误 (${response.status}): ${text}`);
  }

  if (!response.body) {
    throw new Error('LLM API 未返回流数据');
  }

  let fullContent = '';
  const reader = response.body.getReader();
  for await (const chunk of parseSSEStream(reader)) {
    fullContent += chunk;
  }

  return fullContent;
}

/**
 * 非流式调用（降级方案）
 */
export async function callLLMInvoke(
  messages: Message[],
  options: LLMCallOptions = {},
): Promise<string> {
  const { baseUrl, apiKey } = getApiConfig(options);
  const model = options.model || PRIMARY_MODEL;
  const temperature = options.temperature ?? 0.01;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LLM API 错误 (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
