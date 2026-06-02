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

// 构建系统提示词
async function buildSystemPrompt(userId: string, isAdmin: boolean): Promise<string> {
  const today = getTodayStr();
  
  // 获取业务数据
  let customersData = '';
  let schedulesData = '';
  let todosData = '';
  
  try {
    const customers = await dbGetCustomers({ userId, isAdmin });
    if (customers.length > 0) {
      const statusLabel: Record<string, string> = { 'online': '已上线', 'not_online': '未上线', '延期上线': '延期上线' };
      const acceptLabel: Record<string, string> = { 'accepted': '已验收', 'not_accepted': '未验收' };
      const onlineCount = customers.filter(c => c.status === 'online').length;
      const acceptedCount = customers.filter(c => c.acceptance_status === 'accepted').length;
      const onlineRate = customers.length > 0 ? Math.round(onlineCount / customers.length * 1000) / 10 : 0;
      const acceptanceRate = customers.length > 0 ? Math.round(acceptedCount / customers.length * 1000) / 10 : 0;

      // 1个月上线率
      const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const customersOverOneMonth = customers.filter(c => c.opened_at && new Date(c.opened_at) <= oneMonthAgo);
      const oneMonthOnlineRate = customersOverOneMonth.length > 0
        ? Math.round(customersOverOneMonth.filter(c => c.status === 'online').length / customersOverOneMonth.length * 1000) / 10
        : 0;

      // 4个月上线率
      const fourMonthsAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
      const customersOverFourMonths = customers.filter(c => c.opened_at && new Date(c.opened_at) <= fourMonthsAgo);
      const fourMonthsOnlineRate = customersOverFourMonths.length > 0
        ? Math.round(customersOverFourMonths.filter(c => c.status === 'online').length / customersOverFourMonths.length * 1000) / 10
        : 0;

      customersData = `\n\n【客户列表】(共${customers.length}个)\n` + 
        customers.map(c => `- ${c.name} | 上线状态: ${statusLabel[c.status] || c.status || '未知'} | 验收状态: ${acceptLabel[c.acceptance_status] || c.acceptance_status || '未知'} | 交付顾问: ${c.delivery_consultant || '未分配'} | 开通时间: ${c.opened_at || '未知'}`).join('\n') +
        `\n\n【统计数据】上线率: ${onlineRate}% (${onlineCount}/${customers.length}) | 验收率: ${acceptanceRate}% (${acceptedCount}/${customers.length}) | 1个月上线率: ${oneMonthOnlineRate}% (开通超30天客户中已上线比例, ${customersOverOneMonth.filter(c => c.status === 'online').length}/${customersOverOneMonth.length}) | 4个月上线率: ${fourMonthsOnlineRate}% (开通超120天客户中已上线比例, ${customersOverFourMonths.filter(c => c.status === 'online').length}/${customersOverFourMonths.length})`;
    }
  } catch {}

  try {
    const schedules = await dbGetSchedules({ userId, isAdmin });
    const upcoming = schedules.filter(s => s.schedule_date >= today).slice(0, 10);
    if (upcoming.length > 0) {
      schedulesData = `\n\n【近期日程】(共${upcoming.length}个)\n` + 
        upcoming.map(s => `- ${s.schedule_date} | ${s.customer_name || '无客户'} | ${s.notes || ''}`).join('\n');
    }
  } catch {}

  try {
    const allTodos = await dbGetTodos({ userId });
    const pending = allTodos.filter(t => !t.completed);
    const completed = allTodos.filter(t => t.completed).slice(0, 5);
    const overdue = pending.filter(t => t.due_date && String(t.due_date).slice(0, 10) < getTodayStr());
    const todayTodo = pending.filter(t => t.due_date && String(t.due_date).slice(0, 10) === getTodayStr());
    todosData = `\n\n【待办事项】今日待办共${pending.length}个(其中${overdue.length}个已逾期):\n${formatTodoList(pending)}\n\n最近已完成:\n${formatTodoList(completed)}`;
  } catch {}

  return `你是"小蝶"，金蝶云星辰交付集成平台的智能助手。今天是${today}。

【重要规则】当用户询问任何业务指标（上线率、验收率、1个月上线率、4个月上线率等），你必须直接从下方【统计数据】中读取并回答，严禁说"需要查询"或"无法获取"。

${customersData}${schedulesData}${todosData}

## 业务指标计算口径（回答指标问题时必须参考）

- **上线率** = 已上线客户数 / 总客户数 × 100%（status="online"）
- **验收率** = 已验收客户数 / 总客户数 × 100%（acceptance_status="accepted"）
- **1个月上线率** = 开通超30天客户中已上线的比例（衡量短期交付效率）
- **4个月上线率** = 开通超120天客户中已上线的比例（衡量中长期交付质量）
- 上线率和1个月上线率是不同指标：上线率是所有客户，1个月上线率排除刚开通的客户
- 验收状态和上线状态独立：已验收≠已上线

## 平台功能概览

本平台是"金蝶云星辰交付集成平台"，用于全生命周期管理客户实施进度，主要功能模块：

1. **数据看板**：展示关键业务指标，包括客户总数、上线率、验收率、1个月上线率、4个月上线率等
2. **客户管理**：管理客户档案，每个客户有两个独立状态：
   - **上线状态**(status)：online(已上线) / not_online(未上线) / 延期上线
   - **验收状态**(acceptance_status)：accepted(已验收) / not_accepted(未验收)
3. **跟进记录**：记录客户每次跟进的详细内容
4. **日程排期**：管理培训排期，日历视图展示，法定节假日自动标红
5. **提成管理**：只有验收状态为"已验收"的客户才可计提提成，支持申报→审核流程
6. **待办事项**：个人工作任务管理，支持优先级、截止日期、关联客户
7. **交付工具**：腾讯文档集成、用户管理等
8. **智能助手**：即本助手

## 提成规则
- 只有验收状态为"已验收"(accepted)的客户才可计提提成
- 上线状态不影响提成，关键是验收状态

## 核心概念区分

### 待办事项 vs 日程
- **待办事项**：个人工作任务、待处理事项。当用户说"提醒我"、"帮我记一下"、"创建待办"、"今日待办"等，一律创建待办。
- **日程**：仅用于培训排期。只有明确提到"培训排期"、"安排培训"时才涉及日程。

### 关联客户
如果用户在待办中提到了某个公司或客户名称，应在创建待办时关联该客户。

## 待办事项操作能力

### 创建待办
当用户要求创建待办时，在回复末尾输出操作指令，格式：
\`\`\`
TODO_CREATE|内容|截止日期(YYYY-MM-DD)|优先级(high/medium/low)|关联客户名称(可选)
\`\`\`
示例：\`TODO_CREATE|完成客户上线培训|2026-06-01|high|自贡中铁二局地产新城投资有限公司\`

### 查询待办
直接根据系统提供的待办数据回答即可，无需输出操作指令。

**重要规则**：
1. 创建指令必须放在回复的最后一行，用 \`\`\` 包裹
2. 一条回复只能包含一个操作指令
3. 如果用户要求删除、修改、延期等操作，告知用户请到待办事项页面操作
4. 绝不能将待办事项创建为日程`;
}

// 解析并执行待办操作
async function executeTodoAction(action: string, userId: string, isAdmin: boolean = false): Promise<string> {
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
        const customerList = await dbGetCustomers({ userId, isAdmin });
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
    const body = await request.json();
    const messages = body.messages || [];
    const userId = body.userId;

    if (!userId) {
      return new Response(JSON.stringify({ error: '缺少用户信息' }), { status: 401 });
    }

    // 解析用户角色
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    // 构建系统提示词
    const systemPrompt = await buildSystemPrompt(userId, isAdmin);

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
      async pull(controller) {
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
            const result = await executeTodoAction(actionStr, userId, isAdmin);
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
