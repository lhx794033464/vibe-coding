import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取未上线项目分布数据
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const roleType = searchParams.get('roleType') || '交付顾问';
    const implType = searchParams.get('implType') || '一对一交付';

    // 获取全部客户
    const customers = await dbGetCustomers({ isAdmin: true });
    const now = new Date();

    // 获取用户的角色类型映射
    const client = getSupabaseClient();
    const { data: usersData } = await client
      .from('users')
      .select('username, role_type');
    const userRoleTypeMap: Record<string, string> = {};
    const activeUsernames = new Set<string>();
    (usersData || []).forEach((u: any) => {
      userRoleTypeMap[u.username] = u.role_type || '交付顾问';
      activeUsernames.add(u.username);
    });

    // 按实施类型过滤
    let filtered = customers.filter((c: any) => c.opened_at);
    if (implType && implType !== '全部') {
      filtered = filtered.filter((c: any) => c.implementation_type === implType);
    }

    // 只统计未上线且未解散的客户
    filtered = filtered.filter((c: any) => c.status !== 'online' && !c.dismissed);

    // 按顾问分组统计
    const consultantStats: Record<string, {
      oneMonthNotOnline: number;
      fourMonthsNotOnline: number;
    }> = {};

    filtered.forEach((c: any) => {
      const consultant = c.delivery_consultant || '';
      if (!consultant || !activeUsernames.has(consultant)) return;

      // 按角色类型过滤
      if (roleType && roleType !== '全部') {
        const consultantRoleType = userRoleTypeMap[consultant];
        if (consultantRoleType !== roleType) return;
      }

      if (!consultantStats[consultant]) {
        consultantStats[consultant] = { oneMonthNotOnline: 0, fourMonthsNotOnline: 0 };
      }

      const openedAt = new Date(c.opened_at);
      const daysSinceOpen = Math.floor((now.getTime() - openedAt.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceOpen >= 120) {
        consultantStats[consultant].fourMonthsNotOnline++;
      } else if (daysSinceOpen >= 30) {
        consultantStats[consultant].oneMonthNotOnline++;
      }
    });

    // 转换为数组格式
    const data = Object.entries(consultantStats).map(([name, s]) => ({
      name,
      oneMonthNotOnline: s.oneMonthNotOnline,
      fourMonthsNotOnline: s.fourMonthsNotOnline,
    }));

    // 获取所有顾问列表（用于筛选下拉框）
    const consultants = Array.from(activeUsernames).filter(u => {
      if (roleType && roleType !== '全部') {
        return userRoleTypeMap[u] === roleType;
      }
      return true;
    }).sort();

    return NextResponse.json({ data, consultants });
  } catch (error) {
    console.error('获取未上线项目分布失败:', error);
    return NextResponse.json({ error: '获取未上线项目分布失败' }, { status: 500 });
  }
}
