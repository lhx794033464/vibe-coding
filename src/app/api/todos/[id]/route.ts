import { NextRequest, NextResponse } from 'next/server';
import { todosStorage } from '@/services/localStorage';

// 获取/更新/删除单个待办 - 本地存储模式
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const todo = todosStorage.getById(id);

    if (!todo) {
      return NextResponse.json({ error: '待办不存在' }, { status: 404 });
    }

    return NextResponse.json({ data: todo });
  } catch (error) {
    console.error('获取待办失败:', error);
    return NextResponse.json({ error: '获取待办失败' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data = todosStorage.update(id, body);

    if (!data) {
      return NextResponse.json({ error: '待办不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新待办失败:', error);
    return NextResponse.json({ error: '更新待办失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = todosStorage.delete(id);

    if (!success) {
      return NextResponse.json({ error: '待办不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除待办失败:', error);
    return NextResponse.json({ error: '删除待办失败' }, { status: 500 });
  }
}
