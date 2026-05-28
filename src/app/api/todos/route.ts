import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { dbGetTodos, dbCreateTodo } from '@/services/dbService';

export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const completed = searchParams.get('completed');
    const customerId = searchParams.get('customer_id');
    const overdue = searchParams.get('overdue');

    const filters: Record<string, any> = { userId: userInfo.id };
    if (completed !== null) filters.completed = completed === 'true';
    if (customerId) filters.customerId = customerId;

    let todos = await dbGetTodos(filters);

    // Filter overdue items if requested
    if (overdue === 'true') {
      const now = new Date().toISOString();
      todos = todos.filter((t: any) => !t.completed && t.due_date < now);
    }

    // Attach customer names
    if (todos.length > 0) {
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      const client = getSupabaseClient();
      const customerIds = [...new Set(todos.map((t: any) => t.customer_id).filter(Boolean))];
      if (customerIds.length > 0) {
        const { data: customers } = await client
          .from('customers')
          .select('id, name')
          .in('id', customerIds);
        const customerMap = new Map((customers || []).map((c: any) => [c.id, c.name]));
        todos = todos.map((t: any) => ({
          ...t,
          customer_name: t.customer_id ? customerMap.get(t.customer_id) || null : null,
        }));
      }
    }

    return NextResponse.json({ data: todos });
  } catch (error: any) {
    console.error('获取待办失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { content, customer_id, due_date, priority } = body;

    if (!content || !due_date) {
      return NextResponse.json({ error: '待办内容和截止日期不能为空' }, { status: 400 });
    }

    const todo = await dbCreateTodo({
      content,
      customer_id: customer_id || null,
      due_date,
      priority: priority || 'medium',
      completed: false,
      user_id: userInfo.id,
    });

    return NextResponse.json({ success: true, data: todo }, { status: 201 });
  } catch (error: any) {
    console.error('创建待办失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
