import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取待处理申请数量
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    let count = 0;

    if (userInfo.role === 'admin') {
      // 管理员：统计待审批的申请数
      const { data } = await supabase
        .from('process_applications')
        .select('id', { count: 'exact', head: false })
        .eq('status', 'pending');
      count = data?.length || 0;
    } else {
      // 普通用户：统计已审批但未查看的申请数（已通过/已驳回）
      const { data } = await supabase
        .from('process_applications')
        .select('id')
        .eq('applicant_id', userInfo.id)
        .in('status', ['approved', 'rejected']);
      count = data?.length || 0;
    }

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[Process] Pending count error:', error);
    return NextResponse.json({ count: 0 });
  }
}
