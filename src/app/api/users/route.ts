import { NextRequest } from 'next/server';
import { usersMemoryStorage } from '@/lib/usersMemoryStorage';

export async function GET() {
  try {
    const users = usersMemoryStorage.getAll();
    // 不返回密码哈希
    const safeUsers = users.map(({ password_hash, ...safeUser }: any) => safeUser);
    return new Response(JSON.stringify({ 
      data: safeUsers,
      count: safeUsers.length 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return new Response(JSON.stringify({ error: '获取用户列表失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, email = '', role = 'user', is_active = true, password } = body;
    
    if (!username) {
      return new Response(JSON.stringify({ error: '用户名为必填' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 检查用户名是否已存在
    const existingUser = usersMemoryStorage.getByUsername(username);
    if (existingUser) {
      return new Response(JSON.stringify({ error: '用户名已存在' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const newUser = usersMemoryStorage.create({
      username,
      email,
      role,
      is_active,
      password,
    });
    
    // 不返回密码哈希
    const { password_hash, ...safeUser }: any = newUser;
    
    return new Response(JSON.stringify({ data: safeUser }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('创建用户失败:', error);
    return new Response(JSON.stringify({ error: '创建用户失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
