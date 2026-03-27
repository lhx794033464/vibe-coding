import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseCredentials } from '@/storage/database/supabase-client';
import { createClient } from '@supabase/supabase-js';

// 游客用户ID
const GUEST_USER_ID = '00000000-0000-0000-0000-000000000000';

// 获取 supabase 客户端（支持游客模式）
function getClient(token?: string) {
  if (token && token !== 'guest') {
    return getSupabaseClient(token);
  }
  // 游客模式使用 anon key
  const { url, anonKey } = getSupabaseCredentials();
  return createClient(url, anonKey, {
    db: { timeout: 60000 },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 获取用户ID（支持游客模式）
async function getUserId(token?: string): Promise<string | null> {
  if (!token || token === 'guest') {
    return GUEST_USER_ID;
  }
  const client = getSupabaseClient(token);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return null;
  }
  return user.id;
}

// 获取今天的日期字符串（北京时间）
function getTodayDateString(): string {
  const now = new Date();
  // 使用 Intl.DateTimeFormat 获取北京时间日期
  const beijingFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const beijingParts = beijingFormatter.formatToParts(now);
  const yearPart = beijingParts.find(p => p.type === 'year')?.value || '';
  const monthPart = beijingParts.find(p => p.type === 'month')?.value || '';
  const dayPart = beijingParts.find(p => p.type === 'day')?.value || '';
  return `${yearPart}-${monthPart}-${dayPart}`; // YYYY-MM-DD in Beijing time
}

// 自动延期未完成的待办到今天
async function autoDelayTodos(client: ReturnType<typeof getClient>, userId: string) {
  const today = getTodayDateString();
  
  // 查找截止日期早于今天且未完成的待办
  const { data: overdueTodos, error: fetchError } = await client
    .from('todos')
    .select('id, due_date')
    .eq('user_id', userId)
    .eq('completed', false)
    .lt('due_date', `${today}T00:00:00.000Z`);
  
  if (fetchError) {
    console.error('获取逾期待办失败:', fetchError);
    return;
  }
  
  // 如果有逾期未完成的待办，延期到今天
  if (overdueTodos && overdueTodos.length > 0) {
    const todayStart = `${today}T00:00:00.000Z`;
    
    const { error: updateError } = await client
      .from('todos')
      .update({ 
        due_date: todayStart,
        updated_at: new Date().toISOString()
      })
      .in('id', overdueTodos.map(t => t.id));
    
    if (updateError) {
      console.error('自动延期待办失败:', updateError);
    } else {
      console.log(`已自动延期 ${overdueTodos.length} 个待办到 ${today}`);
    }
  }
}

// 获取待办列表
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // 'pending' | 'completed' | 'all'
    const date = searchParams.get('date'); // ISO date string

    // 自动延期未完成的待办到今天（替代 RPC 函数）
    await autoDelayTodos(client, userId);

    let query = client
      .from('todos')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    // 状态筛选
    if (status === 'pending') {
      query = query.eq('completed', false);
    } else if (status === 'completed') {
      query = query.eq('completed', true);
    }

    // 日期筛选 - 使用日期范围查询，避免 ::date 类型转换问题
    if (date) {
      const targetDate = date.split('T')[0]; // 取日期部分 YYYY-MM-DD
      // 使用 gte 和 lt 筛选整天的待办
      const dayStart = `${targetDate}T00:00:00`;
      const dayEnd = `${targetDate}T23:59:59`;
      query = query.gte('due_date', dayStart).lte('due_date', dayEnd);
    }

    // 按优先级和日期排序
    query = query.order('priority', { ascending: false });
    query = query.order('due_date', { ascending: true });
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 调试日志：返回待办数量
    console.log(`[待办API] 查询条件: status=${status}, date=${date}, 用户=${userId}`);
    console.log(`[待办API] 返回 ${data?.length || 0} 条待办, 总数 ${count}`);
    if (data && data.length > 0) {
      console.log(`[待办API] 待办内容:`, data.slice(0, 3).map(t => ({ content: t.content, due_date: t.due_date, completed: t.completed })));
    }

    return NextResponse.json({ data, count });
  } catch (error) {
    console.error('获取待办列表失败:', error);
    return NextResponse.json({ error: '获取待办列表失败' }, { status: 500 });
  }
}

// 创建待办
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const userId = await getUserId(token);
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getClient(token);
    const body = await request.json();
    const { content, customer_id, due_date, priority } = body;

    if (!content) {
      return NextResponse.json({ error: '待办内容不能为空' }, { status: 400 });
    }

    // 处理默认日期：下午5点前默认当天，5点后默认下一天
    let finalDueDate = due_date;
    if (!finalDueDate) {
      const now = new Date();
      const hour = now.getHours();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (hour < 17) {
        finalDueDate = today.toISOString();
      } else {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        finalDueDate = tomorrow.toISOString();
      }
    }

    const { data, error } = await client
      .from('todos')
      .insert({
        content,
        customer_id: customer_id || null,
        due_date: finalDueDate,
        priority: priority || 'low',
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建待办失败:', error);
    return NextResponse.json({ error: '创建待办失败' }, { status: 500 });
  }
}
