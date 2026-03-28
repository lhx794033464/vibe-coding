import { NextRequest, NextResponse } from 'next/server';

/**
 * Supabase 诊断 API - 已禁用
 * 
 * 注意：系统已切换到本地存储模式，不再需要 Supabase 诊断
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    message: '系统已切换到本地存储模式',
    mode: 'localStorage',
    note: '数据现在存储在浏览器本地，不再使用 Supabase',
    storageInfo: {
      type: 'localStorage',
      location: '浏览器本地',
      persistence: '持久化（除非用户清理浏览器数据）'
    }
  });
}
