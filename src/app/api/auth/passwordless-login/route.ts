import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: '请提供邮箱地址' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

    // 使用 admin API 查询用户
    const { data: { users: authUsers }, error: adminError } = await supabase.auth.admin.listUsers();
    
    if (adminError) {
      console.error('查询用户失败:', adminError);
      return NextResponse.json(
        { error: '查询用户失败' },
        { status: 500 }
      );
    }
    
    const existingUser = authUsers?.find(u => u.email === email);

    if (!existingUser) {
      return NextResponse.json(
        { error: '该邮箱未注册，请先注册账号' },
        { status: 404 }
      );
    }

    // 设置临时密码并登录
    const tempPassword = Math.random().toString(36).slice(-16);
    
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      { password: tempPassword }
    );

    if (updateError) {
      console.error('更新密码失败:', updateError);
      return NextResponse.json(
        { error: '登录失败，请稍后重试' },
        { status: 500 }
      );
    }

    // 使用临时密码登录
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: tempPassword,
    });

    if (signInError) {
      console.error('登录失败:', signInError);
      return NextResponse.json(
        { error: '登录失败，请稍后重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session: signInData.session,
      user: signInData.user,
    });

  } catch (error) {
    console.error('无密码登录错误:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
