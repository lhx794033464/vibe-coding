import { NextRequest, NextResponse } from 'next/server';
import { implementationLogsStorage } from '@/lib/serverStorage';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 更新/删除实施日志 - 本地存储模式
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 数据隔离：验证权限
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';
    const log = implementationLogsStorage.getById(id);
    if (!log) {
      return NextResponse.json({ error: '日志不存在' }, { status: 404 });
    }
    if (!isAdmin) {
      const { customersStorage } = await import('@/lib/serverStorage');
      const customer = customersStorage.getById((log as any).customer_id);
      if (!customer || (customer as any).delivery_consultant !== userInfo?.username) {
        return NextResponse.json({ error: '无权操作此日志' }, { status: 403 });
      }
    }

    const body = await request.json();
    const data = implementationLogsStorage.update(id, body);

    if (!data) {
      return NextResponse.json({ error: '日志不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新日志失败:', error);
    return NextResponse.json({ error: '更新日志失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 数据隔离：验证权限
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';
    const log = implementationLogsStorage.getById(id);
    if (!log) {
      return NextResponse.json({ error: '日志不存在' }, { status: 404 });
    }
    if (!isAdmin) {
      const { customersStorage } = await import('@/lib/serverStorage');
      const customer = customersStorage.getById((log as any).customer_id);
      if (!customer || (customer as any).delivery_consultant !== userInfo?.username) {
        return NextResponse.json({ error: '无权操作此日志' }, { status: 403 });
      }
    }

    const success = implementationLogsStorage.delete(id);

    if (!success) {
      return NextResponse.json({ error: '日志不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除日志失败:', error);
    return NextResponse.json({ error: '删除日志失败' }, { status: 500 });
  }
}
