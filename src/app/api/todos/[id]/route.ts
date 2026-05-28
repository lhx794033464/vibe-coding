import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { dbUpdateTodo, dbDeleteTodo } from '@/services/dbService';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userInfo = getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, any> = { ...body };

    // Handle completion
    if (body.completed === true) {
      updates.completed_at = new Date().toISOString();
    } else if (body.completed === false) {
      updates.completed_at = null;
    }

    // Handle delay - push due_date forward
    if (body.delay_days) {
      const todo = await dbUpdateTodo(id, {});
      if (todo?.due_date) {
        const newDate = new Date(todo.due_date);
        newDate.setDate(newDate.getDate() + body.delay_days);
        updates.due_date = newDate.toISOString();
      }
      delete updates.delay_days;
    }

    const todo = await dbUpdateTodo(id, updates);
    if (!todo) {
      return NextResponse.json({ error: '待办不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: todo });
  } catch (error: any) {
    console.error('更新待办失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userInfo = getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    await dbDeleteTodo(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('删除待办失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
