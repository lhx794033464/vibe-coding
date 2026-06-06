import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers, dbCreateCustomer } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取客户列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const acceptanceStatus = searchParams.get('acceptance_status') || undefined;
    const search = searchParams.get('search') || undefined;

    // 数据隔离：获取当前用户信息
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const isAdmin = userInfo.role === 'admin';

    const customers = await dbGetCustomers({
      status,
      acceptanceStatus,
      search,
      userId: userInfo.id,
      username: userInfo.username,
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

    // 处理 modules 字段：数据库要求 text[] 类型，前端可能传入字符串
    let modules = body.modules;
    if (typeof modules === 'string' && modules.trim()) {
      modules = modules.split(/[+,，、\s]+/).map((s: string) => s.trim()).filter(Boolean);
    } else if (modules === '' || modules === null) {
      modules = null;
    }

    // status 有 NOT NULL 约束和默认值，空值时不传让数据库用默认值
    const status = body.status || undefined;

    const customerData = {
      ...body,
      status,
      modules,
      user_id: userInfo?.id || null,
      delivery_consultant: userInfo?.username || body.delivery_consultant || null,
    };

    // 自动计算交付期截止日：开通日期 + 120天（仅当未手动指定时）
    if (!customerData.delivery_deadline && customerData.opened_at) {
      const openedDate = new Date(customerData.opened_at);
      if (!isNaN(openedDate.getTime())) {
        openedDate.setDate(openedDate.getDate() + 120);
        customerData.delivery_deadline = openedDate.toISOString().split('T')[0];
      }
    }

    const customer = await dbCreateCustomer(customerData);
    return NextResponse.json({ customer });
  } catch (error) {
    console.error('创建客户失败:', error);
    return NextResponse.json({ error: '创建客户失败' }, { status: 500 });
  }
}
