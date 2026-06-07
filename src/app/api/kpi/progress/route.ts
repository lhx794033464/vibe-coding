import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUserInfo } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserInfo(request);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    const supabase = getSupabaseClient();

    // 获取 KPI 模板
    const { data: templates, error: tmplError } = await supabase
      .from('kpi_templates')
      .select('*')
      .eq('year', year)
      .order('sort_order', { ascending: true });

    if (tmplError) throw tmplError;

    // 获取当前用户的进度（admin 可查看所有）
    let query = supabase
      .from('kpi_progress')
      .select('*')
      .eq('year', year);

    if (user.role !== 'admin') {
      query = query.eq('user_id', user.id);
    }

    const { data: progress, error: progError } = await query;

    if (progError) throw progError;

    return NextResponse.json({ templates, progress });
  } catch (error) {
    console.error('获取KPI数据失败:', error);
    return NextResponse.json({ error: '获取KPI数据失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUserInfo(request);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { template_id, value, year } = body;

    if (!template_id || value === undefined || !year) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 查询模板确定指标类型
    const { data: template, error: tError } = await supabase
      .from('kpi_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (tError || !template) {
      return NextResponse.json({ error: 'KPI模板不存在' }, { status: 404 });
    }

    // customer_satisfaction 仅管理员可编辑
    if (template.indicator === 'customer_satisfaction' && user.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可编辑客户满意度' }, { status: 403 });
    }

    const targetUserId = user.role === 'admin' ? (body.user_id || user.id) : user.id;

    // upsert: insert or update
    const { data: existing } = await supabase
      .from('kpi_progress')
      .select('id')
      .eq('template_id', template_id)
      .eq('user_id', targetUserId)
      .eq('year', year)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('kpi_progress')
        .update({ manual_value: value, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('kpi_progress')
        .insert({ template_id, user_id: targetUserId, year, manual_value: value })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('更新KPI进度失败:', error);
    return NextResponse.json({ error: '更新KPI进度失败' }, { status: 500 });
  }
}