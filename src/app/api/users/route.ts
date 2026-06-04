import { NextRequest, NextResponse } from 'next/server';
import { dbGetAllUsers, dbCreateUser } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取用户列表
export async function GET(request: NextRequest) {
  try {
    // 仅管理员可访问
    const userInfo = await getCurrentUserInfo(request);
    if (userInfo?.role !== 'admin') {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const users = await dbGetAllUsers();
    return NextResponse.json({ data: users, count: users.length });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
  }
}

// 创建用户
export async function POST(request: NextRequest) {
  try {
    // 仅管理员可创建
    const userInfo = await getCurrentUserInfo(request);
    if (userInfo?.role !== 'admin') {
      return NextResponse.json({ error: '无权创建用户' }, { status: 403 });
    }

    const body = await request.json();
    const { username, email = '', role = '交付顾问', employment_status = '在职', is_active = true, password } = body;

    if (!username) {
      return NextResponse.json({ error: '用户名为必填' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: '密码为必填' }, { status: 400 });
    }

    try {
      const newUser = await dbCreateUser({ username, email, password, role, employment_status, is_active });
      return NextResponse.json({ data: newUser }, { status: 201 });
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.message?.includes('已存在')) {
        return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
      }
      throw err;
    }
  } catch (error) {
    console.error('创建用户失败:', error);
    return NextResponse.json({ error: '创建用户失败' }, { status: 500 });
  }
}
