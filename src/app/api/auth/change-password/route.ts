import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcryptjs';

export async function PUT(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '新密码长度不能少于6位' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 获取当前用户信息
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, password_hash')
      .eq('id', userInfo.id)
      .single();

    if (fetchError || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 验证旧密码（兼容 Base64 和 bcrypt 两种格式）
    let passwordMatch = false;

    // 先尝试 bcrypt 验证
    if (user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$')) {
      passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    } else {
      // 兼容旧的 Base64 密码
      try {
        const decoded = Buffer.from(user.password_hash, 'base64').toString('utf-8');
        passwordMatch = decoded === currentPassword;
      } catch {
        passwordMatch = false;
      }
    }

    if (!passwordMatch) {
      return NextResponse.json({ error: '当前密码不正确' }, { status: 400 });
    }

    // 生成新密码的 bcrypt 哈希
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // 更新密码
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('id', userInfo.id);

    if (updateError) {
      return NextResponse.json({ error: '密码修改失败' }, { status: 500 });
    }

    return NextResponse.json({ message: '密码修改成功' });
  } catch (error) {
    console.error('修改密码失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
