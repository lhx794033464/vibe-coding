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

    // 所有用户：统计本人的待审批申请数（管理员看到的是自己待审批还是所有人待审批？）
    // 管理员：统计所有待审批的申请数（需要管理员审批）
    // 普通用户：统计自己提交的待审批申请数
    const query = supabase
      .from('process_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (userInfo.role !== 'admin') {
      query.eq('applicant_id', userInfo.id);
    }

    const { count: pendingCount, error } = await query;

    if (error) {
      console.error('[Process] Pending count error:', error);
    }
    count = pendingCount || 0;

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[Process] Pending count error:', error);
    return NextResponse.json({ count: 0 });
  }
}
