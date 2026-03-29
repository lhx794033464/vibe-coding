# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

- **项目理解加速**：初始可以依赖项目下`package.json`文件理解项目类型，如果没有或无法理解退化成阅读其他文件。
- **Hydration 错误预防**：严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。


## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 关键功能决策

### 流程图分批生成
- **背景**: 单次 AI 调用最多生成约 18 个节点的流程图，超长流程图需要分批处理
- **方案**: 
  - 第一批生成主干流程（15-18 个节点），返回 lastNode 信息
  - 第二批及以后基于上一批终点续写，通过 `previousNodes` 参数传递上一批的 XML 和最后一个节点
  - 服务端使用 `mergeXmlParts` 函数合并多批次 XML，自动解决节点 ID 冲突
- **API 参数**:
  - `batchMode: true` 启用分批模式
  - `batchIndex: number` 当前批次索引（从 0 开始）
  - `previousNodes?: { firstXml: string; lastNode: any }` 上一批数据（第二批及以后需要）
- **响应字段**:
  - `batchComplete: boolean` 是否已完成全部生成
  - `nextBatchIndex: number | null` 下一批次索引
  - `lastNode: object` 最后一个节点信息（用于续写定位）
  - `totalNodes: number` 当前累计节点数
  - `firstXml: string` **第二批及以后返回** - 原始第一批XML（供后续批次合并使用）
- **注意事项**: 服务端第二批响应必须包含 `firstXml` 字段，否则第三批及以后会因无法获取原始XML而报错




