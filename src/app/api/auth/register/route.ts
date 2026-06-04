import { NextRequest, NextResponse } from 'next/server';
import { dbCreateUser, dbGetUserByUsername, generateToken } from '@/services/dbService';
import { isAdminRequest } from '@/lib/serverAuth';

/**
 * 用户注册 API
 * POST /api/auth/register
 * 管理员可以创建任意角色用户，普通用户只能注册为 user 角色
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, email, password, role = '交付顾问', is_active = true } = body;

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码长度不能少于6位' }, { status: 400 });
    }

    // 检查用户名是否已存在
    const existingUser = await dbGetUserByUsername(username);
    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
    }

    // 只有管理员才能创建管理员账号
    const userIsAdmin = await isAdminRequest(request);
    const finalRole = userIsAdmin && role ? role : '交付顾问';

    const newUser = await dbCreateUser({
      username,
      email,
      password,
      role: finalRole as 'admin' | '交付顾问' | '答疑顾问' | '其他',
      is_active,
    });

    // 生成 JWT token 用于自动登录
    const token = generateToken({ id: newUser.id, username: newUser.username, role: newUser.role });

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          is_active: newUser.is_active,
        },
        token,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('注册失败:', error);
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
  }
}
