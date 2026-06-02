import { NextRequest, NextResponse } from 'next/server';
import { dbGetSchedules, dbCreateSchedule, dbGetCustomers, dbGetAllUsers } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取日程列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    // 数据隔离：获取当前用户信息
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const schedules = await dbGetSchedules({
      userId: userInfo?.id,
      isAdmin,
      startDate: start || undefined,
      endDate: end || undefined,
    });

    // 关联客户名称
    const customers = await dbGetCustomers({ userId: userInfo?.id, isAdmin });
    const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));

    // 管理员汇总视图：关联用户名称
    let userMap = new Map<string, string>();
    if (isAdmin) {
      const users = await dbGetAllUsers();
      userMap = new Map(users.map((u: any) => [u.id, u.username]));
    }

    const enrichedSchedules = schedules.map((s: any) => ({
      ...s,
      customer_name: s.customer_id ? (customerMap.get(s.customer_id) || null) : null,
      user_name: s.user_id ? (userMap.get(s.user_id) || null) : null,
    }));

    // 管理员汇总视图：返回按日期分组的统计信息
    if (isAdmin) {
      const activeConsultants = await dbGetAllUsers();
      const activeUserIds = new Set(
        activeConsultants
          .filter((u: any) => u.employment_status === '在职' && u.role_type === '交付顾问')
          .map((u: any) => u.id)
      );
      const activeUserNames = new Map(
        activeConsultants
          .filter((u: any) => u.employment_status === '在职' && u.role_type === '交付顾问')
          .map((u: any) => [u.id, u.username])
      );

      // 按日期统计每个用户的日程数
      const dateUserSchedules = new Map<string, Map<string, number>>();
      for (const s of enrichedSchedules) {
        const dateStr = s.schedule_date?.split('T')[0];
        if (!dateStr || !activeUserIds.has(s.user_id)) continue;
        if (!dateUserSchedules.has(dateStr)) {
          dateUserSchedules.set(dateStr, new Map());
        }
        const userSchedules = dateUserSchedules.get(dateStr)!;
        userSchedules.set(s.user_id, (userSchedules.get(s.user_id) || 0) + 1);
      }

      // 计算每天的空缺数
      const dailySummary: Record<string, { gapCount: number; allSatisfied: boolean; consultantSchedules: { userId: string; userName: string; count: number }[] }> = {};
      for (const [dateStr, userSchedules] of dateUserSchedules) {
        let gapCount = 0;
        const consultantSchedules: { userId: string; userName: string; count: number }[] = [];
        // 遍历所有在职交付顾问，计算空缺数（只遍历一次，避免重复计算）
        for (const [userId, userName] of activeUserNames) {
          const count = userSchedules.get(userId) || 0;
          if (count < 2) gapCount += (2 - count);
          consultantSchedules.push({ userId, userName, count });
        }
        dailySummary[dateStr] = {
          gapCount,
          allSatisfied: gapCount === 0,
          consultantSchedules,
        };
      }

      // 对于没有日程的日期，也要计算空缺
      // (这些日期不会出现在 dateUserSchedules 中，但前端仍需显示)
      return NextResponse.json({
        schedules: enrichedSchedules,
        dailySummary,
        activeConsultants: Array.from(activeUserNames.entries()).map(([id, name]) => ({ id, name })),
      });
    }

    return NextResponse.json({ schedules: enrichedSchedules });
  } catch (error) {
    console.error('获取日程失败:', error);
    return NextResponse.json({ error: '获取日程失败' }, { status: 500 });
  }
}

// 创建日程
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userInfo = await getCurrentUserInfo(request);

    const schedule = await dbCreateSchedule({
      customer_id: body.customerId || body.customer_id || null,
      schedule_date: body.scheduleDate || body.schedule_date || new Date().toISOString(),
      notes: body.notes || '',
      user_id: userInfo?.id || null,
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error('创建日程失败:', error);
    return NextResponse.json({ error: '创建日程失败' }, { status: 500 });
  }
}
