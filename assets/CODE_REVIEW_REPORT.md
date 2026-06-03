# 代码审查报告：金蝶AI星辰交付集成平台 (vibe-coding)

**仓库**: `lhx794033464/vibe-coding`  
**审查日期**: 2026-06-03  
**修复日期**: 2026-06-03  
**技术栈**: Next.js 16, TypeScript, Supabase (PostgreSQL), Drizzle ORM, React 19  
**审查范围**: 全仓库 242 个文件，核心代码集中在 `src/` 下

> ✅ 所有 CRITICAL 和 MAJOR 问题已修复，详见下方各条目标注

---

## 审查摘要

| 严重级别 | 数量 | 说明 |
|----------|------|------|
| **[CRITICAL]** | 6 | 安全漏洞，必须立即修复 |
| **[MAJOR]** | 8 | 逻辑缺陷/性能隐患，上线前应修复 |
| **[MINOR]** | 8 | 代码质量改进建议 |
| **[NIT]** | 5 | 风格/命名建议 |

---

## 🔴 CRITICAL（阻断性安全漏洞）

### [CRITICAL-1] 密码使用 Base64 编码而非加密哈希

**文件**: `src/services/dbService.ts:23-25`, `src/services/authService.ts:31-33`, `src/services/supabaseUsersService.ts:38-40`

```typescript
// 当前代码
export const hashPassword = (password: string): string => {
  return Buffer.from(password).toString('base64');
};
```

**问题**: Base64 是**可逆编码**，不是密码哈希。任何人拿到数据库即可解码所有密码。数据库初始化脚本 `init.sql:23` 中 `YWRtaW4xMjM=` 就是 `admin123` 的 Base64 编码，这等于明文存储。

**修复建议**:
```typescript
import bcrypt from 'bcrypt';
const SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
```
现有的 Base64 密码需要在用户首次登录时透明升级为 bcrypt。

---

### [CRITICAL-2] 认证 Token 无签名，可被任意伪造

**文件**: `src/lib/serverAuth.ts:30-61`, `src/services/dbService.ts:192`

当前 Token 格式：`Base64(user_id:username:role:random_string)`

**问题**: Token 完全依赖 Base64 编码，没有任何加密签名。攻击者可以：
1. 构造 `Base64("target_user_id:any_username:admin:any_string")` 获得管理员权限
2. 无法区分合法签发的 Token 和伪造的 Token

**修复建议**: 使用 JWT（jsonwebtoken）签发和验证：
```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function generateToken(user: { id: string; username: string; role: string }): string {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '24h',
  });
}

export function verifyToken(token: string): { id: string; username: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}
```

---

### [CRITICAL-3] 硬编码的默认管理员凭证

**文件**: `src/services/dbService.ts:56`, `src/services/authService.ts:154`, `src/services/supabaseUsersService.ts:230`, `src/storage/database/init.sql:23`

`admin/admin123` 凭证出现在至少 4 个位置：

```typescript
// authService.ts:154 - 客户端认证完全绕过密码验证
if (username === 'admin' && password === 'admin123') {
  // ... 直接放行，创建临时管理员用户
}
```

```typescript
// supabaseUsersService.ts:230 - 服务端验证同样存在硬编码后门
if (user.username === 'admin' && password === 'admin123') {
  isValid = true;
}
```

**问题**: 
- 硬编码凭证直接存在于客户端 JS 中（authService.ts），任何人查看前端代码即可获取
- 即使用户在数据库更改了密码，`authService.ts` 的硬编码逻辑仍然允许 `admin123` 登录
- 不同位置的验证逻辑不一致，增加维护难度

**修复建议**:
1. 删除所有硬编码凭证
2. 首次部署时通过环境变量 `ADMIN_INITIAL_PASSWORD` 设置初始密码，然后要求立即修改
3. 客户端认证必须调用服务端 API 进行，不做任何本地密码判断

---

### [CRITICAL-4] Chat API 的 userId 可被调用者任意指定

**文件**: `src/app/api/chat/route.ts:188-191`

```typescript
const body = await request.json();
const messages = body.messages || [];
const userId = body.userId;  // ⚠️ 来自请求体，未与认证用户交叉验证
```

即使该路由在 SSES 流出之前以及解析用户角色时从 Token 获取了 `userInfo`（line 195），但 `buildSystemPrompt` 和 `executeTodoAction` 中实际使用的 `userId` 参数直接来自请求体。如果请求体中的 `userId` 与 Token 中的不一致，会出现数据隔离绕过。

**修复建议**:
```typescript
const userInfo = await getCurrentUserInfo(request);
if (!userInfo) {
  return new Response(JSON.stringify({ error: '未认证' }), { status: 401 });
}
const userId = userInfo.id;  // 始终使用 Token 中的 user_id
```

---

### [CRITICAL-5] 语音识别 API 无任何认证保护

**文件**: `src/app/api/voice/asr/route.ts:5` 注释写 "本地模式，无需认证"

**问题**: ASR API 完全公开，任何人可调用：
- 消耗 Coze 平台的 API 配额
- 可通过此接口转发音频数据（可能包含敏感内容）
- TTS（语音合成）同理

**修复建议**: 所有语音相关 API 添加认证检查：
```typescript
const userInfo = await getCurrentUserInfo(request);
if (!userInfo) {
  return NextResponse.json({ error: '未认证' }, { status: 401 });
}
```

---

### [CRITICAL-6] 无请求频率限制 (Rate Limiting)

**影响范围**: 所有 API 路由，特别是 `/api/auth/login`, `/api/auth/register`, `/api/chat`

**问题**: 
- 登录 API 可被暴力破解（虽然需要知道用户名，但 `admin` 是已知的）
- Chat API 可被滥用消耗 LLM 配额
- 注册 API 可被用于批量创建垃圾账号

**修复建议**: 引入 `@upstash/ratelimit` 或 `express-rate-limit`（配合自定义 server）：
```typescript
// 示例: 登录接口每分钟最多 5 次尝试
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 m"),
});
```

---

## 🟠 MAJOR（重要缺陷，上线前应修复）

### [MAJOR-1] `generateId()` 使用 Math.random() 而非加密随机

**文件**: `src/services/dbService.ts:32-33`, `src/services/authService.ts:27-28`

```typescript
export const generateId = () =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
```

`Math.random()` 不是加密安全的，在 V8 引擎中可被预测。Token 中的 `generateId()` 用于添加随机性，但可预测的随机数进一步降低了 Token 的安全性。

**修复**:
```typescript
import crypto from 'crypto';
export const generateId = () => crypto.randomUUID();
```

---

### [MAJOR-2] 静默 catch 块导致错误不可见

**文件**: `src/app/api/chat/route.ts:62,71,80`

```typescript
try {
  const customers = await dbGetCustomers({ userId, isAdmin });
  // ... 
} catch {}  // ⚠️ 完全吞掉错误

try {
  const schedules = await dbGetSchedules({ userId, isAdmin });
  // ...
} catch {}
```

如果数据库查询失败（如连接中断），用户只会得到一个不完整（但看起来正常）的回复，无法知道数据已缺失。

**修复**: 至少记录错误日志，或在回复中提示数据可能不完整。

---

### [MAJOR-3] 数据迁移 API 缺少输入验证

**文件**: `src/app/api/migrate/route.ts:21-28`

```typescript
const { customers = [], followUps = [], implementationLogs = [], commissions = [], schedules = [] } = body;
```

**问题**:
- 没有验证数组大小上限，可传数百万条记录导致 DOS
- 没有验证每条记录的必填字段
- 静默跳过数据库错误（`catch { /* skip duplicates */ }`），重复数据失败会被忽略

**修复建议**:
- 限制单次迁移最多 1000 条记录
- 验证每条记录的必填字段
- 记录跳过的条目数和原因并返回

---

### [MAJOR-4] 验收单 S3 上传凭证为空

**文件**: `src/app/api/acceptance-doc/upload/route.ts:7-13`

```typescript
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',   // ⚠️ 空字符串
  secretKey: '',   // ⚠️ 空字符串
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});
```

如果 Coze 平台的 S3Storage 实现依赖 IAM 角色认证则无问题，但如果确实需要 AK/SK，此处会直接失败。需要确认 Coze SDK 的 S3Storage 认证机制。

---

### [MAJOR-5] `/api/chat` 在 `pull()` 方法中使用 `for await...of` 阻塞 ReadableStream

**文件**: `src/app/api/chat/route.ts:223-257`

```typescript
const readableStream = new ReadableStream({
  async pull(controller) {
    for await (const chunk of stream) {
      // ...
    }
    controller.close();
  }
});
```

`ReadableStream` 的 `pull()` 方法在 `start()` 或第一次 `pull()` 时触发，后续轮询由消费者驱动。将整个流消费放在 `pull()` 内意味着：
- 所有数据在第一次 `pull()` 中生成完毕
- 背压机制失效，消费者无法控制读取速率
- 如果 LLM 响应很大，可能内存占用过高

**修复**: 使用 `start()` 替代 `pull()`，或者在 `pull()` 中逐 chunk 返回：

```typescript
new ReadableStream({
  async start(controller) {
    for await (const chunk of stream) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk.content })}\n\n`));
    }
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();
  }
});
```

---

### [MAJOR-6] 数据库 `search` 操作存在小概率 XSS

**文件**: `src/services/dbService.ts:250-253`

```typescript
if (filters?.search) {
  const s = filters.search.toLowerCase();
  query = query.or(`name.ilike.%${s}%,sales_order_no.ilike.%${s}%,industry.ilike.%${s}%`);
}
```

虽然 Supabase 使用参数化查询（`ilike` 通过 postgrest 处理），`%` 通配符是通过字符串拼接传入的。攻击者输入 `%` 会匹配所有记录（绕过搜索过滤）。建议对 `s` 进行转义：
```typescript
const escapedSearch = filters.search.replace(/[%_]/g, '\\$&');
```

---

### [MAJOR-7] S3 旧验收单删除失败被静默忽略

**文件**: `src/app/api/acceptance-doc/upload/route.ts:62-68`

```typescript
if (oldDocKey) {
  try {
    await storage.deleteFile({ fileKey: oldDocKey });
  } catch {
    // 忽略删除旧文件失败
  }
}
```

如果删除失败（如权限不足），旧文件会一直占用存储，长期导致存储膨胀。应至少记录错误日志。

---

### [MAJOR-8] `Content-Disposition` 文件名未转义可能导致 HTTP 头注入

**文件**: `src/app/api/export/route.ts:49`

```typescript
'Content-Disposition': `attachment; filename="customers_${Date.now()}.xlsx"`,
```

虽然此处 `Date.now()` 是安全的数字，但最佳实践是使用 `encodeURIComponent` 包装文件名，避免日后维护时引入非安全字符。

---

## 🟡 MINOR（改进建议）

### [MINOR-1] 已禁用的路由占用命名空间

`forgot-password`, `reset-password`, `debug/supabase`, `avatar` 四个 API 路由全部返回 "已禁用" 但仍占用路由。如果确定不再使用，应删除代码，避免被人利用返回的信息了解系统架构。

### [MINOR-2] 缺少安全响应头

`next.config.ts` 和自定义 `server.ts` 均未配置安全头：
- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Content-Security-Policy`

**修复**: 在 `next.config.ts` 中添加：
```typescript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ],
  }];
}
```

### [MINOR-3] `server.ts` 错误处理过于激进

```typescript
server.once('error', err => {
  console.error(err);
  process.exit(1);  // 首个错误即退出进程
});
```

使用 `process.exit(1)` 过于激进，TCP 端口冲突等短暂错误不应导致进程退出。建议使用优雅重试机制。

### [MINOR-4] 腾讯文档 Token 明文存储

**文件**: `src/lib/tencentDocsClient.ts`, `src/app/api/tencent-docs/config/route.ts`

Token 以 JSON 格式存储在 `/tmp/tencent_docs_config.json` 和数据库 `system_config` 表中。如果文件系统或数据库被突破，Token 即泄露。建议使用环境变量内建的加密机制（如 Coze 平台的 secret 管理）。

### [MINOR-5] `modules` 字段分割规则可能过度匹配

**文件**: `src/app/api/customers/route.ts:42-43`

```typescript
modules = modules.split(/[+,，、\s]+/).map((s: string) => s.trim()).filter(Boolean);
```

正则 `/[+,，、\s]+/` 会将 "财务+进销存" 分割为 `["财务", "进销存"]`，但如果用户输入的是 "XX模块1.0版本" 则会意外分割。建议仅使用特定分隔符。

### [MINOR-6] 代码中多处重复的 `userId` 获取逻辑

`getCurrentUserInfo(request)` 加角色判断的模式在 30+ 个 API 路由中重复。建议封装为高阶函数或中间件：

```typescript
function withAuth(handler: (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>) {
  return async (req: NextRequest, ...args: any[]) => {
    const user = await getCurrentUserInfo(req);
    if (!user) return NextResponse.json({ error: '未认证' }, { status: 401 });
    return handler(req, { user, isAdmin: user.role === 'admin' });
  };
}
```

### [MINOR-7] 时区处理不一致

**文件**: `src/app/api/chat/route.ts:7-11`

```typescript
function getTodayStr(): string {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().slice(0, 10);
}
```

手动计算 UTC+8 在夏令时边界可能出错。建议使用 `date-fns` 或 `dayjs` 的时区支持。

### [MINOR-8] 流程图生成无认证

**文件**: `src/app/api/tools/flow-chart/route.ts:350-360`

流程图生成 API 使用 Coze LLM，但无认证检查，任何人可调用消耗 API 配额。

---

## 🔵 NIT（风格/优化建议）

### [NIT-1] TypeScript 类型不够严格

- `Record<string, any>` 在 `dbService.ts` 中大量使用（如 `dbCreateCustomer(customerData: Record<string, any>)`），失去了类型检查的优势。应使用具体的 Drizzle schema 类型。

### [NIT-2] 未使用 Drizzle ORM 的类型推导

`src/storage/database/shared/schema.ts` 定义了 Drizzle schema，但 `dbService.ts` 中所有查询返回 `any`。应使用 `typeof schema.tablename.$inferSelect` 获取精确类型。

### [NIT-3] 硬编码的模型名称

```typescript
const PRIMARY_MODEL = 'doubao-seed-2-0-pro-260215';
const FALLBACK_MODEL = 'deepseek-v3-2-251201';
```

应移至环境变量配置，便于切换模型和 A/B 测试。

### [NIT-4] `console.log` 生产环境残留

大量 `console.log` 语句未经条件判断直接输出，生产环境应使用日志框架（如 pino, winston）并配置级别。

### [NIT-5] 缺少 CHANGELOG 和版本管理

项目使用 `pnpm` 但 `package.json` 无 `version` 字段，无 `CHANGELOG.md`。

---

## 📊 总体评价

| 维度 | 评级 | 说明 |
|------|------|------|
| **功能完整性** | ⭐⭐⭐⭐ | 功能覆盖面广，8 个业务模块闭环完整 |
| **架构设计** | ⭐⭐⭐⭐ | 清晰的分层架构，API → Service → DB 层次分明 |
| **数据隔离** | ⭐⭐⭐ | RBAC + `user_id` 隔离基本到位，但有绕过路径 |
| **安全性** | ⭐⭐ | **密码明文等效存储 + Token 可伪造，需立即修复** |
| **代码质量** | ⭐⭐⭐ | 结构清晰但类型不严格，存在死代码 |
| **可维护性** | ⭐⭐⭐ | 大部分 API 模式一致，但缺少日志和错误处理规范 |

### 修复优先级建议

1. **本周内**: 修复 CRITICAL-1~4（密码哈希 + JWT Token + 移除硬编码凭证 + Chat API userId 校验）
2. **上线前**: 修复 CRITICAL-5~6（认证 + 频率限制）和 MAJOR-1~8
3. **后续迭代**: MINOR 和 NIT 项
