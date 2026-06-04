import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取看板统计数据
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get('timeRange') || 'all';
    const customStartDate = searchParams.get('startDate');
    const customEndDate = searchParams.get('endDate');
    const roleType = searchParams.get('roleType') || ''; // 交付顾问/答疑顾问/空=全部

    // 计算时间范围
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    switch (timeRange) {
      case 'assessment': {
        // 考核年度：上年12月至本年11月
        // 如果当前月份 >= 12，考核年度为今年12月至明年11月
        // 如果当前月份 < 12，考核年度为去年12月至今年11月
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed
        if (currentMonth >= 11) { // 12月
          startDate = new Date(currentYear, 11, 1); // 今年12月1日
          endDate = new Date(currentYear + 1, 11, 1); // 明年12月1日
        } else {
          startDate = new Date(currentYear - 1, 11, 1); // 去年12月1日
          endDate = new Date(currentYear, 11, 1); // 今年12月1日
        }
        break;
      }
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1); // 当年1月1日
        endDate = new Date(now.getFullYear() + 1, 0, 1); // 次年1月1日
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

    // 获取客户（管理员获取全部，普通用户获取自己的）
    // 普通用户同时按 user_id 和 delivery_consultant 匹配，确保数据隔离正确
    let customers: any[];
    if (isAdmin) {
      customers = await dbGetCustomers({ isAdmin: true });
    } else {
      // 获取全部客户，然后按 user_id 或 delivery_consultant 过滤
      const allCustomers = await dbGetCustomers({ isAdmin: true });
      const userId = userInfo?.id;
      const username = userInfo?.username;
      // 按 delivery_consultant 匹配用户名过滤（user_id 在数据同步时可能不准确）
      customers = allCustomers.filter((c: any) =>
        c.delivery_consultant === username
      );
    }

    // 根据开通时间筛选客户
    let filteredCustomers = customers.filter((c: any) => c.opened_at);

    if (startDate && endDate) {
      filteredCustomers = filteredCustomers.filter((c: any) => {
        const openedAt = new Date(c.opened_at);
        return openedAt >= startDate! && openedAt < endDate!;
      });
    }

    // 只统计实施类型为"一对一交付"的项目
    filteredCustomers = filteredCustomers.filter((c: any) => c.implementation_type === '一对一交付');

    const totalCustomers = filteredCustomers.length;

    // 状态判断：status 为上线状态，acceptance_status 为验收状态
    const onlineCustomers = filteredCustomers.filter((c: any) => c.status === 'online').length;
    const acceptedCustomers = filteredCustomers.filter((c: any) => c.acceptance_status === 'accepted').length;

    const onlineRate = totalCustomers > 0 ? (onlineCustomers / totalCustomers * 100) : 0;
    const acceptanceRate = totalCustomers > 0 ? (acceptedCustomers / totalCustomers * 100) : 0;

    // 1个月上线率：开通时间 > 30天的客户中已上线的比例
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const customersOverOneMonth = filteredCustomers.filter((c: any) => new Date(c.opened_at) <= oneMonthAgo);
    const oneMonthOnlineRate = customersOverOneMonth.length > 0
      ? (customersOverOneMonth.filter((c: any) => c.status === 'online').length / customersOverOneMonth.length * 100)
      : 0;

    // 4个月上线率：开通时间 > 120天的客户中已上线的比例
    const fourMonthsAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const customersOverFourMonths = filteredCustomers.filter((c: any) => new Date(c.opened_at) <= fourMonthsAgo);
    const fourMonthsOnlineRate = customersOverFourMonths.length > 0
      ? (customersOverFourMonths.filter((c: any) => c.status === 'online').length / customersOverFourMonths.length * 100)
      : 0;

    // 上月数据
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    const lastMonthCustomers = filteredCustomers.filter((c: any) => {
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
    filteredCustomers.forEach((c: any) => {
      const label = statusLabelMap[c.status] || c.status || '未知';
      statusDistribution[label] = (statusDistribution[label] || 0) + 1;
    });

    // 验收状态分布 - 已验收 / 未上线未验收 / 已上线未验收
    const acceptanceDistribution: Record<string, number> = {
      '已验收': 0,
      '未上线未验收': 0,
      '已上线未验收': 0,
    };
    filteredCustomers.forEach((c: any) => {
      const isOnline = c.status === 'online';
      const isAccepted = c.acceptance_status === 'accepted';
      if (isAccepted) {
        acceptanceDistribution['已验收']++;
      } else if (isOnline) {
        acceptanceDistribution['已上线未验收']++;
      } else {
        acceptanceDistribution['未上线未验收']++;
      }
    });

    // 获取用户的角色映射（username -> role）
    const client = getSupabaseClient();
    const { data: usersData } = await client
      .from('users')
      .select('username, role');
    const userRoleMap: Record<string, string> = {};
    (usersData || []).forEach((u: any) => {
      userRoleMap[u.username] = u.role || '其他';
    });

    // 获取用户管理中存在的在职用户名集合
    const activeUsernames = new Set<string>();
    (usersData || []).forEach((u: any) => {
      activeUsernames.add(u.username);
    });

    // 按交付顾问统计，支持按 roleType 过滤，仅显示用户管理中存在的顾问
    const consultantStats: Record<string, {
      projectCount: number;
      totalDays: number;
      onlineCount: number;
      acceptedCount: number;
      oneMonthTotal: number;
      oneMonthOnline: number;
      fourMonthsTotal: number;
      fourMonthsOnline: number;
    }> = {};
    filteredCustomers.forEach((c: any) => {
      const consultant = c.delivery_consultant || '';

      // 过滤：仅显示用户管理中存在的顾问，跳过未分配和不存在的顾问
      if (!consultant || !activeUsernames.has(consultant)) return;

      // 如果指定了角色类型筛选（非"全部"），则过滤
      if (roleType && roleType !== '全部') {
        const consultantRole = userRoleMap[consultant];
        if (consultantRole !== roleType) return;
      }

      if (!consultantStats[consultant]) {
        consultantStats[consultant] = {
          projectCount: 0, totalDays: 0,
          onlineCount: 0, acceptedCount: 0,
          oneMonthTotal: 0, oneMonthOnline: 0,
          fourMonthsTotal: 0, fourMonthsOnline: 0,
        };
      }
      const s = consultantStats[consultant];
      s.projectCount++;
      s.totalDays += parseFloat(c.implementation_days || '0');
      if (c.status === 'online') s.onlineCount++;
      if (c.acceptance_status === 'accepted') s.acceptedCount++;
      if (new Date(c.opened_at) <= oneMonthAgo) {
        s.oneMonthTotal++;
        if (c.status === 'online') s.oneMonthOnline++;
      }
      if (new Date(c.opened_at) <= fourMonthsAgo) {
        s.fourMonthsTotal++;
        if (c.status === 'online') s.fourMonthsOnline++;
      }
    });

    // 交付顾问分布数据（用于柱状图+折线图），按加权比例（人均人天=总人天/项目数）从高到低排序
    const consultantDistribution = Object.entries(consultantStats).map(([name, s]) => ({
      name,
      projectCount: s.projectCount,
      totalDays: Math.round(s.totalDays * 10) / 10,
      weightedScore: s.projectCount > 0 ? Math.round((s.totalDays / s.projectCount) * 100) / 100 : 0,
    })).sort((a, b) => b.weightedScore - a.weightedScore);

    // 交付顾问排行数据（用于排行表）
    const consultantRanking = Object.entries(consultantStats).map(([name, s]) => ({
      name,
      projectCount: s.projectCount,
      onlineRate: s.projectCount > 0 ? Math.round(s.onlineCount / s.projectCount * 1000) / 10 : 0,
      oneMonthOnlineRate: s.oneMonthTotal > 0 ? Math.round(s.oneMonthOnline / s.oneMonthTotal * 1000) / 10 : 0,
      fourMonthsOnlineRate: s.fourMonthsTotal > 0 ? Math.round(s.fourMonthsOnline / s.fourMonthsTotal * 1000) / 10 : 0,
      acceptanceRate: s.projectCount > 0 ? Math.round(s.acceptedCount / s.projectCount * 1000) / 10 : 0,
    }));

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
      acceptanceDistribution,
      consultantDistribution,
      consultantRanking,
    });
  } catch (error) {
    console.error('获取看板数据失败:', error);
    return NextResponse.json({ error: '获取看板数据失败' }, { status: 500 });
  }
}
