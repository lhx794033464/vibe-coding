import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { loadEnv } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const { email, otp } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: '请提供邮箱地址' },
        { status: 400 }
      );
    }

    // 加载环境变量
    loadEnv();
    
    const supabaseUrl = process.env.COZE_SUPABASE_URL;
    const supabaseAnonKey = process.env.COZE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: '服务器配置错误' },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          async getAll() {
            return cookieStore.getAll().map(cookie => ({
              name: cookie.name,
              value: cookie.value || '',
            }));
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // 如果没有提供 OTP，则发送 OTP
    if (!otp) {
      // 使用 signInWithOtp 发送一次性密码
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false, // 不自动创建用户
        },
      });

      if (otpError) {
        console.error('发送 OTP 失败:', otpError);
        // 如果错误是用户不存在
        if (otpError.message?.includes('User not found') || otpError.status === 404) {
          return NextResponse.json(
            { error: '该邮箱未注册，请先注册账号' },
            { status: 404 }
          );
        }
        return NextResponse.json(
          { error: otpError.message || '发送验证码失败' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: '验证码已发送到您的邮箱，请查收',
        requireOtp: true,
      });
    }

    // 提供了 OTP，验证登录
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (verifyError) {
      console.error('验证 OTP 失败:', verifyError);
      return NextResponse.json(
        { error: verifyError.message || '验证码错误或已过期' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      session: verifyData.session,
      user: verifyData.user,
    });

  } catch (error) {
    console.error('无密码登录错误:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
