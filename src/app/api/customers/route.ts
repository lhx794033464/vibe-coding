import { NextRequest, NextResponse } from 'next/server';
import { customersStorage, implementationLogsStorage } from '@/lib/serverStorage';
import { TimeRange } from '@/types';
import { getCurrentUserInfo, isAdmin } from '@/lib/serverAuth';

// 获取客户列表 - 本地存储模式
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const timeRange = searchParams.get('timeRange') as TimeRange;

    let customers = customersStorage.getAll();

    // 数据权限过滤：普通用户只能看到交付顾问为自己的客户
    const userInfo = await getCurrentUserInfo(request);
    const userIsAdmin = await isAdmin(request);

    if (!userIsAdmin && userInfo) {
      customers = (customers as any[]).filter(c => c.delivery_consultant === userInfo.username);
    }

    // 时间范围筛选
    if (timeRange && timeRange !== 'all') {
      const now = new Date();
      let startDate: Date;

      if (timeRange === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (timeRange === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
      } else {
        startDate = new Date(0);
      }

      customers = (customers as any[]).filter(c => new Date(c.created_at) >= startDate);
    }

    // 状态筛选
    if (status && status !== 'all') {
      customers = (customers as any[]).filter(c => c.status === status);
    }

    // 搜索（支持客户名称、销售单号、行业、交付顾问）
    if (search) {
      const searchLower = search.toLowerCase();
      customers = (customers as any[]).filter(c =>
        c.name?.toLowerCase().includes(searchLower) ||
        c.sales_order_no?.toLowerCase().includes(searchLower) ||
        c.industry?.toLowerCase().includes(searchLower) ||
        c.delivery_consultant?.toLowerCase().includes(searchLower)
      );
    }

    // 排序
    (customers as any[]).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 获取所有实施日志，计算每个客户的已消耗人天
    const logs = implementationLogsStorage.getAll();
    const consumedDaysMap: Record<string, number> = {};

    logs.forEach((record: any) => {
      const days = parseFloat(record.consumed_days || '0');
      if (!consumedDaysMap[record.customer_id]) {
        consumedDaysMap[record.customer_id] = 0;
      }
      consumedDaysMap[record.customer_id] += days;
    });

    // 为每个客户添加已消耗人天和剩余人天
    const customersWithDays = customers.map((customer: any) => ({
      ...customer,
      consumed_days: parseFloat((consumedDaysMap[customer.id] || 0).toFixed(2)),
      remaining_days: parseFloat(((parseFloat(customer.implementation_days || '0') - (consumedDaysMap[customer.id] || 0)).toFixed(2))),
    }));

    return NextResponse.json({ data: customersWithDays, count: customersWithDays.length });
  } catch (error) {
    console.error('获取客户列表失败:', error);
    return NextResponse.json({ error: '获取客户列表失败' }, { status: 500 });
  }
}

// 创建客户 - 本地存储模式
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      sales_order_no,
      implementation_order_no,
      implementation_fee,
      implementation_days,
      opened_at,
      version,
      modules,
      industry,
      special_requirements,
      status,
      delivery_consultant,
    } = body;

    if (!name) {
      return NextResponse.json({ error: '客户名称不能为空' }, { status: 400 });
    }

    // 获取当前用户信息，用于默认填充交付顾问
    const userInfo = await getCurrentUserInfo(request);

    const data = customersStorage.create({
      name,
      sales_order_no: sales_order_no || null,
      implementation_order_no: implementation_order_no || null,
      implementation_fee: implementation_fee || null,
      implementation_days: implementation_days || null,
      opened_at: opened_at || null,
      version: version || null,
      modules: modules || null,
      industry: industry || null,
      special_requirements: special_requirements || null,
      status: status || 'not_online',
      delivery_consultant: delivery_consultant || userInfo?.username || null,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建客户失败:', error);
    return NextResponse.json({ error: '创建客户失败' }, { status: 500 });
  }
}
