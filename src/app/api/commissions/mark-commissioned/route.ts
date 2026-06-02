import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// POST /api/commissions/mark-commissioned - 标记提成记录为已计提
export async function POST(request: NextRequest) {
  try {
    const userInfo = getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { customerIds, month } = body as { customerIds: string[]; month?: string };

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return NextResponse.json({ error: '请选择要标记的客户' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 1. 更新提成记录的 commission_status
    let query = supabase
      .from('commission_records')
      .update({ commission_status: '已计提' })
      .in('customer_id', customerIds);

    if (month) {
      query = query.eq('month', month);
    }

    const { error: updateError } = await query;
    if (updateError) {
      console.error('更新提成记录计提状态失败:', updateError);
      return NextResponse.json({ error: '更新计提状态失败' }, { status: 500 });
    }

    // 2. 反写客户的 commission_status
    for (const customerId of customerIds) {
      // 查询该客户所有提成记录的计提状态
      let statusQuery = supabase
        .from('commission_records')
        .select('commission_status')
        .eq('customer_id', customerId);

      if (month) {
        statusQuery = statusQuery.eq('month', month);
      }

      const { data: records } = await statusQuery;

      let customerCommissionStatus = '未计提';
      if (records && records.length > 0) {
        const allCommissioned = records.every((r: { commission_status: string }) => r.commission_status === '已计提');
        const someCommissioned = records.some((r: { commission_status: string }) => r.commission_status === '已计提');
        if (allCommissioned) {
          customerCommissionStatus = '已计提';
        } else if (someCommissioned) {
          customerCommissionStatus = '部分计提';
        }
      }

      await supabase
        .from('customers')
        .update({ commission_status: customerCommissionStatus })
        .eq('id', customerId);
    }

    return NextResponse.json({ success: true, message: '标记已计提成功' });
  } catch (error) {
    console.error('标记已计提失败:', error);
    return NextResponse.json({ error: '标记已计提失败' }, { status: 500 });
  }
}
