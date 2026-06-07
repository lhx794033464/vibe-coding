import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUserInfo } from '@/lib/serverAuth';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUserInfo(request);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可修改KPI' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { content, indicator, weight } = body;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('kpi_templates')
      .update({ content, indicator, weight, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新KPI模板失败:', error);
    return NextResponse.json({ error: '更新KPI模板失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUserInfo(request);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可删除KPI' }, { status: 403 });
    }

    const { id } = await params;

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('kpi_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除KPI模板失败:', error);
    return NextResponse.json({ error: '删除KPI模板失败' }, { status: 500 });
  }
}