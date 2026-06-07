import { NextRequest } from 'next/server';
import { LLMClient, Config } from 'coze-coding-dev-sdk';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import {
  dbGetCustomers,
  dbGetSchedules,
  dbGetTodos,
  dbCreateTodo,
  dbGetFollowUps,
  dbGetImplementationLogs,
  dbGetCommissionRecords,
} from '@/services/dbService';

// ============ 工具函数 ============

function getTodayStr(): string {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().slice(0, 10);
}

// ============ Agent 工具定义 ============

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_dashboard',
    description: '获取数据看板统计信息，包括客户总数、上线率、验收率、1个月上线率、4个月上线率等关键业务指标',
    parameters: {},
  },
  {
    name: 'get_customers',
    description: '获取客户列表，可按名称搜索或查看全部客户',
    parameters: {
      search: { type: 'string', description: '搜索关键词（可选），按客户名称模糊搜索' },
    },
  },
  {
    name: 'get_todos',
    description: '获取待办事项列表，可按状态筛选',
    parameters: {
      status: { type: 'string', description: '筛选状态（可选）：pending（待办）、completed（已完成）、all（全部），默认pending' },
    },
  },
  {
    name: 'get_schedules',
    description: '获取日程排期列表，可按日期筛选',
    parameters: {
      date: { type: 'string', description: '日期（可选），格式YYYY-MM-DD，筛选指定日期的日程' },
    },
  },
  {
    name: 'get_follow_ups',
    description: '获取跟进记录列表',
    parameters: {
      customer_name: { type: 'string', description: '客户名称（可选），筛选指定客户的跟进记录' },
    },
  },
  {
    name: 'get_implementation_logs',
    description: '获取实施日志列表，包含人天消耗记录',
    parameters: {
      customer_name: { type: 'string', description: '客户名称（可选），筛选指定客户的实施日志' },
    },
  },
  {
    name: 'get_commission_records',
    description: '获取提成记录列表',
    parameters: {
      customer_name: { type: 'string', description: '客户名称（可选），筛选指定客户的提成记录' },
    },
  },
  {
    name: 'create_todo',
    description: '创建新的待办事项。当用户说"提醒我"、"帮我记一下"、"创建待办"、"添加任务"时使用此工具',
    parameters: {
      content: { type: 'string', description: '待办内容', required: true },
      due_date: { type: 'string', description: '截止日期，格式YYYY-MM-DD，默认今天' },
      priority: { type: 'string', description: '优先级：high/medium/low，默认medium' },
      customer_name: { type: 'string', description: '关联客户名称（可选），从客户列表中匹配' },
    },
  },
];

// ============ 工具执行器 ============

async function executeTool(
  toolName: string,
  params: Record<string, any>,
  context: AgentContext
): Promise<string> {
  const { userId, username, isAdmin, request } = context;

  switch (toolName) {
    case 'get_dashboard': {
      try {
        const dashboardRes = await fetch(
          `http://localhost:${process.env.DEPLOY_RUN_PORT || 5000}/api/dashboard?timeRange=all`,
          { headers: { Authorization: request.headers.get('Authorization') || '' } }
        );
        if (!dashboardRes.ok) return '获取看板数据失败';
        const dashboard = await dashboardRes.json();
        const d = dashboard.data || dashboard;
        return JSON.stringify({
          totalCustomers: d.totalCustomers || 0,
          onlineCustomers: d.onlineCustomers || 0,
          notOnlineCustomers: (d.totalCustomers || 0) - (d.onlineCustomers || 0),
          acceptedCustomers: d.acceptedCustomers || 0,
          notAcceptedCustomers: (d.totalCustomers || 0) - (d.acceptedCustomers || 0),
          onlineRate: `${(d.onlineRate || 0).toFixed(1)}%`,
          acceptanceRate: `${(d.acceptanceRate || 0).toFixed(1)}%`,
          oneMonthOnlineRate: `${(d.oneMonthOnlineRate || 0).toFixed(1)}%`,
          fourMonthsOnlineRate: `${(d.fourMonthsOnlineRate || 0).toFixed(1)}%`,
        });
      } catch (e) {
        return '获取看板数据失败';
      }
    }

    case 'get_customers': {
      const customers = await dbGetCustomers({ userId, username, isAdmin });
      const search = params.search?.toLowerCase();
      const filtered = search
        ? customers.filter((c: any) => c.name?.toLowerCase().includes(search))
        : customers;
      const summary = filtered.map((c: any) => ({
        name: c.name,
        status: c.status || 'not_online',
        acceptance_status: c.acceptance_status || 'not_accepted',
        version: c.version || '',
        modules: c.modules || '',
        consultant: c.consultant || '',
        consumed_days: c.consumed_days || 0,
        created_at: c.created_at ? String(c.created_at).slice(0, 10) : '',
      }));
      return JSON.stringify({ count: summary.length, customers: summary });
    }

    case 'get_todos': {
      const todos = await dbGetTodos({ userId });
      const status = params.status || 'pending';
      let filtered = todos;
      if (status === 'pending') filtered = todos.filter((t: any) => !t.completed);
      else if (status === 'completed') filtered = todos.filter((t: any) => t.completed);
      const summary = filtered.map((t: any) => ({
        content: t.content,
        priority: t.priority || 'medium',
        due_date: t.due_date ? String(t.due_date).slice(0, 10) : '',
        completed: t.completed,
        customer_name: t.customer_name || '',
      }));
      return JSON.stringify({ count: summary.length, todos: summary });
    }

    case 'get_schedules': {
      const schedules = await dbGetSchedules({ userId, isAdmin });
      const date = params.date;
      const filtered = date
        ? schedules.filter((s: any) => {
            const d = s.schedule_date || s.start_time;
            return d && String(d).startsWith(date);
          })
        : schedules;
      const summary = filtered.map((s: any) => ({
        customer_name: s.customer_name || '',
        schedule_date: s.schedule_date ? String(s.schedule_date).slice(0, 10) : '',
        notes: s.notes || '',
      }));
      return JSON.stringify({ count: summary.length, schedules: summary });
    }

    case 'get_follow_ups': {
      const followUps = await dbGetFollowUps({ userId, isAdmin });
      const customerName = params.customer_name?.toLowerCase();
      const filtered = customerName
        ? followUps.filter((f: any) => f.customer_name?.toLowerCase().includes(customerName))
        : followUps;
      const summary = filtered.slice(0, 20).map((f: any) => ({
        customer_name: f.customer_name || '',
        content: f.content || '',
        follow_date: f.follow_date ? String(f.follow_date).slice(0, 10) : '',
      }));
      return JSON.stringify({ count: summary.length, follow_ups: summary });
    }

    case 'get_implementation_logs': {
      const logs = await dbGetImplementationLogs({ userId, isAdmin });
      const customerName = params.customer_name?.toLowerCase();
      const filtered = customerName
        ? logs.filter((l: any) => l.customer_name?.toLowerCase().includes(customerName))
        : logs;
      const summary = filtered.slice(0, 20).map((l: any) => ({
        customer_name: l.customer_name || '',
        content: l.content || '',
        consumed_days: l.consumed_days || 0,
        log_date: l.log_date ? String(l.log_date).slice(0, 10) : '',
      }));
      return JSON.stringify({ count: summary.length, logs: summary });
    }

    case 'get_commission_records': {
      const records = await dbGetCommissionRecords({ userId, isAdmin });
      const customerName = params.customer_name?.toLowerCase();
      const filtered = customerName
        ? records.filter((r: any) => r.customer_name?.toLowerCase().includes(customerName))
        : records;
      const summary = filtered.slice(0, 20).map((r: any) => ({
        customer_name: r.customer_name || '',
        amount: r.amount || 0,
        status: r.status || 'pending',
        created_at: r.created_at ? String(r.created_at).slice(0, 10) : '',
      }));
      return JSON.stringify({ count: summary.length, records: summary });
    }

    case 'create_todo': {
      const { content, due_date, priority = 'medium', customer_name } = params;
      if (!content) return '错误：缺少待办内容';

      let customerId: string | undefined;
      if (customer_name) {
        const customerList = await dbGetCustomers({ userId, username, isAdmin });
        const matched = customerList.find(
          (c: any) => c.name === customer_name || c.name?.includes(customer_name)
        );
        if (matched) customerId = matched.id;
      }

      const todo = await dbCreateTodo({
        content,
        due_date: due_date || getTodayStr(),
        priority,
        customer_id: customerId || null,
        user_id: userId,
        completed: false,
      });

      return `待办已创建成功：${content} | 截止：${due_date || getTodayStr()} | 优先级：${priority}${customer_name ? ` | 关联客户：${customer_name}` : ''}`;
    }

    default:
      return `未知工具：${toolName}`;
  }
}

// ============ Agent 上下文 ============

interface AgentContext {
  userId: string;
  username: string | undefined;
  isAdmin: boolean;
  request: NextRequest;
}

// ============ 构建工具描述（给 LLM 看） ============

function buildToolsPrompt(): string {
  return TOOLS.map(t => {
    const params = Object.entries(t.parameters)
      .map(([k, v]) => `    - ${k}(${v.type}${v.required ? ', 必填' : ''}): ${v.description}`)
      .join('\n');
    return `### ${t.name}\n描述：${t.description}\n参数：\n${params || '    无参数'}`;
  }).join('\n\n');
}

// ============ Agent 系统提示词 ============

function buildAgentSystemPrompt(context: AgentContext): string {
  const today = getTodayStr();
  const { username, isAdmin } = context;

  return `你是"小蝶"，金蝶云星辰交付集成平台的智能助手。今天是${today}。
你的用户是"${username || '未知'}"，角色是${isAdmin ? '管理员' : '普通用户'}。

## 你的工作方式（重要！）

你是一个具备工具调用能力的 Agent。当用户提问时：
1. 如果问题需要查询数据（如看板指标、客户信息、待办事项等），**必须调用工具获取实时数据**
2. 调用工具时，只输出一个 JSON 对象，格式：{"tool": "工具名", "params": {...}}
3. 工具执行结果会返回给你，你再根据结果回答用户
4. 如果不需要工具就能回答（如闲聊），直接回答即可
5. **每次只能调用一个工具**，等拿到结果后再决定下一步

## 可用工具

${buildToolsPrompt()}

## 平台功能概览

本平台是"金蝶云星辰交付集成平台"，用于全生命周期管理客户实施进度：
1. **数据看板**：关键业务指标（客户总数、上线率、验收率、1/4个月上线率）
2. **客户管理**：客户档案，上线状态(online/not_online)、验收状态(accepted/not_accepted)
3. **跟进记录**：客户每次跟进的详细内容
4. **日程排期**：培训排期管理
5. **提成管理**：已验收客户可计提提成，支持申报→审核
6. **待办事项**：个人工作任务管理
7. **实施日志**：人天消耗记录

## 业务指标说明
- 上线率 = 已上线 / 总数 × 100%
- 验收率 = 已验收 / 总数 × 100%
- 1个月上线率 = 开通超30天客户中已上线比例
- 4个月上线率 = 开通超120天客户中已上线比例
- 上线状态和验收状态相互独立

## 重要规则
- 用户说"提醒我"、"帮我记一下"、"创建待办" → 调用 create_todo
- 用户问指标/数据 → 先调用对应工具获取实时数据，再回答
- 不要编造数据，一切以工具返回为准
- 回复要友好、简洁、专业`;
}

// ============ 主处理函数 ============

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return new Response(JSON.stringify({ error: '未认证' }), { status: 401 });
    }

    const context: AgentContext = {
      userId: userInfo.id,
      username: userInfo.username,
      isAdmin: userInfo.role === 'admin',
      request,
    };

    const body = await request.json();
    const messages = body.messages || [];

    // 构建 LLM 消息
    const systemPrompt = buildAgentSystemPrompt(context);
    const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    const recentMessages = messages.slice(-10);
    for (const msg of recentMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        llmMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const encoder = new TextEncoder();
    const client = new LLMClient(new Config());
    const MAX_ITERATIONS = 5;

    const readableStream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, any>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          let currentMessages = [...llmMessages];
          let iteration = 0;

          while (iteration < MAX_ITERATIONS) {
            iteration++;

            // 流式调用 LLM
            const stream = client.stream(currentMessages, { model: 'deepseek-v3-2-251201' });
            let fullResponse = '';

            for await (const chunk of stream) {
              const text = chunk.content || '';
              if (text) {
                fullResponse += text;
              }
            }

            if (!fullResponse.trim()) {
              send({ content: '抱歉，我暂时无法回答这个问题，请稍后再试。' });
              break;
            }

            // 尝试解析工具调用
            const toolMatch = fullResponse.match(/\{\s*"tool"\s*:\s*"(\w+)"\s*,\s*"params"\s*:\s*(\{[\s\S]*?\})\s*\}/);

            if (toolMatch) {
              const toolName = toolMatch[1];
              let params: Record<string, any> = {};

              try {
                params = JSON.parse(toolMatch[2]);
              } catch {
                send({ content: '工具参数解析失败，请重试。', agentThinking: true });
                break;
              }

              // 通知前端正在执行工具
              const toolDef = TOOLS.find(t => t.name === toolName);
              send({
                content: '',
                agentThinking: true,
                toolCall: { name: toolName, description: toolDef?.description || '' },
              });

              // 执行工具
              const toolResult = await executeTool(toolName, params, context);

              // 将工具调用和结果加入对话历史
              currentMessages.push({ role: 'assistant', content: fullResponse });
              currentMessages.push({
                role: 'user',
                content: `工具 ${toolName} 的执行结果：\n${toolResult}\n\n请根据以上结果回答用户的问题。如果还需要其他数据，继续调用工具；否则直接给出最终答案。`,
              });

              continue; // 继续循环
            }

            // 没有工具调用，输出最终回复
            // 流式输出最终回复
            send({ content: fullResponse });
            break;
          }

          if (iteration >= MAX_ITERATIONS) {
            send({ content: '处理超时，请简化您的问题后重试。' });
          }

          send({ content: '', done: true });
          controller.close();
        } catch (error: any) {
          console.error('[Agent] Chat error:', error);
          send({ content: '', error: error.message || '处理请求时出错' });
          send({ content: '', done: true });
          controller.close();
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
    console.error('[Agent] API error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
