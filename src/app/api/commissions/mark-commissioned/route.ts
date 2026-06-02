import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// POST /api/commissions/mark-commissioned - 标记客户为已计提
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { customerIds } = body as { customerIds: string[] };

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return NextResponse.json({ error: '请选择要标记的客户' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 1. 直接更新客户的 commission_status 为已计提
    const { error: customerUpdateError } = await supabase
      .from('customers')
      .update({ commission_status: '已计提' })
      .in('id', customerIds);

    if (customerUpdateError) {
      console.error('更新客户计提状态失败:', customerUpdateError);
      return NextResponse.json({ error: '更新计提状态失败' }, { status: 500 });
    }

    // 2. 同步更新该客户下所有提成记录的 commission_status
    const { error: recordsUpdateError } = await supabase
      .from('commission_records')
      .update({ commission_status: '已计提' })
      .in('customer_id', customerIds);

    if (recordsUpdateError) {
      console.error('更新提成记录计提状态失败:', recordsUpdateError);
      // 不阻断流程，客户状态已更新成功
    }

    return NextResponse.json({ success: true, message: '标记已计提成功' });
  } catch (error) {
    console.error('标记已计提失败:', error);
    return NextResponse.json({ error: '标记已计提失败' }, { status: 500 });
  }
}
