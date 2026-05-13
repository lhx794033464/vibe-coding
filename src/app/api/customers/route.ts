import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers, dbCreateCustomer } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取客户列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    // 数据隔离：获取当前用户信息
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const customers = await dbGetCustomers({
      status,
      search,
      userId: userInfo?.id,
      isAdmin,
    });

    return NextResponse.json({ customers });
  } catch (error) {
    console.error('获取客户列表失败:', error);
    return NextResponse.json({ error: '获取客户列表失败' }, { status: 500 });
  }
}

// 创建客户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 自动关联创建者
    const userInfo = await getCurrentUserInfo(request);
    const customerData = {
      ...body,
      user_id: userInfo?.id || null,
      delivery_consultant: userInfo?.username || body.delivery_consultant || null,
    };

    const customer = await dbCreateCustomer(customerData);
    return NextResponse.json({ customer });
  } catch (error) {
    console.error('创建客户失败:', error);
    return NextResponse.json({ error: '创建客户失败' }, { status: 500 });
  }
}
