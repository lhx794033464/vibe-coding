# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 项目概述

金蝶云星辰交付集成平台，全生命周期管理客户实施进度，包含：
- 客户档案管理
- 跟进记录
- 人天消耗统计
- 数据看板
- 日程排期
- 提成管理
- 智能语音助手
- 交付工具集
- **用户权限管理**

## 认证与权限系统

### 默认账号
- **管理员账号**: admin / admin123

### 核心文件
- `src/services/authService.ts` - 用户和认证服务
- `src/contexts/AuthContext.tsx` - React 认证上下文
- `src/app/login/page.tsx` - 登录页面
- `src/app/unauthorized/page.tsx` - 未授权页面
- `src/app/delivery-tools/users/page.tsx` - 用户管理界面
- `src/app/api/users/route.ts` - 用户管理 API
- `src/app/api/users/[id]/route.ts` - 用户详情 API

### 权限设计
- **管理员 (admin)**: 可查看和管理所有用户数据，访问用户管理功能
- **普通用户 (user)**: 仅可查看和管理自己的数据

### 认证流程
1. 用户访问任何受保护页面时，系统检查是否已登录
2. 未登录用户重定向到 `/login`
3. 非管理员访问管理功能时重定向到 `/unauthorized`

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
│   │   ├── (main)/         # 主要应用页面
│   │   ├── login/          # 登录页面
│   │   ├── unauthorized/   # 未授权页面
│   │   ├── delivery-tools/ # 交付工具（含用户管理）
│   │   └── api/            # API 路由
│   │       └── users/      # 用户管理 API
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── contexts/           # React 上下文
│   │   └── AuthContext.tsx # 认证上下文
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   ├── services/           # 业务服务
│   │   └── authService.ts  # 认证和用户服务
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

## 关键决策记录

- **认证存储**: 使用 Supabase 数据库存储用户数据，LocalStorage 存储会话
- **默认管理员**: 系统初始化时自动创建 admin/admin123 账号
- **权限控制**: 基于角色的访问控制，管理员可查看所有用户数据
- **智能助手**: 使用 Coze Agent API，移除 SDK 依赖，直接 fetch 调用
- **架构分离**: 客户端通过 API 路由操作 Supabase，避免浏览器端依赖


