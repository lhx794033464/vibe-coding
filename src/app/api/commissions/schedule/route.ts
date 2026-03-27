import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseCredentials } from '@/storage/database/supabase-client';
import { createClient } from '@supabase/supabase-js';

// 游客用户ID
const GUEST_USER_ID = '00000000-0000-0000-0000-000000000000';

// 获取 supabase 客户端（支持游客模式）
function getClient(token?: string) {
  if (token && token !== 'guest') {
    return getSupabaseClient(token);
  }
  // 游客模式使用 anon key
  const { url, anonKey } = getSupabaseCredentials();
  return createClient(url, anonKey, {
    db: { timeout: 60000 },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 获取用户ID（支持游客模式）
async function getUserId(token?: string): Promise<string | null> {
  if (!token || token === 'guest') {
    return GUEST_USER_ID;
  }
  const client = getSupabaseClient(token);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return null;
  }
  return user.id;
}

/**
 * 设置下次计提月份
 * POST /api/commissions/schedule
 * 
 * Body:
 * - customer_id: 客户ID
 * - next_commission_month: 下次计提月份 (格式: yyyy-MM)
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);
    const body = await request.json();
    const { customer_id, next_commission_month } = body;

    if (!customer_id || !next_commission_month) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 验证客户归属
    const { data: customer, error: customerError } = await client
      .from('customers')
      .select('id, user_id')
      .eq('id', customer_id)
      .eq('user_id', userId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: '客户不存在或无权操作' }, { status: 404 });
    }

    // 更新下次计提月份
    const { error: updateError } = await client
      .from('customers')
      .update({ next_commission_month })
      .eq('id', customer_id)
      .eq('user_id', userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('设置下次计提月份失败:', error);
    return NextResponse.json({ error: '设置下次计提月份失败' }, { status: 500 });
  }
}
