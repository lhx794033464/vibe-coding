import { NextResponse } from 'next/server';
import { getSupabaseCredentials } from '@/storage/database/supabase-client';

// 获取 Supabase 配置（公开信息）
export async function GET() {
  try {
    const { url, anonKey } = getSupabaseCredentials();
    
    return NextResponse.json({
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
    });
  } catch (error) {
    console.error('获取 Supabase 配置失败:', error);
    return NextResponse.json({ 
      error: 'Supabase 配置缺失，请检查环境变量 COZE_SUPABASE_URL 和 COZE_SUPABASE_ANON_KEY' 
    }, { status: 500 });
  }
}
