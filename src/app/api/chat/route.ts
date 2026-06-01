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
  return todos.map(t => {
    const status = t.completed ? '✅已完成' : (t.due_date && t.due_date < getTodayStr() ? '⚠️已逾期' : '⏳待办');
    const customer = t.customer_name ? ` [关联客户: ${t.customer_name}]` : '';
    const priority = t.priority === 'high' ? '🔴高' : t.priority === 'medium' ? '🟡中' : '🟢低';
    return `- [${t.id?.slice(0,8)}] ${priority} ${t.content}${customer} | 截止: ${t.due_date || '无'} | ${status}`;
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

      customersData = `\n\n【客户列表】(共${customers.length}个)\n` + 
        customers.map(c => `- ${c.name} | 上线状态: ${statusLabel[c.status] || c.status || '未知'} | 验收状态: ${acceptLabel[c.acceptance_status] || c.acceptance_status || '未知'} | 交付顾问: ${c.delivery_consultant || '未分配'}`).join('\n') +
        `\n\n【统计数据】上线率: ${onlineRate}% (${onlineCount}/${customers.length}) | 验收率: ${acceptanceRate}% (${acceptedCount}/${customers.length})`;
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
    todosData = `\n\n【待办事项】\n待办中(${pending.length}个):\n${formatTodoList(pending)}\n\n最近已完成:\n${formatTodoList(completed)}`;
  } catch {}

  return `你是"小蝶"，金蝶云星辰交付集成平台的智能助手。今天是${today}。

你可以帮助交付人员管理客户、日程和待办事项。请用简洁专业的中文回复。

## 业务指标计算口径（非常重要）

### 上线率
- 计算公式：上线率 = 已上线客户数 / 总客户数 × 100%
- "已上线"对应客户字段 status = "online"，"未上线"对应 status = "not_online"
- 回答上线率相关问题时，必须使用【统计数据】中给出的上线率数值，不要自行计算

### 验收率
- 计算公式：验收率 = 已验收客户数 / 总客户数 × 100%
- "已验收"对应客户字段 acceptance_status = "accepted"，"未验收"对应 acceptance_status = "not_accepted"
- 验收状态和上线状态是两个独立字段，已验收不等于已上线，反之亦然
- 回答验收率相关问题时，必须使用【统计数据】中给出的验收率数值，不要自行计算

## 核心概念区分（非常重要）

### 待办事项 vs 日程
- **待办事项**：交付人员的个人工作任务、待处理事项、跟进事项。当用户说"提醒我"、"帮我记一下"、"创建待办"、"添加任务"、"今日待办"等，一律创建待办事项。
- **日程**：仅用于记录培训排期，即为客户安排的培训时间和计划。只有当用户明确提到"培训排期"、"安排培训"、"培训日程"时才涉及日程，日程功能请引导用户到日程排期页面操作。

**判断规则**：除非明确提到"培训排期"或"培训日程"，否则用户要求创建的都应归类为待办事项。

### 关联客户
如果用户在待办中提到了某个公司或客户名称，应在创建待办时关联该客户。

## 待办事项操作能力

你可以帮用户创建待办和查询待办。

### 创建待办
当用户要求创建待办时，在回复末尾输出操作指令，格式：
\`\`\`
TODO_CREATE|内容|截止日期(YYYY-MM-DD)|优先级(high/medium/low)|关联客户名称(可选)
\`\`\`
示例：\`TODO_CREATE|完成客户上线培训|2026-06-01|high|自贡中铁二局地产新城投资有限公司\`

如果用户提到了公司名称，必须填入"关联客户名称"字段。如果提到的公司名在客户列表中能匹配到，系统会自动关联。

### 查询待办
直接根据系统提供的待办数据回答即可，无需输出操作指令。

**重要规则**：
1. 创建指令必须放在回复的最后一行，用 \`\`\` 包裹
2. 一条回复只能包含一个操作指令
3. 如果用户要求删除、修改、延期等操作，告知用户请到待办事项页面操作
4. 如果缺少必要信息（如待办内容），请先询问用户
5. 绝不能将待办事项创建为日程，两者是完全不同的功能

${customersData}${schedulesData}${todosData}`;
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
