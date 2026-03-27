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

// 获取看板统计数据
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);

    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get('timeRange') || 'all';

    // 计算时间范围
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    
    switch (timeRange) {
      case 'month':
        // 本月：本月1日到月末
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'year':
        // 本年：上年12月至本年11月
        if (now.getMonth() === 11) {
          // 12月，本年从今年12月开始
          startDate = new Date(now.getFullYear(), 11, 1);
          endDate = new Date(now.getFullYear() + 1, 0, 1);
        } else {
          // 1-11月，本年从去年12月开始
          startDate = new Date(now.getFullYear() - 1, 11, 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        }
        break;
      case 'all':
      default:
        // 全部：不限制
        startDate = null;
        endDate = null;
        break;
    }

    // 获取当前用户的所有客户
    const { data: allCustomers, error: allCustomersError } = await client
      .from('customers')
      .select('*')
      .eq('user_id', userId);  // 关键：按用户ID过滤，确保数据隔离

    if (allCustomersError) {
      return NextResponse.json({ error: allCustomersError.message }, { status: 500 });
    }

    // 根据开通时间（opened_at）筛选客户
    let customers = allCustomers?.filter(c => c.opened_at) || [];
    
    if (startDate && endDate) {
      customers = customers.filter(c => {
        const openedAt = new Date(c.opened_at);
        return openedAt >= startDate && openedAt < endDate;
      });
    }

    // 计算当前统计数据（基于开通时间筛选后的客户）
    const totalCustomers = customers.length;
    
    // 已上线：accepted, online_not_accepted, partially_online
    const onlineStatuses = ['accepted', 'online_not_accepted', 'partially_online'];
    const onlineCustomers = customers.filter(c => onlineStatuses.includes(c.status)).length;
    
    // 已验收
    const acceptedCustomers = customers.filter(c => c.status === 'accepted').length;

    // 上线率和验收率
    const onlineRate = totalCustomers > 0 ? (onlineCustomers / totalCustomers * 100) : 0;
    const acceptanceRate = totalCustomers > 0 ? (acceptedCustomers / totalCustomers * 100) : 0;

    // 计算上月数据（上期）用于变动对比
    // 上月：上月1日到上月末
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // 上月开通的客户
    const lastMonthCustomers = allCustomers?.filter(c => {
      if (!c.opened_at) return false;
      const openedAt = new Date(c.opened_at);
      return openedAt >= lastMonthStart && openedAt < lastMonthEnd;
    }) || [];
    
    const lastMonthTotalCustomers = lastMonthCustomers.length;
    const lastMonthOnlineCustomers = lastMonthCustomers.filter(c => onlineStatuses.includes(c.status)).length;
    const lastMonthAcceptedCustomers = lastMonthCustomers.filter(c => c.status === 'accepted').length;
    
    // 上月的上线率和验收率
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

    // 状态分布（基于筛选后的客户）
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
