import { NextRequest, NextResponse } from 'next/server';

/**
 * 发送密码重置验证码 - 已禁用
 * 
 * 注意：登录功能已移除，系统现在使用本地存储模式
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { 
      error: '登录功能已移除',
      message: '系统现在使用本地存储模式，数据保存在您的浏览器中' 
    },
    { status: 403 }
  );
}
