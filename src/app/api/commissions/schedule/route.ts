import { NextRequest, NextResponse } from 'next/server';
import { customersStorage } from '@/services/localStorage';

/**
 * 设置下次计提月份 - 本地存储模式
 * POST /api/commissions/schedule
 * 
 * Body:
 * - customer_id: 客户ID
 * - next_commission_month: 下次计提月份 (格式: yyyy-MM)
 * - userId: 用户ID（可选，从 localStorage 获取）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, next_commission_month, userId } = body;

    if (!customer_id || !next_commission_month) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 验证客户是否存在
    const customer = customersStorage.getById(customer_id);
    if (!customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    // 更新下次计提月份
    const updated = customersStorage.update(customer_id, { 
      next_commission_month 
    });

    if (!updated) {
      return NextResponse.json({ error: '更新失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('设置下次计提月份失败:', error);
    return NextResponse.json({ error: '设置下次计提月份失败' }, { status: 500 });
  }
}
