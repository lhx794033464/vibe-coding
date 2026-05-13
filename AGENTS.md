# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)

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
- **用户权限管理（支持注册/登录/多账号数据隔离）**

## 认证与权限系统

### 默认账号
- **管理员账号**: admin / admin123

### 核心文件
- `src/services/dbService.ts` - 数据库服务层（用户CRUD + 认证）
- `src/contexts/AuthContext.tsx` - React 认证上下文（登录/注册/登出）
- `src/lib/serverAuth.ts` - 服务端认证工具（Token 解析 + 权限校验）
- `src/app/login/page.tsx` - 登录/注册页面
- `src/app/api/auth/login/route.ts` - 登录 API
- `src/app/api/auth/register/route.ts` - 注册 API
- `src/app/(main)/delivery-tools/users/page.tsx` - 用户管理界面
- `src/app/api/users/route.ts` - 用户管理 API
- `src/app/api/users/[id]/route.ts` - 用户详情 API

### 权限设计
- **管理员 (admin)**: 可查看和管理所有用户数据，访问用户管理功能
- **普通用户 (user)**: 仅可查看和管理自己的数据

### 认证流程
1. 用户通过 `/api/auth/login` 登录或 `/api/auth/register` 注册
2. 认证成功后服务端生成 Base64 Token（格式: `id:username:role:random`），存储到 LocalStorage
3. 前端每次请求携带 `Authorization: Bearer <token>` Header
4. 后端通过 `getCurrentUserInfo(request)` 解析 Token 获取用户身份
5. 未登录用户重定向到 `/login`
6. 非管理员访问管理功能时重定向到 `/unauthorized`

### 数据隔离
- 所有业务表通过 `user_id` 字段关联用户
- 管理员可查看所有数据，普通用户只能查看自己的数据
- 后端使用 `getVisibleCustomerIds()` + `filterByCustomerAccess()` 实现数据隔离

## 数据库架构

### 数据库表
| 表名 | 用途 |
|------|------|
| users | 用户账号（username, password_hash, role, is_active） |
| customers | 客户档案 |
| follow_up_records | 跟进记录 |
| schedules | 日程排期 |
| implementation_logs | 实施日志 |
| commission_records | 提成记录 |
| todos | 待办事项 |
| user_profiles | 用户配置 |

### RLS 策略
- 所有表启用 RLS，禁止 anon key 直接访问
- 后端使用 service_role_key 绕过 RLS，在 API 路由中实现数据隔离

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── (main)/         # 主要应用页面
│   │   ├── login/          # 登录/注册页面
│   │   ├── unauthorized/   # 未授权页面
│   │   └── api/            # API 路由
│   │       ├── auth/       # 认证 API（login/register）
│   │       ├── users/      # 用户管理 API
│   │       ├── customers/  # 客户 API
│   │       ├── schedule/   # 日程 API
│   │       ├── follow-ups/ # 跟进记录 API
│   │       ├── implementation-logs/ # 实施日志 API
│   │       ├── commissions/ # 提成 API
│   │       ├── dashboard/  # 看板 API
│   │       ├── export/     # 导出 API
│   │       ├── acceptance-doc/ # 验收单 API
│   │       ├── voice/      # 语音助手 API
│   │       └── tools/      # 交付工具 API
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── contexts/           # React 上下文
│   │   └── AuthContext.tsx # 认证上下文
│   ├── lib/                # 工具库
│   │   ├── serverAuth.ts   # 服务端认证
│   │   └── utils.ts        # 通用工具函数 (cn)
│   ├── services/           # 业务服务
│   │   └── dbService.ts    # 数据库服务层（Supabase）
│   ├── storage/database/   # 数据库配置
│   │   ├── supabase-client.ts # Supabase 客户端
│   │   └── shared/schema.ts # Drizzle Schema
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

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

- **认证存储**: 用户数据存储在 Supabase `users` 表，密码使用 Base64 哈希，会话 Token 存储在 LocalStorage
- **默认管理员**: 数据库初始化时自动创建 admin/admin123 账号
- **权限控制**: 基于角色的访问控制（RBAC），管理员可查看所有用户数据
- **数据隔离**: 所有业务 API 通过 user_id 字段过滤，管理员查看全部，普通用户仅查看自己
- **智能助手**: 使用 Coze Agent API，移除 SDK 依赖，直接 fetch 调用
- **架构分离**: 客户端通过 API 路由操作 Supabase，避免浏览器端直接依赖
- **全量数据库迁移**: 所有业务数据从 ServerStorage（文件存储）迁移到 Supabase（PostgreSQL），支持多账号数据持久化
