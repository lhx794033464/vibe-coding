import { NextRequest } from 'next/server';
import { usersMemoryStorage } from '@/lib/usersMemoryStorage';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = usersMemoryStorage.getById(params.id);
    if (!user) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 不返回密码哈希
    const { password_hash, ...safeUser } = user;
    return new Response(JSON.stringify({ data: safeUser }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('获取用户失败:', error);
    return new Response(JSON.stringify({ error: '获取用户失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updatedUser = usersMemoryStorage.update(params.id, body);
    
    if (!updatedUser) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 不返回密码哈希
    const { password_hash, ...safeUser } = updatedUser;
    
    return new Response(JSON.stringify({ data: safeUser }), {
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const success = usersMemoryStorage.delete(params.id);
    
    if (!success) {
      return new Response(JSON.stringify({ error: '删除用户失败或不允许删除最后一个管理员' }), {
        status: 400,
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
