import { NextRequest, NextResponse } from 'next/server';
import { dbGetImplementationLogs, dbUpdateImplementationLog, dbDeleteImplementationLog, dbGetCustomerById } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 更新实施日志
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    // 获取日志并验证权限
    const logs = await dbGetImplementationLogs({ userId: userInfo?.id, isAdmin });
    const log = logs.find((l: any) => l.id === id);
    if (!log) {
      return NextResponse.json({ error: '日志不存在或无权操作' }, { status: 404 });
    }

    if (!isAdmin && log.user_id !== userInfo?.id) {
      // 兼容旧数据：通过 customer 的 delivery_consultant 判断
      if (log.customer_id) {
        const customer = await dbGetCustomerById(log.customer_id);
        if (!customer || (customer as any).delivery_consultant !== userInfo?.username) {
          return NextResponse.json({ error: '无权操作此日志' }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: '无权操作此日志' }, { status: 403 });
      }
    }

    const body = await request.json();
    const data = await dbUpdateImplementationLog(id, body);

    if (!data) {
      return NextResponse.json({ error: '日志不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新日志失败:', error);
    return NextResponse.json({ error: '更新日志失败' }, { status: 500 });
  }
}

// 删除实施日志
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const logs = await dbGetImplementationLogs({ userId: userInfo?.id, isAdmin });
    const log = logs.find((l: any) => l.id === id);
    if (!log) {
      return NextResponse.json({ error: '日志不存在或无权操作' }, { status: 404 });
    }

    if (!isAdmin && log.user_id !== userInfo?.id) {
      if (log.customer_id) {
        const customer = await dbGetCustomerById(log.customer_id);
        if (!customer || (customer as any).delivery_consultant !== userInfo?.username) {
          return NextResponse.json({ error: '无权操作此日志' }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: '无权操作此日志' }, { status: 403 });
      }
    }

    await dbDeleteImplementationLog(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除日志失败:', error);
    return NextResponse.json({ error: '删除日志失败' }, { status: 500 });
  }
}
