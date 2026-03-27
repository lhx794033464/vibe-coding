import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 管理 API - 删除 Supabase 用户（用于修复登录问题）
 * POST /api/admin/delete-user
 * 
 * Body:
 * - email: 要删除的用户邮箱
 * - secret: 管理密钥（默认: fix-login-2024）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, secret } = body;

    // 简单密钥验证（防止滥用）
    if (secret !== 'fix-login-2024') {
      return NextResponse.json({ error: '密钥错误' }, { status: 403 });
    }

    if (!email) {
      return NextResponse.json({ error: '请提供邮箱' }, { status: 400 });
    }

    // 使用 Service Role Key 创建管理员客户端
    // 注意：这个 API 需要 SUPABASE_SERVICE_ROLE_KEY 环境变量
    const supabaseUrl = process.env.COZE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return NextResponse.json({ 
        error: '缺少 SUPABASE_SERVICE_ROLE_KEY 环境变量',
        message: '请先在环境变量中设置 SUPABASE_SERVICE_ROLE_KEY'
      }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. 查找用户
    const { data: users, error: listError } = await adminClient.auth.admin.listUsers();
    
    if (listError) {
      return NextResponse.json({ 
        error: '查找用户失败', 
        details: listError.message 
      }, { status: 500 });
    }

    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      return NextResponse.json({ 
        message: '用户不存在，可以直接注册',
        email 
      });
    }

    // 2. 删除用户
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return NextResponse.json({ 
        error: '删除用户失败', 
        details: deleteError.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: `用户 ${email} 已删除，现在可以重新注册`,
      email
    });

  } catch (error: any) {
    console.error('删除用户失败:', error);
    return NextResponse.json({ 
      error: '服务器错误',
      details: error.message 
    }, { status: 500 });
  }
}
