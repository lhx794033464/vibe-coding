import { NextRequest, NextResponse } from 'next/server';
import { schedulesStorage } from '@/services/localStorage';

// 获取日程列表 - 本地存储模式
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    let schedules = schedulesStorage.getAll();

    // 按日期范围筛选
    if (start && end) {
      schedules = schedules.filter((s: any) => {
        const eventDate = s.schedule_date;
        return eventDate >= start && eventDate <= end;
      });
    }

    // 排序：按日期
    schedules.sort((a: any, b: any) => {
      return new Date(a.schedule_date).getTime() - new Date(b.schedule_date).getTime();
    });

    return NextResponse.json({ schedules });
  } catch (error) {
    console.error('获取日程失败:', error);
    return NextResponse.json({ error: '获取日程失败' }, { status: 500 });
  }
}

// 创建日程 - 本地存储模式
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, scheduleDate, notes } = body;

    if (!customerId || !scheduleDate) {
      return NextResponse.json({ error: '客户和日期不能为空' }, { status: 400 });
    }

    const data = schedulesStorage.create({
      customer_id: customerId,
      schedule_date: scheduleDate,
      notes: notes || null,
    });

    return NextResponse.json({ schedule: data });
  } catch (error) {
    console.error('创建日程失败:', error);
    return NextResponse.json({ error: '创建日程失败' }, { status: 500 });
  }
}
