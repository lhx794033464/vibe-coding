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

    // 检查是否已申报
    const { data: existing } = await sb
      .from('commission_reports')
      .select('id')
      .eq('user_id', userInfo.id)
      .eq('month', month)
      .single();

    if (existing) {
      // 已存在则更新
      const { error } = await sb
        .from('commission_reports')
        .update({
          total_commission: total_commission || 0,
          paid_commission: paid_commission || 0,
          remaining_commission: remaining_commission || 0,
          commission_details: commission_details || [],
          status: 'pending',
          review_comment: null,
          reviewed_by: null,
          reviewed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        console.error('更新提成申报失败:', error);
        return NextResponse.json({ error: '更新提成申报失败' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: '已重新申报' });
    }

    // 新建申报
    const { error } = await sb.from('commission_reports').insert({
      user_id: userInfo.id,
      username: userInfo.username,
      month,
      total_commission: total_commission || 0,
      paid_commission: paid_commission || 0,
      remaining_commission: remaining_commission || 0,
      commission_details: commission_details || [],
      status: 'pending',
    });

    if (error) {
      console.error('创建提成申报失败:', error);
      return NextResponse.json({ error: '创建提成申报失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '申报成功' });
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
