import { NextRequest, NextResponse } from 'next/server';
import { customersStorage } from '@/lib/serverStorage';
import { getCurrentUserInfo } from '@/lib/serverAuth';

/**
 * 设置下次计提月份 - 本地存储模式
 * POST /api/commissions/schedule
 * 
 * Body:
 * - customer_id: 客户ID
 * - next_commission_month: 下次计提月份 (格式: yyyy-MM)
 */
export async function POST(request: NextRequest) {
  try {
    // 数据隔离：验证用户权限
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const body = await request.json();
    const { customer_id, next_commission_month } = body;

    if (!customer_id || !next_commission_month) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 验证客户是否存在
    const customer = customersStorage.getById(customer_id);
    if (!customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    // 非管理员只能操作自己负责的客户
    if (!isAdmin && (customer as any).delivery_consultant !== userInfo?.username) {
      return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
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
