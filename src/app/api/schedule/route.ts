import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseCredentials } from '@/storage/database/supabase-client';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

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

/**
 * GET /api/schedule - 获取日程列表
 * Query params: start, end (日期范围)
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);
    
    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // 构建查询
    let query = client
      .from('schedules')
      .select(`
        id,
        customer_id,
        schedule_date,
        notes,
        user_id,
        created_at
      `)
      .eq('user_id', userId)
      .order('schedule_date', { ascending: true });

    // 添加日期范围过滤
    if (startDate) {
      query = query.gte('schedule_date', startDate);
    }
    if (endDate) {
      query = query.lte('schedule_date', endDate);
    }

    const { data: schedules, error } = await query;

    if (error) {
      console.error('查询日程失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    // 获取客户名称映射
    const customerIds = [...new Set(schedules?.map(s => s.customer_id) || [])];
    let customerNameMap: Record<string, string> = {};
    
    if (customerIds.length > 0) {
      const { data: customers } = await client
        .from('customers')
        .select('id, name')
        .in('id', customerIds)
        .eq('user_id', userId);  // 确保只查询当前用户的客户
      
      customers?.forEach(c => {
        customerNameMap[c.id] = c.name;
      });
    }

    // 添加客户名称到日程数据
    const schedulesWithCustomerName = schedules?.map(s => ({
      ...s,
      customer_name: customerNameMap[s.customer_id] || '未知客户',
    })) || [];

    return NextResponse.json({ schedules: schedulesWithCustomerName });
  } catch (error) {
    console.error('获取日程失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * POST /api/schedule - 创建日程
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);

    const body = await request.json();
    const { customerId, scheduleDate, notes } = body;

    if (!customerId || !scheduleDate) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 创建日程
    const { data: schedule, error } = await client
      .from('schedules')
      .insert({
        customer_id: customerId,
        schedule_date: scheduleDate,
        notes: notes || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('创建日程失败:', error);
      return NextResponse.json({ error: '创建失败' }, { status: 500 });
    }

    // 获取客户名称
    const { data: customer } = await client
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .eq('user_id', userId)  // 确保只查询当前用户的客户
      .single();

    return NextResponse.json({ 
      schedule: {
        ...schedule,
        customer_name: customer?.name || '未知客户',
      }
    });
  } catch (error) {
    console.error('创建日程失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
