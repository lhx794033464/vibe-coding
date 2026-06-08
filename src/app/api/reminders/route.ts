import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

interface TodoReminder {
  id: string;
  content: string;
  due_date: string;
  priority: string;
  customer_id: string | null;
  customer_name: string | null;
}

interface DeadlineReminder {
  id: string;
  name: string;
  delivery_deadline: string;
  days_remaining: number;
  status: string;
  implementation_type: string | null;
}

interface ReminderData {
  todoReminders: TodoReminder[];
  deadlineReminders: DeadlineReminder[];
}

export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const isAdmin = userInfo.role === 'admin';
    const client = getSupabaseClient();

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // ========== 1. 待办事项提醒：当天未完成的待办 ==========
    let todoQuery = client
      .from('todos')
      .select('id, content, due_date, priority, customer_id')
      .eq('completed', false);

    if (!isAdmin) {
      todoQuery = todoQuery.eq('user_id', userInfo.id);
    }

    const { data: todos, error: todoError } = await todoQuery;
    if (todoError) {
      console.error('获取待办提醒失败:', todoError.message);
      return NextResponse.json({ error: '获取待办提醒失败' }, { status: 500 });
    }

    // 过滤：截止日期 <= 今天（即今天到期或已逾期的未完成待办）
    const filteredTodos = (todos || []).filter((t: Record<string, unknown>) => {
      if (!t.due_date) return false;
      const dueDate = (t.due_date as string).split('T')[0];
      return dueDate <= todayStr;
    }) as TodoReminder[];

    // 批量获取关联的客户名称
    const customerIds = [...new Set(filteredTodos.map(t => t.customer_id).filter(Boolean))];
    let customerMap: Map<string, string> = new Map();
    if (customerIds.length > 0) {
      const { data: customers } = await client
        .from('customers')
        .select('id, name')
        .in('id', customerIds);
      customerMap = new Map((customers || []).map((c: any) => [c.id, c.name]));
    }

    const todoRemindersWithNames: TodoReminder[] = filteredTodos.map(t => ({
      id: t.id,
      content: t.content,
      due_date: t.due_date,
      priority: t.priority,
      customer_id: t.customer_id,
      customer_name: t.customer_id ? customerMap.get(t.customer_id) || null : null,
    })) as TodoReminder[];

    // ========== 2. 交付截止日提醒：3天内到期、未验收的客户 ==========
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

    let customerQuery = client
      .from('customers')
      .select('id, name, delivery_deadline, status, implementation_type, acceptance_status, dismissed')
      .not('delivery_deadline', 'is', null)
      .gte('delivery_deadline', todayStr)
      .lte('delivery_deadline', threeDaysLaterStr)
      .neq('acceptance_status', 'accepted');

    if (!isAdmin) {
      // 普通用户只看自己负责的客户
      customerQuery = customerQuery.eq('delivery_consultant', userInfo.username);
    }

    const { data: deadlineCustomers, error: deadlineError } = await customerQuery;
    if (deadlineError) {
      console.error('获取截止日提醒失败:', deadlineError.message);
      return NextResponse.json({ error: '获取截止日提醒失败' }, { status: 500 });
    }

    const deadlineReminders: DeadlineReminder[] = ((deadlineCustomers || []) as Record<string, unknown>[])
      .filter(c => !c.dismissed)
      .map(c => {
        const deadline = new Date(c.delivery_deadline as string);
        const diffMs = deadline.getTime() - new Date(todayStr).getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return {
          id: c.id as string,
          name: c.name as string,
          delivery_deadline: c.delivery_deadline as string,
          days_remaining: Math.max(0, daysRemaining),
          status: c.status as string,
          implementation_type: c.implementation_type as string | null,
        } satisfies DeadlineReminder;
      });

    // 按剩余天数升序排列（最紧急的排前面）
    deadlineReminders.sort((a, b) => a.days_remaining - b.days_remaining);

    // 按优先级排序待办
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    todoRemindersWithNames.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

    const result: ReminderData = {
      todoReminders: todoRemindersWithNames,
      deadlineReminders,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('获取提醒数据失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
