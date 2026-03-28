import { NextResponse } from 'next/server';

/**
 * 获取 Supabase 配置 - 已禁用
 * 
 * 注意：系统已切换到本地存储模式，不再需要 Supabase 配置
 */
export async function GET() {
  return NextResponse.json({
    message: '系统已切换到本地存储模式',
    mode: 'localStorage',
    note: '数据现在存储在浏览器本地，无需 Supabase 配置'
  });
}
