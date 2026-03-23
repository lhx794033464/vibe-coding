import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';

/**
 * GET /api/schedule - 获取日程列表
 * Query params: start, end (日期范围)
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    
    // 验证用户
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

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
      .eq('user_id', user.id)
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
        .in('id', customerIds);
      
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
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    
    // 验证用户
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

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
        user_id: user.id,
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
