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

    // 管理员视图：计算人均指标（所有顾问的平均值）
    let adminStats: Record<string, { averageValue: number }> = {};
    if (user.role === 'admin' && templates && templates.length > 0) {
      // 获取所有顾问用户
      const { data: consultants } = await supabase
        .from('users')
        .select('id, username')
        .in('role', ['交付顾问', '答疑顾问']);

      const consultantIds = (consultants || []).map(c => c.id).filter(Boolean);

      // 获取所有一对一交付客户
      const { data: allCustomers } = await supabase
        .from('customers')
        .select('delivery_consultant, status, acceptance_status, implementation_type');

      // 按用户名统计每位顾问的项目情况
      const consultantRates: Record<string, { onlineRate: number; acceptanceRate: number }> = {};
      (consultants || []).forEach((c: any) => {
        const userCustomers = (allCustomers || []).filter(
          (cust: any) => cust.delivery_consultant === c.username && cust.implementation_type === '一对一交付'
        );
        const total = userCustomers.length;
        const online = userCustomers.filter((cust: any) => cust.status === 'online').length;
        const accepted = userCustomers.filter((cust: any) => cust.acceptance_status === 'accepted').length;
        consultantRates[c.id] = {
          onlineRate: total > 0 ? Math.round((online / total) * 1000) / 10 : 0,
          acceptanceRate: total > 0 ? Math.round((accepted / total) * 1000) / 10 : 0,
        };
      });

      // 按模板计算人均值
      for (const tmpl of templates) {
        const tid = (tmpl as any).id;
        const indicator = (tmpl as any).indicator;

        if (indicator === 'online_rate') {
          // 所有顾问的上线率平均值
          const rates = Object.values(consultantRates).map((r: any) => r.onlineRate);
          const avg = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
          adminStats[tid] = { averageValue: Math.round(avg * 10) / 10 };
        } else if (indicator === 'completion_rate') {
          // 所有顾问的验收率平均值
          const rates = Object.values(consultantRates).map((r: any) => r.acceptanceRate);
          const avg = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
          adminStats[tid] = { averageValue: Math.round(avg * 10) / 10 };
        } else if (indicator === 'knowledge_count' || indicator === 'customer_satisfaction') {
          // 所有顾问的手动填写值平均值
          const relevantProgress = (progress || []).filter(p => p.template_id === tid);
          if (relevantProgress.length > 0) {
            const sum = relevantProgress.reduce((s, p: any) => s + parseFloat(p.manual_value || '0'), 0);
            const avg = sum / relevantProgress.length;
            adminStats[tid] = { averageValue: Math.round(avg * 10) / 10 };
          } else {
            adminStats[tid] = { averageValue: indicator === 'customer_satisfaction' ? 100 : 0 };
          }
        }
      }
    }

    return NextResponse.json({ templates, progress, adminStats });
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

    // 客户满意度默认100%，顾问可编辑

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