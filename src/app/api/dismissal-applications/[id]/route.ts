import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 审批解散申请（仅管理员）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    if (userInfo.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可审批' }, { status: 403 });
    }

    const body = await request.json();
    const { status, reject_reason } = body;

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: '无效的审批状态' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 获取当前申请
    const { data: application, error: fetchError } = await supabase
      .from('dismissal_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !application) {
      return NextResponse.json({ error: '申请不存在' }, { status: 404 });
    }

    if (application.status !== 'pending') {
      return NextResponse.json({ error: '该申请已处理' }, { status: 400 });
    }

    // 更新申请状态
    const updateData: Record<string, any> = {
      status,
      reviewer_id: userInfo.id,
      reviewed_at: new Date().toISOString(),
    };
    if (status === 'rejected' && reject_reason) {
      updateData.reject_reason = reject_reason;
    }

    const { data: updatedApp, error: updateError } = await supabase
      .from('dismissal_applications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('更新申请状态失败:', updateError);
      return NextResponse.json({ error: '更新申请状态失败' }, { status: 500 });
    }

    // 审批通过时，更新客户为已解散
    if (status === 'approved') {
      const { error: customerError } = await supabase
        .from('customers')
        .update({ dismissed: true })
        .eq('id', application.customer_id);

      if (customerError) {
        console.error('更新客户解散状态失败:', customerError);
        return NextResponse.json({ error: '更新客户解散状态失败' }, { status: 500 });
      }
    }

    return NextResponse.json({ data: updatedApp });
  } catch (error) {
    console.error('审批解散申请失败:', error);
    return NextResponse.json({ error: '审批解散申请失败' }, { status: 500 });
  }
}

// 获取解散申请详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('dismissal_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '申请不存在' }, { status: 404 });
    }

    // 非管理员只能查看自己的申请
    if (userInfo.role !== 'admin' && data.applicant_id !== userInfo.id) {
      return NextResponse.json({ error: '无权查看此申请' }, { status: 403 });
    }

    // 获取关联数据
    const [customerResult, applicantResult] = await Promise.all([
      supabase.from('customers').select('id, name, delivery_consultant, delivery_deadline, dismissed').eq('id', data.customer_id).single(),
      supabase.from('users').select('id, username, role').eq('id', data.applicant_id).single(),
    ]);

    let reviewer = null;
    if (data.reviewer_id) {
      const { data: reviewerData } = await supabase.from('users').select('id, username').eq('id', data.reviewer_id).single();
      reviewer = reviewerData;
    }

    const enrichedData = {
      ...data,
      customer: customerResult.data || null,
      applicant: applicantResult.data || null,
      reviewer,
    };

    return NextResponse.json({ data: enrichedData });
  } catch (error) {
    console.error('获取解散申请详情失败:', error);
    return NextResponse.json({ error: '获取解散申请详情失败' }, { status: 500 });
  }
}
