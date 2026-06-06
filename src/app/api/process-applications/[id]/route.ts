import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 审批流程申请
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
      return NextResponse.json({ error: '无权限审批' }, { status: 403 });
    }

    const body = await request.json();
    const { status, reject_reason } = body;

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: '无效的审批状态' }, { status: 400 });
    }

    if (status === 'rejected' && !reject_reason) {
      return NextResponse.json({ error: '驳回时请填写驳回原因' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 获取申请详情
    const { data: application, error: fetchError } = await supabase
      .from('process_applications')
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
    const updateData: Record<string, unknown> = {
      status,
      reviewer_id: userInfo.id,
      reviewed_at: new Date().toISOString(),
    };

    if (status === 'rejected') {
      updateData.reject_reason = reject_reason;
    }

    const { error: updateError } = await supabase
      .from('process_applications')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('[Process] Update error:', updateError);
      return NextResponse.json({ error: '审批失败' }, { status: 500 });
    }

    // 如果是群聊解散且审批通过，更新所有客户状态为已解散
    if (status === 'approved' && application.type === 'group_dismissal' && application.customer_id) {
      let customerIds: string[] = [];
      try {
        customerIds = JSON.parse(application.customer_id);
      } catch {
        customerIds = [application.customer_id];
      }

      for (const cid of customerIds) {
        const { error: customerError } = await supabase
          .from('customers')
          .update({ dismissed: true })
          .eq('id', cid);

        if (customerError) {
          console.error('[Process] Update customer dismissed error:', customerError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Process] Approve error:', error);
    return NextResponse.json({ error: '审批失败' }, { status: 500 });
  }
}
