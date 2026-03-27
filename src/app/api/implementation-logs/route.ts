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

// 获取实施日志列表
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customer_id');

    if (!customerId) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    // 先验证客户是否属于当前用户
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('user_id', userId)
      .single();

    if (!customer) {
      return NextResponse.json({ error: '客户不存在或无权访问' }, { status: 404 });
    }

    const { data, error } = await client
      .from('implementation_logs')
      .select('*')
      .eq('customer_id', customerId)
      .eq('user_id', userId)  // 确保只能看到自己的日志
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
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);
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

    // 先验证客户是否属于当前用户
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .eq('user_id', userId)
      .single();

    if (!customer) {
      return NextResponse.json({ error: '客户不存在或无权操作' }, { status: 404 });
    }

    const { data, error } = await client
      .from('implementation_logs')
      .insert({
        customer_id,
        log_date,
        consumed_days,
        summary,
        meeting_link: meeting_link || null,
        user_id: userId,
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
