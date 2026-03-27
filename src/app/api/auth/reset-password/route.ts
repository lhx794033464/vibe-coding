import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 使用 OTP 验证码重置密码
 * POST /api/auth/reset-password
 * 
 * Body:
 * - email: 用户邮箱
 * - otp: 验证码
 * - newPassword: 新密码（至少6位）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp, newPassword } = body;

    // 验证输入
    if (!email || !otp || !newPassword) {
      return NextResponse.json(
        { error: '邮箱、验证码和新密码不能为空' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '新密码至少需要6位' },
        { status: 400 }
      );
    }

    // 获取 Supabase 配置
    const { getSupabaseCredentials } = await import('@/storage/database/supabase-client');
    const { url, anonKey } = getSupabaseCredentials();

    // 创建 Supabase 客户端
    const supabase = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 步骤1: 验证 OTP
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (verifyError) {
      return NextResponse.json(
        { error: '验证码错误或已过期: ' + verifyError.message },
        { status: 400 }
      );
    }

    if (!verifyData.session) {
      return NextResponse.json(
        { error: '验证失败，无法获取会话' },
        { status: 400 }
      );
    }

    // 步骤2: 使用会话更新密码
    // 使用获取到的 access_token 创建新的客户端
    const userSupabase = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${verifyData.session.access_token}`,
        },
      },
    });

    const { error: updateError } = await userSupabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return NextResponse.json(
        { error: '更新密码失败: ' + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '密码重置成功，请使用新密码登录',
    });

  } catch (error: any) {
    console.error('重置密码错误:', error);
    return NextResponse.json(
      { error: '服务器错误: ' + error.message },
      { status: 500 }
    );
  }
}
