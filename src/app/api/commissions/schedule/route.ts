import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomerById, dbUpdateCustomer } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

/**
 * 设置下次计提月份
 * POST /api/commissions/schedule
 */
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const body = await request.json();
    const { customer_id, next_commission_month } = body;

    if (!customer_id || !next_commission_month) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const customer = await dbGetCustomerById(customer_id);
    if (!customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    if (!isAdmin && customer.user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
    }

    const updated = await dbUpdateCustomer(customer_id, { next_commission_month });

    if (!updated) {
      return NextResponse.json({ error: '更新失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('设置下次计提月份失败:', error);
    return NextResponse.json({ error: '设置下次计提月份失败' }, { status: 500 });
  }
}
