import { NextRequest, NextResponse } from 'next/server';
import { schedulesStorage, customersStorage } from '@/services/localStorage';

// 获取日程列表 - 本地存储模式
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    let schedules = schedulesStorage.getAll();

    // 获取客户名称映射
    const customers = customersStorage.getAll();
    const customerMap: Record<string, string> = {};
    customers.forEach((c: any) => {
      customerMap[c.id] = c.name;
    });

    // 为每个日程添加客户名称
    schedules = schedules.map((s: any) => ({
      ...s,
      customer_name: customerMap[s.customer_id] || '未知客户'
    }));

    // 按日期范围筛选
    if (start && end) {
      schedules = schedules.filter((s: any) => {
        const scheduleDate = s.schedule_date?.split('T')[0];
        return scheduleDate >= start && scheduleDate <= end;
      });
    }

    // 排序：按日期
    schedules.sort((a: any, b: any) => {
      const dateA = new Date(a.schedule_date).getTime();
      const dateB = new Date(b.schedule_date).getTime();
      return dateA - dateB;
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

    // 获取客户信息
    const customer = customersStorage.getById(customerId);
    const customerName = customer?.name || '未知客户';

    const schedule = schedulesStorage.create({
      customer_id: customerId,
      schedule_date: scheduleDate,
      notes: notes || null,
    });

    return NextResponse.json({ 
      schedule: {
        ...schedule,
        customer_name: customerName
      }
    });
  } catch (error) {
    console.error('创建日程失败:', error);
    return NextResponse.json({ error: '创建日程失败' }, { status: 500 });
  }
}
