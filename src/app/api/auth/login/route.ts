import { NextRequest, NextResponse } from 'next/server';
import { dbAuthenticateUser, ensureAdminUser } from '@/services/dbService';

/**
 * 登录认证 API
 * POST /api/auth/login
 */
export async function POST(request: NextRequest) {
  try {
    // 确保默认管理员账号存在（首次启动时自动创建）
    await ensureAdminUser();

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const result = await dbAuthenticateUser(username, password);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
      },
    });
  } catch (error) {
    console.error('登录失败:', error);
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
