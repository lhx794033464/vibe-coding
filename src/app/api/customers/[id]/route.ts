import { NextRequest, NextResponse } from 'next/server';
import { customersStorage } from '@/lib/serverStorage';

// 获取单个客户详情 - 本地存储模式
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = customersStorage.getById(id);

    if (!data) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取客户详情失败:', error);
    return NextResponse.json({ error: '获取客户详情失败' }, { status: 500 });
  }
}

// 更新客户 - 本地存储模式
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data = customersStorage.update(id, body);

    if (!data) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新客户失败:', error);
    return NextResponse.json({ error: '更新客户失败' }, { status: 500 });
  }
}

// 删除客户 - 本地存储模式
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = customersStorage.delete(id);

    if (!success) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除客户失败:', error);
    return NextResponse.json({ error: '删除客户失败' }, { status: 500 });
  }
}
