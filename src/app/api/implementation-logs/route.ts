import { NextRequest, NextResponse } from 'next/server';
import { implementationLogsStorage } from '@/lib/serverStorage';

// 获取实施日志列表 - 本地存储模式
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');

    let logs = implementationLogsStorage.getAll();

    // 按客户筛选
    if (customerId) {
      logs = logs.filter((l: any) => l.customer_id === customerId);
    }

    // 排序：按日期倒序
    logs.sort((a: any, b: any) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime());

    return NextResponse.json({ data: logs });
  } catch (error) {
    console.error('获取实施日志失败:', error);
    return NextResponse.json({ error: '获取实施日志失败' }, { status: 500 });
  }
}

// 创建实施日志 - 本地存储模式
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, log_date, content, consumed_days, remaining_days } = body;

    if (!customer_id) {
      return NextResponse.json({ error: '客户ID不能为空' }, { status: 400 });
    }

    const data = implementationLogsStorage.create({
      customer_id,
      log_date: log_date || new Date().toISOString().split('T')[0],
      content: content || '',
      consumed_days: consumed_days || '0',
      remaining_days: remaining_days || '0',
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建实施日志失败:', error);
    return NextResponse.json({ error: '创建实施日志失败' }, { status: 500 });
  }
}
