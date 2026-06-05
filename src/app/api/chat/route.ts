import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { dbGetCustomers, dbGetSchedules, dbGetTodos, dbCreateTodo } from '@/services/dbService';

// 获取今天日期（UTC+8）
function getTodayStr(): string {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().slice(0, 10);
}

// 格式化待办列表
function formatTodoList(todos: any[]): string {
  if (!todos || todos.length === 0) return '暂无待办事项';
  return todos.map((t, i) => {
    const status = t.completed ? '✅已完成' : (t.due_date && t.due_date < getTodayStr() ? '⚠️已逾期' : '⏳待办');
    const customer = t.customer_name ? ` [关联客户: ${t.customer_name}]` : '';
    const priority = t.priority === 'high' ? '🔴高' : t.priority === 'medium' ? '🟡中' : '🟢低';
    const dueDate = t.due_date ? String(t.due_date).slice(0, 10) : '无';
    return `${i + 1}. ${priority} ${t.content}${customer} | 截止: ${dueDate} | ${status}`;
  }).join('\n');
}

// 从数据看板获取统计数据（复用看板逻辑，避免重复计算）
async function getDashboardStats(userId: string, username: string | undefined, isAdmin: boolean): Promise<string> {
  try {
    const now = new Date();

    // 获取客户（与数据看板一致：管理员获取全部，普通用户按 delivery_consultant 匹配）
    let customers: any[];
    if (isAdmin) {
      customers = await dbGetCustomers({ isAdmin: true });
    } else {
      const allCustomers = await dbGetCustomers({ isAdmin: true });
      customers = allCustomers.filter((c: any) => c.delivery_consultant === username);
    }

    // 只统计实施类型为"一对一交付"的项目（与数据看板一致）
    const filteredCustomers = customers.filter((c: any) => c.opened_at && c.implementation_type === '一对一交付');
    const totalCustomers = filteredCustomers.length;

    if (totalCustomers === 0) return '暂无统计数据';

    const onlineCount = filteredCustomers.filter((c: any) => c.status === 'online').length;
    const acceptedCount = filteredCustomers.filter((c: any) => c.acceptance_status === 'accepted').length;
    const onlineRate = Math.round(onlineCount / totalCustomers * 1000) / 10;
    const acceptanceRate = Math.round(acceptedCount / totalCustomers * 1000) / 10;

    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const customersOverOneMonth = filteredCustomers.filter((c: any) => new Date(c.opened_at) <= oneMonthAgo);
    const oneMonthOnlineRate = customersOverOneMonth.length > 0
      ? Math.round(customersOverOneMonth.filter((c: any) => c.status === 'online').length / customersOverOneMonth.length * 1000) / 10 : 0;

    const fourMonthsAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const customersOverFourMonths = filteredCustomers.filter((c: any) => new Date(c.opened_at) <= fourMonthsAgo);
    const fourMonthsOnlineRate = customersOverFourMonths.length > 0
      ? Math.round(customersOverFourMonths.filter((c: any) => c.status === 'online').length / customersOverFourMonths.length * 1000) / 10 : 0;

    return `上线率: ${onlineRate}% (${onlineCount}/${totalCustomers}) | 验收率: ${acceptanceRate}% (${acceptedCount}/${totalCustomers}) | 1月上线率: ${oneMonthOnlineRate}% | 4月上线率: ${fourMonthsOnlineRate}%`;
  } catch (e) {
    console.error('[chat] 获取看板统计失败:', e);
    return '统计数据获取失败';
  }
}

// 构建系统提示词
async function buildSystemPrompt(userId: string, username: string | undefined, isAdmin: boolean): Promise<string> {
  const today = getTodayStr();
  
  // 获取业务数据
  let customersData = '';
  let schedulesData = '';
  let todosData = '';
  let statsData = '';
  
  try {
    const customers = await dbGetCustomers({ userId, username, isAdmin });
    if (customers.length > 0) {
      const statusLabel: Record<string, string> = { 'online': '已上线', 'not_online': '未上线', '延期上线': '延期上线' };
      const acceptLabel: Record<string, string> = { 'accepted': '已验收', 'not_accepted': '未验收' };

      const displayCustomers = customers.slice(0, 30);
      customersData = `\n\n【客户列表】(共${customers.length}个${customers.length > 30 ? '，仅展示前30个' : ''})\n` + 
        displayCustomers.map(c => `- ${c.name} | 上线: ${statusLabel[c.status] || c.status || '未知'} | 验收: ${acceptLabel[c.acceptance_status] || c.acceptance_status || '未知'} | 顾问: ${c.delivery_consultant || '未分配'} | 开通: ${c.opened_at ? String(c.opened_at).slice(0, 10) : '未知'}`).join('\n');
    }
  } catch (e) {
    console.error('[chat] 获取客户数据失败:', e);
  }

  // 从数据看板获取统计数据
  statsData = await getDashboardStats(userId, username, isAdmin);

  try {
    const schedules = await dbGetSchedules({ userId, isAdmin });
    const upcoming = schedules.filter(s => s.schedule_date >= today).slice(0, 10);
    if (upcoming.length > 0) {
      schedulesData = `\n\n【近期日程】(共${upcoming.length}个)\n` + 
        upcoming.map(s => `- ${s.schedule_date} | ${s.customer_name || '无客户'} | ${s.notes || ''}`).join('\n');
    }
  } catch (e) {
    console.error('[chat] 获取日程数据失败:', e);
  }

  try {
    const allTodos = await dbGetTodos({ userId });
    const pending = allTodos.filter(t => !t.completed).slice(0, 15);
    const completed = allTodos.filter(t => t.completed).slice(0, 3);
    const overdue = pending.filter(t => t.due_date && String(t.due_date).slice(0, 10) < getTodayStr());
    const todayTodo = pending.filter(t => t.due_date && String(t.due_date).slice(0, 10) === getTodayStr());
    todosData = `\n\n【待办事项】今日待办共${pending.length}个(其中${overdue.length}个已逾期):\n${formatTodoList(pending)}\n\n最近已完成:\n${formatTodoList(completed)}`;
  } catch (e) {
    console.error('[chat] 获取待办数据失败:', e);
  }

  return `你是"小蝶"，金蝶云星辰交付集成平台的智能助手。今天是${today}。

【重要规则】当用户询问业务指标（上线率、验收率等），必须直接从下方【统计数据】中读取回答，严禁说"需要查询"。

${customersData}

【统计数据】${statsData}${schedulesData}${todosData}

## 指标口径
- 统计口径与数据看板一致：仅统计"一对一交付"类型客户
- 上线率 = 已上线/总数 | 验收率 = 已验收/总数
- 1月上线率 = 开通超30天中已上线比例 | 4月上线率 = 开通超120天中已上线比例
- 上线状态(status)和验收状态(acceptance_status)独立

## 待办操作
创建待办时在回复末尾输出：
\`\`\`
TODO_CREATE|内容|截止日期(YYYY-MM-DD)|优先级(high/medium/low)|关联客户(可选)
\`\`\`
示例：\`TODO_CREATE|完成上线培训|2026-06-01|high|XX公司\`

规则：1.指令放最后一行用\`\`\`包裹 2.仅支持创建，删除/修改请告知到待办页面操作 3.待办≠日程`;
}

// 解析并执行待办操作
async function executeTodoAction(action: string, userId: string, username: string | undefined, isAdmin: boolean = false): Promise<string> {
  const parts = action.split('|');
  const type = parts[0];

  try {
    if (type === 'TODO_CREATE') {
      const content = parts[1];
      const dueDate = parts[2] || getTodayStr();
      const priority = parts[3] || 'medium';
      const customerName = parts[4] || '';

      if (!content) return '创建失败：缺少待办内容';

      // 查找关联客户
      let customerId: string | undefined;
      if (customerName) {
        const customerList = await dbGetCustomers({ userId, username, isAdmin });
        const matched = customerList.find(c => c.name === customerName || c.name.includes(customerName));
        if (matched) customerId = matched.id;
      }

      await dbCreateTodo({
        content,
        due_date: dueDate,
        priority,
        customer_id: customerId,
        user_id: userId,
        completed: false,
      });

      return `✅ 待办已创建：${content} | 截止: ${dueDate} | 优先级: ${priority}${customerName ? ` | 关联客户: ${customerName}` : ''}`;
    }

    return `不支持的操作: ${type}`;
  } catch (error: any) {
    return `操作失败: ${error.message}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 从 Token 获取用户信息，不信任请求体中的 userId
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return new Response(JSON.stringify({ error: '未认证' }), { status: 401 });
    }
    const userId = userInfo.id;
    const username = userInfo.username;
    const isAdmin = userInfo.role === 'admin';

    const body = await request.json();
    const messages = body.messages || [];

    // 构建系统提示词
    const systemPrompt = await buildSystemPrompt(userId, userInfo?.username, isAdmin);

    // 构建 LLM 消息
    const llmMessages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 添加历史消息（最多保留最近20条）
    const recentMessages = messages.slice(-20);
    for (const msg of recentMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        llmMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // 调用 LLM
    const client = new LLMClient(new Config());
    const stream = client.stream(llmMessages);

    // 创建 ReadableStream 收集完整响应
    const encoder = new TextEncoder();
    let fullContent = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.content || '';
            if (text) {
              fullContent += text;
              // SSE 格式输出
              const data = JSON.stringify({ content: text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          // 流结束后，检查是否有待办操作指令
          const actionMatch = fullContent.match(/```\s*(TODO_\w+\|[\s\S]+?)```/);
          if (actionMatch) {
            const actionStr = actionMatch[1].trim().replace(/\n/g, '');
            const result = await executeTodoAction(actionStr, userId, username, isAdmin);
            // 发送操作结果
            const resultData = JSON.stringify({ 
              content: `\n\n---\n${result}`,
              todoAction: true,
              actionResult: result 
            });
            controller.enqueue(encoder.encode(`data: ${resultData}\n\n`));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error: any) {
          console.error('Chat stream error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
