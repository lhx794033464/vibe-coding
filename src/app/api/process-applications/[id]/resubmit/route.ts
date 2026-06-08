import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 重新提交被驳回的申请
export async function POST(
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

    // 获取申请详情
    const { data: application, error: fetchError } = await supabase
      .from('process_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !application) {
      return NextResponse.json({ error: '申请不存在' }, { status: 404 });
    }

    // 只有申请人可以重新提交
    if (application.applicant_id !== userInfo.id) {
      return NextResponse.json({ error: '只能重新提交自己的申请' }, { status: 403 });
    }

    // 只有被驳回的申请可以重新提交
    if (application.status !== 'rejected') {
      return NextResponse.json({ error: '只能重新提交被驳回的申请' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('process_applications')
      .update({
        status: 'pending',
        reject_reason: null,
        reviewer_id: null,
        reviewed_at: null,
      })
      .eq('id', id);

    if (updateError) {
      console.error('[Process] Resubmit error:', updateError);
      return NextResponse.json({ error: '重新提交失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Process] Resubmit error:', error);
    return NextResponse.json({ error: '重新提交失败' }, { status: 500 });
  }
}
