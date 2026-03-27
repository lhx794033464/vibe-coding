import { NextRequest, NextResponse } from 'next/server';
import { schedulesStorage } from '@/services/localStorage';

// 更新/删除日程 - 本地存储模式
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
