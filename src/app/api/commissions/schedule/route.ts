import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

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
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    if (customer.user_id !== user.id) {
      return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
    }

    // 更新下次计提月份
    const { error: updateError } = await client
      .from('customers')
      .update({ next_commission_month })
      .eq('id', customer_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('设置下次计提月份失败:', error);
    return NextResponse.json({ error: '设置下次计提月份失败' }, { status: 500 });
  }
}
