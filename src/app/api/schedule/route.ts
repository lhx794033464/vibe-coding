import { NextRequest, NextResponse } from 'next/server';
import { schedulesStorage, customersStorage } from '@/lib/serverStorage';

// 获取日程列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    let schedules = schedulesStorage.getAll();

    // 按日期范围筛选
    if (start && end) {
      schedules = schedules.filter((s: any) => {
        // 兼容两种格式：schedule_date 或 start_time
        const dateStr = s.schedule_date || s.start_time;
        if (!dateStr) return false;
        
        const eventDate = new Date(dateStr);
        return eventDate >= new Date(start) && eventDate <= new Date(end);
      });
    }

    // 关联客户名称
    const customers = customersStorage.getAll();
    const customerMap = new Map(customers?.map((c: any) => [c.id, c.name]) || []);

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
    const { customerId, scheduleDate, notes } = body;

    if (!customerId || !scheduleDate) {
      return NextResponse.json({ error: '客户ID和日程日期不能为空' }, { status: 400 });
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
