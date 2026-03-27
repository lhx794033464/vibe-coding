import { NextRequest, NextResponse } from 'next/server';
import { customersStorage, followUpsStorage } from '@/services/localStorage';

// 获取跟进记录列表 - 本地存储模式
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');

    let followUps = followUpsStorage.getAll();

    // 按客户筛选
    if (customerId) {
      followUps = followUps.filter((f: any) => f.customer_id === customerId);
    }

    // 排序：按日期倒序
    followUps.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ data: followUps });
  } catch (error) {
    console.error('获取跟进记录失败:', error);
    return NextResponse.json({ error: '获取跟进记录失败' }, { status: 500 });
  }
}

// 创建跟进记录 - 本地存储模式
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, content, contact_name, contact_phone, follow_up_date } = body;

    if (!customer_id || !content) {
      return NextResponse.json({ error: '客户ID和跟进内容不能为空' }, { status: 400 });
    }

    const data = followUpsStorage.create({
      customer_id,
      content,
      contact_name: contact_name || null,
      contact_phone: contact_phone || null,
      follow_up_date: follow_up_date || new Date().toISOString().split('T')[0],
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建跟进记录失败:', error);
    return NextResponse.json({ error: '创建跟进记录失败' }, { status: 500 });
  }
}
