import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 诊断 API - 检查 Supabase 连接和 user_profiles 表状态
 * GET /api/debug/supabase
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const supabase = getSupabaseClient(token);
    
    // 1. 检查当前用户
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ 
        error: '获取用户信息失败',
        details: userError?.message 
      }, { status: 401 });
    }

    const diagnostics: Record<string, any> = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      tables: {},
      errors: [],
    };

    // 2. 检查 customers 表
    try {
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('count', { count: 'exact', head: true });
      
      diagnostics.tables.customers = {
        accessible: !customersError,
        error: customersError?.message || null,
      };
    } catch (e: any) {
      diagnostics.tables.customers = {
        accessible: false,
        error: e.message,
      };
    }

    // 3. 检查 user_profiles 表
    try {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      diagnostics.tables.user_profiles = {
        accessible: !profileError,
        exists: !!profile,
        error: profileError?.message || null,
        data: profile || null,
      };
    } catch (e: any) {
      diagnostics.tables.user_profiles = {
        accessible: false,
        error: e.message,
      };
    }

    // 4. 检查 todos 表
    try {
      const { error: todosError } = await supabase
        .from('todos')
        .select('count', { count: 'exact', head: true });
      
      diagnostics.tables.todos = {
        accessible: !todosError,
        error: todosError?.message || null,
      };
    } catch (e: any) {
      diagnostics.tables.todos = {
        accessible: false,
        error: e.message,
      };
    }

    // 5. 检查 schedules 表
    try {
      const { error: schedulesError } = await supabase
        .from('schedules')
        .select('count', { count: 'exact', head: true });
      
      diagnostics.tables.schedules = {
        accessible: !schedulesError,
        error: schedulesError?.message || null,
      };
    } catch (e: any) {
      diagnostics.tables.schedules = {
        accessible: false,
        error: e.message,
      };
    }

    return NextResponse.json(diagnostics);
  } catch (error: any) {
    console.error('诊断失败:', error);
    return NextResponse.json({ 
      error: '诊断失败',
      details: error.message 
    }, { status: 500 });
  }
}
