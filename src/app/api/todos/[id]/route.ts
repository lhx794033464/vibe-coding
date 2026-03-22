import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 更新待办
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { content, customer_id, due_date, priority, completed } = body;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    
    if (content !== undefined) updateData.content = content;
    if (customer_id !== undefined) updateData.customer_id = customer_id || null;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (priority !== undefined) updateData.priority = priority;
    if (completed !== undefined) {
      updateData.completed = completed;
      updateData.completed_at = completed ? new Date().toISOString() : null;
    }

    const { data, error } = await client
      .from('todos')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(`
        *,
        customers(name)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '待办不存在或无权操作' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新待办失败:', error);
    return NextResponse.json({ error: '更新待办失败' }, { status: 500 });
  }
}

// 删除待办
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { error } = await client
      .from('todos')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除待办失败:', error);
    return NextResponse.json({ error: '删除待办失败' }, { status: 500 });
  }
}
