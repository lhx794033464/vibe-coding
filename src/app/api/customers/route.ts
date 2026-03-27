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

// 获取客户列表
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const timeRange = searchParams.get('timeRange');

    let query = client
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)  // 关键：按用户ID过滤，确保数据隔离
      .order('created_at', { ascending: false });

    // 状态筛选
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // 搜索
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // 时间范围筛选
    if (timeRange) {
      const now = new Date();
      let startDate: Date;
      
      switch (timeRange) {
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }
      
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 获取所有实施日志，计算每个客户的已消耗人天
    const customerIds = data?.map(c => c.id) || [];
    let consumedDaysMap: Record<string, number> = {};
    
    if (customerIds.length > 0) {
      const { data: logs } = await client
        .from('implementation_logs')
        .select('customer_id, consumed_days')
        .in('customer_id', customerIds);
      
      logs?.forEach(record => {
        const days = parseFloat(record.consumed_days || '0');
        if (!consumedDaysMap[record.customer_id]) {
          consumedDaysMap[record.customer_id] = 0;
        }
        consumedDaysMap[record.customer_id] += days;
      });
    }

    // 为每个客户添加已消耗人天和剩余人天
    const customersWithDays = data?.map(customer => ({
      ...customer,
      consumed_days: parseFloat((consumedDaysMap[customer.id] || 0).toFixed(2)),
      remaining_days: parseFloat(((parseFloat(customer.implementation_days || '0') - (consumedDaysMap[customer.id] || 0)).toFixed(2))),
    }));

    return NextResponse.json({ data: customersWithDays, count });
  } catch (error) {
    console.error('获取客户列表失败:', error);
    return NextResponse.json({ error: '获取客户列表失败' }, { status: 500 });
  }
}

// 创建客户
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
      name, 
      sales_order_no, 
      implementation_order_no, 
      implementation_fee, 
      implementation_days, 
      opened_at,
      version,
      modules,
      industry, 
      special_requirements, 
      status 
    } = body;

    if (!name) {
      return NextResponse.json({ error: '客户名称不能为空' }, { status: 400 });
    }

    const { data, error } = await client
      .from('customers')
      .insert({
        name,
        sales_order_no: sales_order_no || null,
        implementation_order_no: implementation_order_no || null,
        implementation_fee: implementation_fee || null,
        implementation_days: implementation_days || null,
        opened_at: opened_at || null,
        version: version || null,
        modules: modules || null,
        industry: industry || null,
        special_requirements: special_requirements || null,
        status: status || 'not_online',
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建客户失败:', error);
    return NextResponse.json({ error: '创建客户失败' }, { status: 500 });
  }
}
