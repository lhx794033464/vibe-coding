import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 发送密码重置验证码
 * POST /api/auth/forgot-password
 * 
 * Body:
 * - email: 用户邮箱
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: '邮箱不能为空' },
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

    // 使用 OTP 方式发送验证码
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // 不创建新用户
      },
    });

    if (error) {
      if (error.message?.includes('User not found')) {
        return NextResponse.json(
          { error: '该邮箱未注册' },
          { status: 404 }
        );
      }
      
      console.error('发送验证码错误:', error);
      return NextResponse.json(
        { error: '发送验证码失败: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '验证码已发送到您的邮箱，请查收',
    });

  } catch (error: any) {
    console.error('发送验证码错误:', error);
    return NextResponse.json(
      { error: '服务器错误: ' + error.message },
      { status: 500 }
    );
  }
}
