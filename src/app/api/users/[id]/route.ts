import { NextRequest } from 'next/server';
import { supabaseUsersService } from '@/services/supabaseUsersService';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await supabaseUsersService.getById(id);
    
    if (!user) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ data: user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('获取用户详情失败:', error);
    return new Response(JSON.stringify({ error: '获取用户详情失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { username, email, role, is_active, password } = body;
    
    const updatedUser = await supabaseUsersService.update(id, {
      username,
      email,
      role,
      is_active,
      password,
    });
    
    if (!updatedUser) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ data: updatedUser }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('更新用户失败:', error);
    return new Response(JSON.stringify({ error: '更新用户失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const success = await supabaseUsersService.delete(id);
    
    if (!success) {
      return new Response(JSON.stringify({ error: '用户不存在或无法删除' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    return new Response(JSON.stringify({ error: '删除用户失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
