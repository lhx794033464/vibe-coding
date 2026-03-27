import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseCredentials } from '@/storage/database/supabase-client';
import { createClient } from '@supabase/supabase-js';

// 游客用户ID
const GUEST_USER_ID = '00000000-0000-0000-0000-000000000000';

// 获取 supabase 客户端（支持游客模式）
function getClient(token?: string) {
  if (token && token !== 'guest') {
    return getSupabaseClient(token);
  }
  // 游客模式使用 anon key
  const { url, anonKey } = getSupabaseCredentials();
  return createClient(url, anonKey, {
    db: { timeout: 60000 },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 获取用户ID（支持游客模式）
async function getUserId(token?: string): Promise<string | null> {
  if (!token || token === 'guest') {
    return GUEST_USER_ID;
  }
  const client = getSupabaseClient(token);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return null;
  }
  return user.id;
}

// 更新待办
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);
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
      .eq('user_id', userId)
      .select()
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
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);

    const { error } = await client
      .from('todos')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除待办失败:', error);
    return NextResponse.json({ error: '删除待办失败' }, { status: 500 });
  }
}
