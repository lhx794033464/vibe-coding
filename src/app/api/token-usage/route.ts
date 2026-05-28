import { NextRequest } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
    }

    const isAdmin = userInfo.role === 'admin';
    const client = getSupabaseClient();

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'all'; // all, today, week, month

    // 构建日期过滤
    let dateFilter = '';
    if (period === 'today') {
      dateFilter = ` AND created_at >= CURRENT_DATE`;
    } else if (period === 'week') {
      dateFilter = ` AND created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = ` AND created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    // 管理员看全部，普通用户只看自己的
    const userFilter = isAdmin ? '' : ` AND user_id = '${userInfo.id}'`;

    // 查询汇总
    const { data: summary, error: summaryError } = await client.rpc('exec_sql', {
      sql: `
        SELECT 
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COUNT(*) as total_calls
        FROM token_usage
        WHERE 1=1${userFilter}${dateFilter}
      `
    }).single();

    // 直接用 Supabase 查询
    let query = client
      .from('token_usage')
      .select('input_tokens, output_tokens, total_tokens, model, api_type, created_at');

    if (!isAdmin) {
      query = query.eq('user_id', userInfo.id);
    }

    if (period === 'today') {
      query = query.gte('created_at', new Date().toISOString().split('T')[0]);
    } else if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte('created_at', weekAgo.toISOString());
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      query = query.gte('created_at', monthAgo.toISOString());
    }

    const { data: records, error: recordsError } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    // 手动计算汇总
    const totalInputTokens = (records || []).reduce((sum: number, r: any) => sum + (r.input_tokens || 0), 0);
    const totalOutputTokens = (records || []).reduce((sum: number, r: any) => sum + (r.output_tokens || 0), 0);
    const totalTokens = (records || []).reduce((sum: number, r: any) => sum + (r.total_tokens || 0), 0);
    const totalCalls = (records || []).length;

    // 按模型分组统计
    const modelStats: Record<string, { input: number; output: number; total: number; calls: number }> = {};
    (records || []).forEach((r: any) => {
      const model = r.model || 'unknown';
      if (!modelStats[model]) {
        modelStats[model] = { input: 0, output: 0, total: 0, calls: 0 };
      }
      modelStats[model].input += r.input_tokens || 0;
      modelStats[model].output += r.output_tokens || 0;
      modelStats[model].total += r.total_tokens || 0;
      modelStats[model].calls += 1;
    });

    // 按日期分组统计（最近30天）
    const dailyStats: Record<string, { input: number; output: number; total: number }> = {};
    (records || []).forEach((r: any) => {
      const date = r.created_at?.split('T')[0] || 'unknown';
      if (!dailyStats[date]) {
        dailyStats[date] = { input: 0, output: 0, total: 0 };
      }
      dailyStats[date].input += r.input_tokens || 0;
      dailyStats[date].output += r.output_tokens || 0;
      dailyStats[date].total += r.total_tokens || 0;
    });

    return new Response(JSON.stringify({
      success: true,
      data: {
        summary: {
          totalInputTokens,
          totalOutputTokens,
          totalTokens,
          totalCalls,
        },
        modelStats,
        dailyStats,
        recentRecords: (records || []).slice(0, 20),
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('查询 token 用量失败:', error);
    return new Response(JSON.stringify({ error: '查询失败' }), { status: 500 });
  }
}
