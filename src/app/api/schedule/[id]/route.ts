import { NextRequest, NextResponse } from 'next/server';
import { schedulesStorage } from '@/lib/serverStorage';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 更新/删除日程 - 本地存储模式
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 数据隔离：验证权限
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';
    const schedule = schedulesStorage.getById(id);
    if (!schedule) {
      return NextResponse.json({ error: '日程不存在' }, { status: 404 });
    }
    if (!isAdmin) {
      // 非管理员只能操作自己的日程
      const { customersStorage } = await import('@/lib/serverStorage');
      const customer = customersStorage.getById((schedule as any).customer_id);
      if (!customer || (customer as any).delivery_consultant !== userInfo?.username) {
        return NextResponse.json({ error: '无权操作此日程' }, { status: 403 });
      }
    }

    const body = await request.json();
    const data = schedulesStorage.update(id, body);

    if (!data) {
      return NextResponse.json({ error: '日程不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新日程失败:', error);
    return NextResponse.json({ error: '更新日程失败' }, { status: 500 });
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
    const schedule = schedulesStorage.getById(id);
    if (!schedule) {
      return NextResponse.json({ error: '日程不存在' }, { status: 404 });
    }
    if (!isAdmin) {
      const { customersStorage } = await import('@/lib/serverStorage');
      const customer = customersStorage.getById((schedule as any).customer_id);
      if (!customer || (customer as any).delivery_consultant !== userInfo?.username) {
        return NextResponse.json({ error: '无权操作此日程' }, { status: 403 });
      }
    }

    const success = schedulesStorage.delete(id);

    if (!success) {
      return NextResponse.json({ error: '日程不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除日程失败:', error);
    return NextResponse.json({ error: '删除日程失败' }, { status: 500 });
  }
}
