/**
 * LLM 调用模块
 * 使用 coze-coding-dev-sdk 进行流式/非流式大模型调用
 */

import { LLMClient, Config, type Message, type LLMConfig } from 'coze-coding-dev-sdk';

/** 模型配置 */
const PRIMARY_MODEL = 'doubao-seed-2-0-pro-260215';
const FALLBACK_MODEL = 'deepseek-v3-2-251201';

export interface LLMCallOptions {
  /** 自定义 HTTP 头（用于鉴权等） */
  customHeaders?: Record<string, string>;
  /** 使用指定模型（默认主模型） */
  model?: string;
  /** 温度（默认 0.01 以保证稳定输出） */
  temperature?: number;
}

/**
 * 流式调用大模型
 * 流式模式可以突破 invoke() 的 max_tokens 限制
 */
export async function callLLMStream(
  messages: Message[],
  options: LLMCallOptions = {},
): Promise<string> {
  const config = new Config();
  const client = new LLMClient(config, options.customHeaders);

  const llmConfig: LLMConfig = {
    model: options.model || PRIMARY_MODEL,
    temperature: options.temperature ?? 0.01,
  };

  let fullContent = '';
  const stream = client.stream(messages, llmConfig);

  for await (const chunk of stream) {
    if (chunk.content) {
      fullContent += chunk.content.toString();
    }
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
  const config = new Config();
  const client = new LLMClient(config, options.customHeaders);

  const llmConfig: LLMConfig = {
    model: options.model || PRIMARY_MODEL,
    temperature: options.temperature ?? 0.01,
  };

  const response = await client.invoke(messages, llmConfig);
  return response.content || '';
}

/** 导出模型常量供外部使用 */
export { PRIMARY_MODEL, FALLBACK_MODEL };
