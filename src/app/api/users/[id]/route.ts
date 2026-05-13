import { NextRequest, NextResponse } from 'next/server';
import { dbGetUserById, dbUpdateUser, dbDeleteUser, dbGetAllUsers } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取用户详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (userInfo?.role !== 'admin') {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const { id } = await params;
    const user = await dbGetUserById(id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    return NextResponse.json({ data: user });
  } catch (error) {
    console.error('获取用户失败:', error);
    return NextResponse.json({ error: '获取用户失败' }, { status: 500 });
  }
}

// 更新用户
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (userInfo?.role !== 'admin') {
      return NextResponse.json({ error: '无权修改用户' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const updatedUser = await dbUpdateUser(id, body);

    if (!updatedUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({ data: updatedUser });
  } catch (error) {
    console.error('更新用户失败:', error);
    return NextResponse.json({ error: '更新用户失败' }, { status: 500 });
  }
}

// 删除用户
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (userInfo?.role !== 'admin') {
      return NextResponse.json({ error: '无权删除用户' }, { status: 403 });
    }

    const { id } = await params;

    // 不允许删除自己
    if (id === userInfo?.id) {
      return NextResponse.json({ error: '不能删除自己的账号' }, { status: 400 });
    }

    // 确保至少保留一个管理员
    const allUsers = await dbGetAllUsers();
    const targetUser = allUsers.find(u => u.id === id);
    if (targetUser?.role === 'admin') {
      const adminCount = allUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return NextResponse.json({ error: '不能删除最后一个管理员' }, { status: 400 });
      }
    }

    await dbDeleteUser(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除用户失败:', error);
    return NextResponse.json({ error: '删除用户失败' }, { status: 500 });
  }
}
