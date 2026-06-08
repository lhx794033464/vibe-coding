import { NextRequest, NextResponse } from 'next/server';
import { dbGetImplementationLogs, dbCreateImplementationLog } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取实施日志列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customer_id') || searchParams.get('customerId');

    // 数据隔离
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const logs = await dbGetImplementationLogs({
      customerId: customerId || undefined,
      userId: userInfo?.id,
      isAdmin,
    });

    return NextResponse.json({ data: logs });
  } catch (error) {
    console.error('获取实施日志失败:', error);
    return NextResponse.json({ error: '获取实施日志失败' }, { status: 500 });
  }
}

// 创建实施日志
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, log_date, summary, consumed_days, meeting_link } = body;

    if (!customer_id) {
      return NextResponse.json({ error: '客户ID不能为空' }, { status: 400 });
    }

    if (!summary || !consumed_days) {
      return NextResponse.json({ error: '请填写实施纪要和消耗人天' }, { status: 400 });
    }

    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const data = await dbCreateImplementationLog({
      customer_id,
      log_date: log_date || new Date().toISOString().split('T')[0],
      summary: summary || '',
      consumed_days: consumed_days || '0',
      meeting_link: meeting_link || null,
      user_id: userInfo.id,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建实施日志失败:', error);
    return NextResponse.json({ error: '创建实施日志失败' }, { status: 500 });
  }
}
