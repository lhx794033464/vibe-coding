import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取看板统计数据
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
    const timeRange = searchParams.get('timeRange') || 'month';

    // 计算时间范围
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

    // 获取所有客户
    const { data: customers, error: customersError } = await client
      .from('customers')
      .select('*');

    if (customersError) {
      return NextResponse.json({ error: customersError.message }, { status: 500 });
    }

    // 计算统计数据
    const totalCustomers = customers?.length || 0;
    
    // 已上线：accepted, online_not_accepted, partially_online
    const onlineStatuses = ['accepted', 'online_not_accepted', 'partially_online'];
    const onlineCustomers = customers?.filter(c => onlineStatuses.includes(c.status)).length || 0;
    
    // 已验收
    const acceptedCustomers = customers?.filter(c => c.status === 'accepted').length || 0;

    // 上线率和验收率
    const onlineRate = totalCustomers > 0 ? (onlineCustomers / totalCustomers * 100) : 0;
    const acceptanceRate = totalCustomers > 0 ? (acceptedCustomers / totalCustomers * 100) : 0;

    // 本月新增客户数
    const newCustomersThisMonth = customers?.filter(c => {
      const createdAt = new Date(c.created_at);
      return createdAt >= startDate;
    }).length || 0;

    // 实施人天统计（时间范围内）
    const totalImplementationDays = customers?.reduce((sum, c) => {
      const createdAt = new Date(c.created_at);
      if (createdAt >= startDate) {
        return sum + (c.implementation_days || 0);
      }
      return sum;
    }, 0) || 0;

    // 状态分布
    const statusDistribution: Record<string, number> = {
      not_online: 0,
      online_not_accepted: 0,
      accepted: 0,
      not_going_online: 0,
      delayed_online: 0,
      partially_online: 0,
    };

    customers?.forEach(c => {
      if (statusDistribution.hasOwnProperty(c.status)) {
        statusDistribution[c.status]++;
      }
    });

    return NextResponse.json({
      totalCustomers,
      onlineCustomers,
      acceptedCustomers,
      onlineRate: Math.round(onlineRate * 10) / 10,
      acceptanceRate: Math.round(acceptanceRate * 10) / 10,
      newCustomersThisMonth,
      totalImplementationDays,
      statusDistribution,
    });
  } catch (error) {
    console.error('获取看板数据失败:', error);
    return NextResponse.json({ error: '获取看板数据失败' }, { status: 500 });
  }
}
