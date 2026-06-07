import { NextRequest, NextResponse } from 'next/server';
import { dbGetFollowUps, dbCreateFollowUp } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取跟进记录列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customer_id') || searchParams.get('customerId');

    // 数据隔离
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const followUps = await dbGetFollowUps({
      customerId: customerId || undefined,
      userId: userInfo?.id,
      isAdmin,
    });

    return NextResponse.json({ data: followUps });
  } catch (error) {
    console.error('获取跟进记录失败:', error);
    return NextResponse.json({ error: '获取跟进记录失败' }, { status: 500 });
  }
}

// 创建跟进记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, content, follow_up_at } = body;

    if (!customer_id || !content) {
      return NextResponse.json({ error: '客户ID和跟进内容不能为空' }, { status: 400 });
    }

    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo?.id) {
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    const data = await dbCreateFollowUp({
      customer_id,
      content,
      follow_up_at: follow_up_at || new Date().toISOString(),
      user_id: userInfo.id,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建跟进记录失败:', error);
    return NextResponse.json({ error: '创建跟进记录失败' }, { status: 500 });
  }
}
