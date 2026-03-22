import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取单个客户详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取客户详情失败:', error);
    return NextResponse.json({ error: '获取客户详情失败' }, { status: 500 });
  }
}

// 更新客户
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();

    // 先获取当前客户信息
    const { data: currentCustomer } = await client
      .from('customers')
      .select('status')
      .eq('id', id)
      .single();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    
    if (body.name !== undefined) updateData.name = body.name;
    if (body.sales_order_no !== undefined) updateData.sales_order_no = body.sales_order_no;
    if (body.implementation_order_no !== undefined) updateData.implementation_order_no = body.implementation_order_no;
    if (body.implementation_fee !== undefined) updateData.implementation_fee = body.implementation_fee;
    if (body.implementation_days !== undefined) updateData.implementation_days = body.implementation_days;
    if (body.opened_at !== undefined) updateData.opened_at = body.opened_at;
    if (body.version !== undefined) updateData.version = body.version;
    if (body.modules !== undefined) updateData.modules = body.modules;
    if (body.industry !== undefined) updateData.industry = body.industry;
    if (body.special_requirements !== undefined) updateData.special_requirements = body.special_requirements;
    if (body.last_follow_up_at !== undefined) updateData.last_follow_up_at = body.last_follow_up_at;

    // 处理状态变更时的时间字段
    if (body.status !== undefined) {
      updateData.status = body.status;
      
      const onlineStatuses = ['accepted', 'online_not_accepted', 'partially_online'];
      const currentStatus = currentCustomer?.status;
      
      // 如果从非上线状态变为上线状态，设置上线时间
      if (onlineStatuses.includes(body.status) && !onlineStatuses.includes(currentStatus)) {
        updateData.online_at = new Date().toISOString();
      }
      
      // 如果变为已验收状态，设置验收时间
      if (body.status === 'accepted' && currentStatus !== 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }
    }

    const { data, error } = await client
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新客户失败:', error);
    return NextResponse.json({ error: '更新客户失败' }, { status: 500 });
  }
}

// 删除客户
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // 先删除相关跟进记录
    await client
      .from('follow_up_records')
      .delete()
      .eq('customer_id', id);

    // 再删除客户
    const { error } = await client
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除客户失败:', error);
    return NextResponse.json({ error: '删除客户失败' }, { status: 500 });
  }
}
