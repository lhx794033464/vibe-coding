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

    // 获取所有客户
    const { data: customers, error: customersError } = await client
      .from('customers')
      .select('*');

    if (customersError) {
      return NextResponse.json({ error: customersError.message }, { status: 500 });
    }

    // 计算当前统计数据
    const totalCustomers = customers?.length || 0;
    
    // 已上线：accepted, online_not_accepted, partially_online
    const onlineStatuses = ['accepted', 'online_not_accepted', 'partially_online'];
    const onlineCustomers = customers?.filter(c => onlineStatuses.includes(c.status)).length || 0;
    
    // 已验收
    const acceptedCustomers = customers?.filter(c => c.status === 'accepted').length || 0;

    // 上线率和验收率
    const onlineRate = totalCustomers > 0 ? (onlineCustomers / totalCustomers * 100) : 0;
    const acceptanceRate = totalCustomers > 0 ? (acceptedCustomers / totalCustomers * 100) : 0;

    // 计算上月数据（上期）
    const now = new Date();
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1); // 本月1日0点，即上月末
    
    // 上月末的客户数
    const lastMonthCustomers = customers?.filter(c => new Date(c.created_at) < lastMonthEnd) || [];
    const lastMonthTotalCustomers = lastMonthCustomers.length;
    
    // 上月末的上线客户数和验收客户数
    const lastMonthOnlineCustomers = lastMonthCustomers.filter(c => onlineStatuses.includes(c.status)).length;
    const lastMonthAcceptedCustomers = lastMonthCustomers.filter(c => c.status === 'accepted').length;
    
    // 上月末的上线率和验收率
    const lastMonthOnlineRate = lastMonthTotalCustomers > 0 ? (lastMonthOnlineCustomers / lastMonthTotalCustomers * 100) : 0;
    const lastMonthAcceptanceRate = lastMonthTotalCustomers > 0 ? (lastMonthAcceptedCustomers / lastMonthTotalCustomers * 100) : 0;
    
    // 计算变动
    // 客户数变动百分比
    const totalCustomersChange = lastMonthTotalCustomers > 0 
      ? ((totalCustomers - lastMonthTotalCustomers) / lastMonthTotalCustomers * 100) 
      : (totalCustomers > 0 ? 100 : 0);
    
    // 上线率和验收率变动（直接相减）
    const onlineRateChange = onlineRate - lastMonthOnlineRate;
    const acceptanceRateChange = acceptanceRate - lastMonthAcceptanceRate;

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
      // 上期数据
      lastMonthTotalCustomers,
      lastMonthOnlineRate: Math.round(lastMonthOnlineRate * 10) / 10,
      lastMonthAcceptanceRate: Math.round(lastMonthAcceptanceRate * 10) / 10,
      // 变动数据
      totalCustomersChange: Math.round(totalCustomersChange * 10) / 10,
      onlineRateChange: Math.round(onlineRateChange * 10) / 10,
      acceptanceRateChange: Math.round(acceptanceRateChange * 10) / 10,
      statusDistribution,
    });
  } catch (error) {
    console.error('获取看板数据失败:', error);
    return NextResponse.json({ error: '获取看板数据失败' }, { status: 500 });
  }
}
