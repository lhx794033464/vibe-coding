import { NextRequest, NextResponse } from 'next/server';
import { dbGetSchedules, dbCreateSchedule, dbGetCustomers } from '@/services/dbService';
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

    const enrichedSchedules = schedules.map((s: any) => ({
      ...s,
      customer_name: s.customer_id ? (customerMap.get(s.customer_id) || null) : null,
    }));

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
