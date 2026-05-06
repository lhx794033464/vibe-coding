# 业务流程图生成 MCP 技能

通过 AI 大模型（豆包/DeepSeek）生成 draw.io / mxGraphModel 格式的业务流程图 XML，支持金蝶云星辰标准单据命名和自定义业务领域。

## 功能特点

- **AI 驱动**：输入文字描述，自动生成结构化流程图
- **金蝶云星辰适配**：默认支持金蝶云星辰标准单据名（采购订单、销售出库单等）
- **自定义领域**：可指定任意业务领域和专业术语
- **智能布局**：支持纵向/横向自动布局
- **画布自适应**：自动调整画布尺寸适配长流程
- **三级重试**：主模型流式 → 降级模型流式 → 精简提示词，确保生成成功率
- **截断修复**：自动检测并修复被截断的 XML

## 在 WorkBuddy 中安装

### 方式一：本地安装（推荐）

1. 构建项目：
```bash
cd flowchart-mcp-skill
pnpm install
pnpm build
```

2. 在 WorkBuddy 的 MCP 配置中添加：
```json
{
  "mcpServers": {
    "flowchart": {
      "command": "node",
      "args": ["/绝对路径/flowchart-mcp-skill/dist/index.js"]
    }
  }
}
```

### 方式二：npx 运行

在 WorkBuddy 的 MCP 配置中添加：
```json
{
  "mcpServers": {
    "flowchart": {
      "command": "npx",
      "args": ["flowchart-mcp-skill"]
    }
  }
}
```

## 可用工具

### 1. generate_flowchart

根据文字描述生成业务流程图 XML，默认使用金蝶云星辰业务领域。

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt | string | 是 | 流程图描述文字 |
| direction | string | 否 | 布局方向：`vertical`(纵向，默认) / `horizontal`(横向) |
| model | string | 否 | 指定模型 ID，不填则使用默认模型 |

**示例调用**：
```
请用 generate_flowchart 工具生成流程图：
prompt: "采购申请单->采购订单审批->是否通过->采购订单->收料通知->来料检验->是否合格->采购入库单；不合格则退货"
direction: "vertical"
```

### 2. generate_flowchart_with_domain

指定业务领域生成流程图，可自定义领域名称、术语和补充提示词。

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt | string | 是 | 流程图描述文字 |
| direction | string | 否 | 布局方向 |
| domain_name | string | 否 | 业务领域名称，默认"业务流程图专家" |
| domain_terms | string | 否 | 领域术语列表，逗号分隔 |
| extra_prompt | string | 否 | 补充的系统提示词 |
| model | string | 否 | 指定模型 ID |

**示例调用**：
```
请用 generate_flowchart_with_domain 工具生成流程图：
prompt: "患者挂号->就诊->开处方->缴费->取药"
domain_name: "医疗业务流程专家"
domain_terms: "挂号,处方,医嘱,病历,住院,出院"
```

## 返回格式

成功：
```json
{
  "success": true,
  "xml": "<mxGraphModel>...</mxGraphModel>",
  "meta": {
    "attempt": "主模型流式",
    "elapsed_ms": 5200,
    "nodes": 12,
    "edges": 11,
    "cells": 25,
    "truncated": false
  }
}
```

失败：
```json
{
  "success": false,
  "error": "流程图生成失败，请简化流程描述后重试",
  "detail": "..."
}
```

## 生成的 XML 使用方式

1. **draw.io 桌面版**：打开 draw.io → 编辑 → 粘贴 XML → 导入
2. **draw.io 在线版**：访问 [app.diagrams.net](https://app.diagrams.net) → 扩展 → 从文本导入
3. **代码集成**：将 XML 传入 draw.io 嵌入组件渲染

## 默认支持的模型

| 模型 ID | 用途 |
|---------|------|
| `doubao-seed-2-0-pro-260215` | 主模型（默认） |
| `deepseek-v3-2-251201` | 降级模型（重试时使用） |

## 技术架构

```
prompt (文字描述)
  ↓
系统提示词构建 (buildSystemPrompt)
  ↓
LLM 流式调用 (callLLMStream)
  ↓
XML 提取 (extractMxGraphModel)
  ↓
XML 验证/清洗/画布适配 (validateAndCleanXml)
  ↓
输出 mxGraphModel XML
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式（监听变更）
pnpm dev

# 构建
pnpm build

# 测试
pnpm test
```

## 文件结构

```
flowchart-mcp-skill/
├── src/
│   ├── index.ts           # MCP Server 入口，工具注册
│   ├── llm.ts             # LLM 调用模块（流式/非流式）
│   ├── prompts.ts         # 提示词构建（标准/精简/领域配置）
│   └── xml-processor.ts   # XML 后处理（提取/验证/清洗/画布适配）
├── dist/                   # 构建输出
├── package.json
├── tsconfig.json
├── build.sh
└── README.md
```
