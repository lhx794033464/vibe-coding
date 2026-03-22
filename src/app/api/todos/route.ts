import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取待办列表
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // 'pending' | 'completed' | 'all'
    const date = searchParams.get('date'); // ISO date string

    // 先处理自动delay逻辑：将昨天未完成的待办delay到今天
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    await client
      .from('todos')
      .update({ 
        due_date: today.toISOString(),
        updated_at: new Date().toISOString()
      })
      .lt('due_date', today.toISOString())
      .eq('completed', false)
      .eq('user_id', user.id);

    let query = client
      .from('todos')
      .select(`
        *,
        customers(name)
      `, { count: 'exact' })
      .eq('user_id', user.id);

    // 状态筛选
    if (status === 'pending') {
      query = query.eq('completed', false);
    } else if (status === 'completed') {
      query = query.eq('completed', true);
    }

    // 日期筛选
    if (date) {
      const targetDate = new Date(date);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      query = query
        .gte('due_date', targetDate.toISOString())
        .lt('due_date', nextDay.toISOString());
    }

    // 按优先级和日期排序
    query = query.order('priority', { ascending: false });
    query = query.order('due_date', { ascending: true });
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, count });
  } catch (error) {
    console.error('获取待办列表失败:', error);
    return NextResponse.json({ error: '获取待办列表失败' }, { status: 500 });
  }
}

// 创建待办
export async function POST(request: NextRequest) {
  try {
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
    const { content, customer_id, due_date, priority } = body;

    if (!content) {
      return NextResponse.json({ error: '待办内容不能为空' }, { status: 400 });
    }

    // 处理默认日期：下午5点前默认当天，5点后默认下一天
    let finalDueDate = due_date;
    if (!finalDueDate) {
      const now = new Date();
      const hour = now.getHours();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (hour < 17) {
        finalDueDate = today.toISOString();
      } else {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        finalDueDate = tomorrow.toISOString();
      }
    }

    const { data, error } = await client
      .from('todos')
      .insert({
        content,
        customer_id: customer_id || null,
        due_date: finalDueDate,
        priority: priority || 'low',
        user_id: user.id,
      })
      .select(`
        *,
        customers(name)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建待办失败:', error);
    return NextResponse.json({ error: '创建待办失败' }, { status: 500 });
  }
}
