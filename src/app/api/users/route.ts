import { NextRequest } from 'next/server';
import { usersService, User } from '@/services/authService';

export async function GET() {
  try {
    const users = usersService.getAll();
    return new Response(JSON.stringify({ 
      data: users,
      count: users.length 
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
    const { username, email, role = 'user', is_active = true } = body;
    
    if (!username || !email) {
      return new Response(JSON.stringify({ error: '用户名和邮箱必填' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 检查用户名是否已存在
    const existingUser = usersService.getByUsername(username);
    if (existingUser) {
      return new Response(JSON.stringify({ error: '用户名已存在' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const newUser = usersService.create({
      username,
      email,
      role,
      is_active,
    });
    
    return new Response(JSON.stringify({ data: newUser }), {
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
