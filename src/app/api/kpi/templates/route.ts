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
    const { data, error } = await supabase
      .from('kpi_templates')
      .select('*')
      .eq('year', year)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取KPI模板失败:', error);
    return NextResponse.json({ error: '获取KPI模板失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserInfo(request);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可设置KPI' }, { status: 403 });
    }

    const body = await request.json();
    const { year, content, indicator, weight, target_role } = body;

    if (!year || !content || !indicator || weight === undefined) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    const validIndicators = ['online_rate', 'completion_rate', 'knowledge_count', 'customer_satisfaction'];
    if (!validIndicators.includes(indicator)) {
      return NextResponse.json({ error: '无效的考核指标' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('kpi_templates')
      .insert({ year, content, indicator, weight, target_role: target_role || '交付顾问', created_by: user.id })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建KPI模板失败:', error);
    return NextResponse.json({ error: '创建KPI模板失败' }, { status: 500 });
  }
}