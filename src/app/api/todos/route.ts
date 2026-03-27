import { NextRequest, NextResponse } from 'next/server';
import { todosStorage } from '@/services/localStorage';

// 获取待办列表 - 本地存储模式
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    let todos = todosStorage.getAll();

    // 状态筛选
    if (status === 'completed') {
      todos = todos.filter((t: any) => t.completed);
    } else if (status === 'pending') {
      todos = todos.filter((t: any) => !t.completed);
    }

    // 排序：未完成的在前，按创建时间倒序
    todos.sort((a: any, b: any) => {
      if (a.completed === b.completed) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return a.completed ? 1 : -1;
    });

    return NextResponse.json({ data: todos });
  } catch (error) {
    console.error('获取待办列表失败:', error);
    return NextResponse.json({ error: '获取待办列表失败' }, { status: 500 });
  }
}

// 创建待办 - 本地存储模式
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, priority, due_date, customer_id } = body;

    if (!title) {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    }

    const data = todosStorage.create({
      title,
      content: content || null,
      priority: priority || 'medium',
      due_date: due_date || null,
      customer_id: customer_id || null,
      completed: false,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建待办失败:', error);
    return NextResponse.json({ error: '创建待办失败' }, { status: 500 });
  }
}
