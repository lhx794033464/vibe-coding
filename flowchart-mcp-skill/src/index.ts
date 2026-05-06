#!/usr/bin/env node

/**
 * 业务流程图生成 MCP 技能
 *
 * 通过 AI 大模型生成 draw.io / mxGraphModel 格式流程图 XML。
 * 可在 WorkBuddy 等 MCP 客户端中使用。
 *
 * 暴露工具：
 *   - generate_flowchart: 根据文字描述生成流程图 XML（金蝶云星辰领域）
 *   - generate_flowchart_with_domain: 指定业务领域生成流程图
 *
 * 使用方式（stdio 传输）：
 *   node dist/index.js
 *
 * 或在 WorkBuddy 的 MCP 配置中添加：
 *   {
 *     "mcpServers": {
 *       "flowchart": {
 *         "command": "node",
 *         "args": ["/绝对路径/flowchart-mcp-skill/dist/index.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { callLLMStream, PRIMARY_MODEL, FALLBACK_MODEL } from './llm.js';
import type { Message } from 'coze-coding-dev-sdk';
import { extractMxGraphModel, validateAndCleanXml } from './xml-processor.js';
import { buildSystemPrompt, buildCompactPrompt, KINGDEE_DOMAIN, type Direction, type DomainConfig } from './prompts.js';

// 最大重试次数
const MAX_RETRIES = 2;

// 创建 MCP Server
const server = new McpServer({
  name: 'flowchart-generator',
  version: '1.0.0',
});

// 工具1：生成流程图（金蝶云星辰领域）
const schema1 = z.object({
  prompt: z.string().describe('流程图描述文字，例如：采购申请单->采购订单审批->是否通过->采购订单->采购入库单'),
  direction: z.enum(['vertical', 'horizontal']).default('vertical').describe('布局方向：vertical=纵向(默认)，horizontal=横向'),
  model: z.string().optional().describe('指定模型 ID，不填则使用默认模型 doubao-seed-2-0-pro'),
});

server.tool(
  'generate_flowchart',
  '根据文字描述生成业务流程图 XML (draw.io / mxGraphModel 格式)。支持金蝶云星辰标准单据名，自动布局、自动适配画布尺寸。',
  schema1.shape as any,
  async (params: any) => {
    return await generateFlowchart(
      params.prompt as string,
      (params.direction as Direction) || 'vertical',
      KINGDEE_DOMAIN,
      params.model as string | undefined,
    );
  }
);

// 工具2：生成流程图（自定义领域）
const schema2 = z.object({
  prompt: z.string().describe('流程图描述文字'),
  direction: z.enum(['vertical', 'horizontal']).default('vertical').describe('布局方向'),
  domain_name: z.string().default('业务流程图专家').describe('业务领域名称，如"ERP业务流程专家"、"医疗流程专家"'),
  domain_terms: z.string().optional().describe('领域专用术语/单据列表，用逗号分隔，如"入库单,出库单,盘点单"'),
  extra_prompt: z.string().optional().describe('补充的系统提示词，附加到默认提示词末尾'),
  model: z.string().optional().describe('指定模型 ID'),
});

server.tool(
  'generate_flowchart_with_domain',
  '根据文字描述生成指定业务领域的流程图 XML。可自定义领域名称、专业术语和补充提示词。',
  schema2.shape as any,
  async (params: any) => {
    const domain: DomainConfig = {
      name: (params.domain_name as string) || '业务流程图专家',
      terms: params.domain_terms
        ? (params.domain_terms as string).split(',').map((t: string) => t.trim())
        : [],
      extraPrompt: params.extra_prompt as string | undefined,
    };
    return await generateFlowchart(
      params.prompt as string,
      (params.direction as Direction) || 'vertical',
      domain,
      params.model as string | undefined,
    );
  }
);

/**
 * 核心生成逻辑
 */
async function generateFlowchart(
  prompt: string,
  direction: Direction,
  domain: DomainConfig,
  modelOverride?: string,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!prompt || prompt.trim() === '') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: '流程图描述不能为空' }) }],
    };
  }

  const systemPrompt = buildSystemPrompt(direction, domain);
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  const startTime = Date.now();
  let lastError: string | null = null;
  let resultXml: string | null = null;

  // 三级重试策略
  const attempts: Array<{
    name: string;
    model: string;
    msgs: Message[];
  }> = [
    { name: '主模型流式', model: modelOverride || PRIMARY_MODEL, msgs: messages },
    { name: '降级模型流式', model: FALLBACK_MODEL, msgs: messages },
    {
      name: '精简提示词+主模型',
      model: modelOverride || PRIMARY_MODEL,
      msgs: [
        { role: 'system', content: buildCompactPrompt(direction) },
        { role: 'user', content: prompt },
      ],
    },
  ];

  for (let i = 0; i < attempts.length && i <= MAX_RETRIES; i++) {
    const attempt = attempts[i];
    try {
      const content = await callLLMStream(attempt.msgs, { model: attempt.model });

      if (!content || content.trim() === '') {
        lastError = 'AI 返回内容为空';
        continue;
      }

      const { xml: rawXml, error: extractError, isTruncated } = extractMxGraphModel(content);

      if (!rawXml || extractError) {
        lastError = extractError || '未能提取有效 XML';
        continue;
      }

      const { xml: cleanedXml, error: validateError } = validateAndCleanXml(rawXml);

      if (!cleanedXml || validateError) {
        lastError = validateError || 'XML 验证失败';
        continue;
      }

      resultXml = cleanedXml;

      const elapsed = Date.now() - startTime;
      const cellCount = (cleanedXml.match(/<mxCell/g) || []).length;
      const nodeCount = (cleanedXml.match(/vertex="1"/g) || []).length;
      const edgeCount = (cleanedXml.match(/edge="1"/g) || []).length;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              xml: resultXml,
              meta: {
                attempt: attempt.name,
                elapsed_ms: elapsed,
                nodes: nodeCount,
                edges: edgeCount,
                cells: cellCount,
                truncated: isTruncated,
              },
            }),
          },
        ],
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : '未知错误';
      continue;
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: '流程图生成失败，请简化流程描述后重试',
          detail: lastError,
        }),
      },
    ],
  };
}

// 启动 MCP Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Flowchart MCP Server started on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
