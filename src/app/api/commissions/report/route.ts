import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取提成申报列表
// 管理员：查看所有申报；普通用户：查看自己的申报
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未授权，请重新登录' }, { status: 401 });
    }

    // 验证 admin 角色（token + 数据库双重校验）
    let isAdminUser = userInfo.role === 'admin';
    if (!isAdminUser) {
      try {
        const sbCheck = getSupabaseClient();
        const { data: dbUser } = await sbCheck
          .from('users')
          .select('role, is_active')
          .eq('id', userInfo.id)
          .single();
        if (dbUser && dbUser.role === 'admin' && dbUser.is_active) {
          isAdminUser = true;
        }
      } catch {}
    }

    const sb = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get('month');
    const status = searchParams.get('status');

    let query = sb
      .from('commission_reports')
      .select('*')
      .order('created_at', { ascending: false });

    // 普通用户只能看自己的申报
    if (!isAdminUser) {
      query = query.eq('user_id', userInfo.id);
    }

    if (month) {
      query = query.eq('month', month);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('获取提成申报列表失败:', error);
      return NextResponse.json({ error: '获取提成申报列表失败' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('获取提成上报列表失败:', error);
    return NextResponse.json({ error: '获取提成上报列表失败' }, { status: 500 });
  }
}

// 普通用户申报提成
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { month, total_commission, paid_commission, remaining_commission, commission_details } = body;

    if (!month) {
      return NextResponse.json({ error: '月份不能为空' }, { status: 400 });
    }

    const sb = getSupabaseClient();

    // 检查是否已有申报
    const { data: existingReports } = await sb
      .from('commission_reports')
      .select('id, status, commission_details')
      .eq('user_id', userInfo.id)
      .eq('month', month);

    // 检查是否有已审批的申报，提取已申报的客户ID
    const approvedReports = (existingReports || []).filter((r: any) => r.status === 'approved');
    const approvedCustomerIds = new Set<string>();
    for (const report of approvedReports) {
      const details = report.commission_details || [];
      for (const d of details) {
        if (d.customerId) approvedCustomerIds.add(d.customerId);
      }
    }

    // 过滤掉与已审批申报重复的客户
    const newDetails = (commission_details || []).filter((d: any) => !approvedCustomerIds.has(d.customerId));

    // 如果所有客户都已申报过，提示无需申报
    if (commission_details?.length > 0 && newDetails.length === 0) {
      return NextResponse.json({
        error: '所有客户已在已审批的申报中，无需重复申报',
        duplicateCustomerIds: [...approvedCustomerIds],
      }, { status: 400 });
    }

    // 计算补充申报的金额
    const filteredTotal = newDetails.reduce((sum: number, d: any) => sum + (d.commissionAmount || 0), 0);
    const filteredPaid = newDetails.reduce((sum: number, d: any) => sum + (d.paidDays || 0) * (d.dailyRate || 0), 0);
    const filteredRemaining = filteredTotal - filteredPaid;

    // 查找非approved的已有申报（pending/rejected）
    const nonApprovedReport = (existingReports || []).find((r: any) => r.status !== 'approved');

    if (nonApprovedReport) {
      // 更新非approved的申报
      const { error } = await sb
        .from('commission_reports')
        .update({
          total_commission: filteredTotal || 0,
          paid_commission: filteredPaid || 0,
          remaining_commission: filteredRemaining || 0,
          commission_details: newDetails,
          status: 'pending',
          review_comment: null,
          reviewed_by: null,
          reviewed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', nonApprovedReport.id);

      if (error) {
        console.error('更新提成申报失败:', error);
        return NextResponse.json({ error: '更新提成申报失败' }, { status: 500 });
      }

      const message = approvedCustomerIds.size > 0
        ? `已过滤${approvedCustomerIds.size}个已审批客户，补充申报成功`
        : '已重新申报';

      return NextResponse.json({ success: true, message, filteredCount: approvedCustomerIds.size });
    }

    // 新建申报
    const { error } = await sb.from('commission_reports').insert({
      user_id: userInfo.id,
      username: userInfo.username,
      month,
      total_commission: filteredTotal || 0,
      paid_commission: filteredPaid || 0,
      remaining_commission: filteredRemaining || 0,
      commission_details: newDetails,
      status: 'pending',
    });

    if (error) {
      console.error('创建提成申报失败:', error);
      return NextResponse.json({ error: '创建提成申报失败' }, { status: 500 });
    }

    const message = approvedCustomerIds.size > 0
      ? `已过滤${approvedCustomerIds.size}个已审批客户，补充申报成功`
      : '申报成功';

    return NextResponse.json({ success: true, message, filteredCount: approvedCustomerIds.size });
  } catch (error) {
    console.error('提成申报失败:', error);
    return NextResponse.json({ error: '提成申报失败' }, { status: 500 });
  }
}

// 管理员审核/驳回
export async function PATCH(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      console.error('[commission-review] 未授权: 无法解析用户信息');
      return NextResponse.json({ error: '未授权，请重新登录' }, { status: 401 });
    }

    // 先检查 token 中的 role
    let isAdmin = userInfo.role === 'admin';

    // 如果 token 中不是 admin，再从数据库验证（防止 token 过期/不一致）
    if (!isAdmin) {
      try {
        const sb = getSupabaseClient();
        const { data: dbUser } = await sb
          .from('users')
          .select('role, is_active')
          .eq('id', userInfo.id)
          .single();
        if (dbUser && dbUser.role === 'admin' && dbUser.is_active) {
          isAdmin = true;
        }
      } catch (dbErr) {
        console.error('[commission-review] 数据库验证失败:', dbErr);
      }
    }

    if (!isAdmin) {
      console.error(`[commission-review] 无权操作: userId=${userInfo.id}, username=${userInfo.username}, tokenRole=${userInfo.role}`);
      return NextResponse.json({ error: '无权审核，仅管理员可操作' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, review_comment } = body;

    if (!id || !status) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: '无效的审核状态' }, { status: 400 });
    }

    const sb = getSupabaseClient();
    const { error } = await sb
      .from('commission_reports')
      .update({
        status,
        review_comment: review_comment || null,
        reviewed_by: userInfo.username,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('审核提成申报失败:', error);
      return NextResponse.json({ error: '审核提成申报失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('审核提成上报失败:', error);
    return NextResponse.json({ error: '审核提成上报失败' }, { status: 500 });
  }
}
