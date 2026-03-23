import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取实施日志列表
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
    const customerId = searchParams.get('customer_id');

    if (!customerId) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    const { data, error } = await client
      .from('implementation_logs')
      .select('*')
      .eq('customer_id', customerId)
      .order('log_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取实施日志失败:', error);
    return NextResponse.json({ error: '获取实施日志失败' }, { status: 500 });
  }
}

// 创建实施日志
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
    const { 
      customer_id, 
      log_date, 
      consumed_days, 
      summary, 
      meeting_link 
    } = body;

    if (!customer_id || !log_date || !consumed_days || !summary) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
    }

    const { data, error } = await client
      .from('implementation_logs')
      .insert({
        customer_id,
        log_date,
        consumed_days,
        summary,
        meeting_link: meeting_link || null,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建实施日志失败:', error);
    return NextResponse.json({ error: '创建实施日志失败' }, { status: 500 });
  }
}
