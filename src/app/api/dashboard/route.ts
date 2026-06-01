import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取看板统计数据
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get('timeRange') || 'all';
    const customStartDate = searchParams.get('startDate');
    const customEndDate = searchParams.get('endDate');

    // 计算时间范围
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    switch (timeRange) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'year':
        if (now.getMonth() === 11) {
          startDate = new Date(now.getFullYear(), 11, 1);
          endDate = new Date(now.getFullYear() + 1, 0, 1);
        } else {
          startDate = new Date(now.getFullYear() - 1, 11, 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        }
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          startDate = new Date(customStartDate);
          endDate = new Date(customEndDate);
          endDate.setDate(endDate.getDate() + 1); // 包含结束日期当天
        }
        break;
      case 'all':
      default:
        startDate = null;
        endDate = null;
        break;
    }

    // 获取客户（根据权限过滤）
    const visibleCustomers = await dbGetCustomers({ userId: userInfo?.id, isAdmin });

    // 根据开通时间筛选客户
    let customers = visibleCustomers.filter((c: any) => c.opened_at);

    if (startDate && endDate) {
      customers = customers.filter((c: any) => {
        const openedAt = new Date(c.opened_at);
        return openedAt >= startDate! && openedAt < endDate!;
      });
    }

    const totalCustomers = customers.length;

    // 状态判断：status 为上线状态，acceptance_status 为验收状态
    const onlineCustomers = customers.filter((c: any) => c.status === 'online').length;
    const acceptedCustomers = customers.filter((c: any) => c.acceptance_status === 'accepted').length;

    const onlineRate = totalCustomers > 0 ? (onlineCustomers / totalCustomers * 100) : 0;
    const acceptanceRate = totalCustomers > 0 ? (acceptedCustomers / totalCustomers * 100) : 0;

    // 1个月上线率：开通时间 > 30天的客户中已上线的比例
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const customersOverOneMonth = customers.filter((c: any) => new Date(c.opened_at) <= oneMonthAgo);
    const oneMonthOnlineRate = customersOverOneMonth.length > 0
      ? (customersOverOneMonth.filter((c: any) => c.status === 'online').length / customersOverOneMonth.length * 100)
      : 0;

    // 4个月上线率：开通时间 > 120天的客户中已上线的比例
    const fourMonthsAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const customersOverFourMonths = customers.filter((c: any) => new Date(c.opened_at) <= fourMonthsAgo);
    const fourMonthsOnlineRate = customersOverFourMonths.length > 0
      ? (customersOverFourMonths.filter((c: any) => c.status === 'online').length / customersOverFourMonths.length * 100)
      : 0;

    // 上月数据
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    const lastMonthCustomers = visibleCustomers.filter((c: any) => {
      if (!c.opened_at) return false;
      const openedAt = new Date(c.opened_at);
      return openedAt >= lastMonthStart && openedAt < lastMonthEnd;
    });

    const lastMonthTotalCustomers = lastMonthCustomers.length;
    const lastMonthOnlineCustomers = lastMonthCustomers.filter((c: any) => c.status === 'online').length;
    const lastMonthAcceptedCustomers = lastMonthCustomers.filter((c: any) => c.acceptance_status === 'accepted').length;

    const lastMonthOnlineRate = lastMonthTotalCustomers > 0 ? (lastMonthOnlineCustomers / lastMonthTotalCustomers * 100) : 0;
    const lastMonthAcceptanceRate = lastMonthTotalCustomers > 0 ? (lastMonthAcceptedCustomers / lastMonthTotalCustomers * 100) : 0;

    const totalCustomersChange = lastMonthTotalCustomers > 0
      ? ((totalCustomers - lastMonthTotalCustomers) / lastMonthTotalCustomers * 100)
      : (totalCustomers > 0 ? 100 : 0);

    const onlineRateChange = onlineRate - lastMonthOnlineRate;
    const acceptanceRateChange = acceptanceRate - lastMonthAcceptanceRate;

    // 状态分布 - 按实际 status 和 acceptance_status 值统计
    const statusLabelMap: Record<string, string> = {
      'online': '已上线',
      'not_online': '未上线',
    };

    const statusDistribution: Record<string, number> = {};
    customers.forEach((c: any) => {
      const label = statusLabelMap[c.status] || c.status || '未知';
      statusDistribution[label] = (statusDistribution[label] || 0) + 1;
    });

    return NextResponse.json({
      totalCustomers,
      onlineCustomers,
      acceptedCustomers,
      onlineRate: Math.round(onlineRate * 10) / 10,
      acceptanceRate: Math.round(acceptanceRate * 10) / 10,
      oneMonthOnlineRate: Math.round(oneMonthOnlineRate * 10) / 10,
      fourMonthsOnlineRate: Math.round(fourMonthsOnlineRate * 10) / 10,
      lastMonthTotalCustomers,
      lastMonthOnlineRate: Math.round(lastMonthOnlineRate * 10) / 10,
      lastMonthAcceptanceRate: Math.round(lastMonthAcceptanceRate * 10) / 10,
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
