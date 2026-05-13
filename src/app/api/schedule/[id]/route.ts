import { NextRequest, NextResponse } from 'next/server';
import { dbGetSchedules, dbUpdateSchedule, dbDeleteSchedule, dbGetCustomerById } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 更新日程
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    // 获取日程并验证权限
    const schedules = await dbGetSchedules({ userId: userInfo?.id, isAdmin });
    const schedule = schedules.find((s: any) => s.id === id);
    if (!schedule) {
      return NextResponse.json({ error: '日程不存在或无权操作' }, { status: 404 });
    }

    if (!isAdmin && schedule.user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权操作此日程' }, { status: 403 });
    }

    const body = await request.json();
    const data = await dbUpdateSchedule(id, body);

    if (!data) {
      return NextResponse.json({ error: '日程不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新日程失败:', error);
    return NextResponse.json({ error: '更新日程失败' }, { status: 500 });
  }
}

// 删除日程
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const schedules = await dbGetSchedules({ userId: userInfo?.id, isAdmin });
    const schedule = schedules.find((s: any) => s.id === id);
    if (!schedule) {
      return NextResponse.json({ error: '日程不存在或无权操作' }, { status: 404 });
    }

    if (!isAdmin && schedule.user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权操作此日程' }, { status: 403 });
    }

    await dbDeleteSchedule(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除日程失败:', error);
    return NextResponse.json({ error: '删除日程失败' }, { status: 500 });
  }
}
