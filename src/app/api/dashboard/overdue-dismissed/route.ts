import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取超期未解散项目分布数据
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
    if (implType && implType !== '全部类型') {
      if (implType === '其他') {
        filtered = filtered.filter((c: any) => c.implementation_type !== '一对一交付');
      } else {
        filtered = filtered.filter((c: any) => c.implementation_type === implType);
      }
    }

    // 超期未解散：超出交付期截止日 + 状态为已上线 + 未解散
    filtered = filtered.filter((c: any) => {
      if (c.dismissed) return false;
      if (c.status !== 'online') return false;
      if (!c.delivery_deadline) return false;
      const deadline = new Date(c.delivery_deadline);
      return now > deadline;
    });

    // 按顾问分组统计
    const consultantStats: Record<string, number> = {};

    filtered.forEach((c: any) => {
      const consultant = c.delivery_consultant || '';
      if (!consultant || !activeUsernames.has(consultant)) return;

      // 按角色类型过滤
      if (roleType && roleType !== '全部') {
        const consultantRoleType = userRoleTypeMap[consultant];
        if (consultantRoleType !== roleType) return;
      }

      if (!consultantStats[consultant]) {
        consultantStats[consultant] = 0;
      }
      consultantStats[consultant]++;
    });

    // 转换为数组格式，按数量从高到低排序
    const data = Object.entries(consultantStats).map(([name, count]) => ({
      name,
      count,
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取超期未解散项目分布失败:', error);
    return NextResponse.json({ error: '获取超期未解散项目分布失败' }, { status: 500 });
  }
}
