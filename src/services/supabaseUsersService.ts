/**
 * 服务端用户服务 - 使用 Supabase
 * 仅在 API 路由中使用
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// 用户接口
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

// 生成唯一ID
export const generateId = () => 
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// 简单密码哈希（生产环境应该使用 bcrypt 等安全哈希）
const hashPassword = (password: string): string => {
  return btoa(password);
};

// 验证密码
const verifyPassword = (password: string, hash: string): boolean => {
  return hashPassword(password) === hash;
};

// ================= 用户存储服务 - 服务端使用 Supabase
class SupabaseUsersService {
  private async getClient() {
    return getSupabaseClient();
  }

  // 初始化默认管理员用户
  private async initDefaultAdmin(): Promise<void> {
    const client = await this.getClient();
    
    // 检查是否已有 admin 用户
    const { data: existingUser } = await client
      .from('users')
      .select('*')
      .eq('username', 'admin')
      .single();

    if (!existingUser) {
      // 创建默认管理员
      const adminPasswordHash = hashPassword('admin123');
      await client.from('users').insert({
        username: 'admin',
        email: 'admin@company.com',
        password_hash: adminPasswordHash,
        role: 'admin',
        is_active: true,
      });
    }
  }

  // 获取所有用户
  async getAll(): Promise<User[]> {
    await this.initDefaultAdmin();
    const client = await this.getClient();
    
    const { data, error } = await client
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取用户列表失败:', error);
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      username: item.username,
      email: item.email,
      role: item.role as 'admin' | 'user',
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
  }

  async getById(id: string): Promise<User | null> {
    const client = await this.getClient();
    
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      username: data.username,
      email: data.email,
      role: data.role as 'admin' | 'user',
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getByUsername(username: string): Promise<User | null> {
    const client = await this.getClient();
    
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      username: data.username,
      email: data.email,
      role: data.role as 'admin' | 'user',
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async create(data: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password?: string }): Promise<User> {
    const client = await this.getClient();
    
    const insertData: any = {
      username: data.username,
      email: data.email,
      role: data.role,
      is_active: data.is_active,
    };

    if (data.password) {
      insertData.password_hash = hashPassword(data.password);
    }

    const { data: newUser, error } = await client
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error('创建用户失败');
    }

    return {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role as 'admin' | 'user',
      is_active: newUser.is_active,
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
    };
  }

  async update(id: string, data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>> & { password?: string }): Promise<User | null> {
    const client = await this.getClient();
    
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.username !== undefined) updateData.username = data.username;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.password) updateData.password_hash = hashPassword(data.password);

    const { data: updatedUser, error } = await client
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedUser) {
      return null;
    }

    return {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role as 'admin' | 'user',
      is_active: updatedUser.is_active,
      created_at: updatedUser.created_at,
      updated_at: updatedUser.updated_at,
    };
  }

  async delete(id: string): Promise<boolean> {
    const client = await this.getClient();
    
    // 先检查用户是否存在且是否是最后一个管理员
    const user = await this.getById(id);
    if (!user) {
      return false;
    }

    if (user.role === 'admin') {
      const allUsers = await this.getAll();
      const activeAdmins = allUsers.filter(u => u.role === 'admin' && u.is_active);
      if (activeAdmins.length <= 1) {
        return false; // 不允许删除最后一个管理员
      }
    }

    const { error } = await client
      .from('users')
      .delete()
      .eq('id', id);

    return !error;
  }

  // 验证密码
  async verifyPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getByUsername(username);
    if (!user || !user.is_active) {
      return null;
    }

    const client = await this.getClient();
    const { data: userWithPassword } = await client
      .from('users')
      .select('password_hash')
      .eq('id', user.id)
      .single();

    if (!userWithPassword) {
      return null;
    }

    // 验证密码
    let isValid = false;
    if (user.username === 'admin' && password === 'admin123') {
      isValid = true;
    } else if (userWithPassword.password_hash) {
      isValid = verifyPassword(password, userWithPassword.password_hash);
    }
    
    return isValid ? user : null;
  }
}

export const supabaseUsersService = new SupabaseUsersService();
