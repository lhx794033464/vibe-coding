import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取跟进记录列表
export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customer_id');

    if (!customerId) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    const { data, error } = await client
      .from('follow_up_records')
      .select('*')
      .eq('customer_id', customerId)
      .order('follow_up_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取跟进记录失败:', error);
    return NextResponse.json({ error: '获取跟进记录失败' }, { status: 500 });
  }
}

// 创建跟进记录
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
    const { 
      customer_id, 
      follow_up_at, 
      content, 
      meeting_link, 
      is_accepted, 
      signature_image_url 
    } = body;

    if (!customer_id || !follow_up_at || !content) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
    }

    const { data, error } = await client
      .from('follow_up_records')
      .insert({
        customer_id,
        follow_up_at,
        content,
        meeting_link: meeting_link || null,
        is_accepted: is_accepted || false,
        signature_image_url: signature_image_url || null,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 更新客户的最后跟进时间
    await client
      .from('customers')
      .update({ 
        last_follow_up_at: follow_up_at,
        updated_at: new Date().toISOString()
      })
      .eq('id', customer_id);

    // 如果标记为验收，更新客户状态
    if (is_accepted) {
      await client
        .from('customers')
        .update({ 
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', customer_id);
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建跟进记录失败:', error);
    return NextResponse.json({ error: '创建跟进记录失败' }, { status: 500 });
  }
}
