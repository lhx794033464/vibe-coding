import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/morning-sharing - 获取晨会分享排期
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const client = getSupabaseClient();
    let query = client
      .from('morning_meeting_shares')
      .select('*')
      .order('share_date', { ascending: true });

    if (startDate) {
      query = query.gte('share_date', startDate);
    }
    if (endDate) {
      query = query.lte('share_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('获取晨会分享失败:', error.message);
      return NextResponse.json({ error: '获取晨会分享失败' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '未知错误';
    console.error('获取晨会分享失败:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/morning-sharing - 创建/更新晨会分享排期
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { share_date, user_name, topic } = body;

    if (!share_date || !user_name) {
      return NextResponse.json({ error: '分享日期和分享人姓名不能为空' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // Upsert: 如果该日期已有该用户的记录则更新，否则插入
    const { data, error } = await client
      .from('morning_meeting_shares')
      .upsert(
        {
          share_date,
          user_name,
          topic: topic || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'share_date,user_name' }
      )
      .select()
      .single();

    if (error) {
      console.error('创建晨会分享失败:', error.message);
      return NextResponse.json({ error: '创建晨会分享失败' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '未知错误';
    console.error('创建晨会分享失败:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/morning-sharing - 删除晨会分享排期
export async function DELETE(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from('morning_meeting_shares')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除晨会分享失败:', error.message);
      return NextResponse.json({ error: '删除晨会分享失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '未知错误';
    console.error('删除晨会分享失败:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
