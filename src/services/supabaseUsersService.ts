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
  role: 'admin' | '交付顾问' | '答疑顾问' | '其他';
  employment_status: '在职' | '离职';
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

const mapUserFromDb = (item: any): User => ({
  id: item.id,
  username: item.username,
  email: item.email,
  role: item.role as 'admin' | '交付顾问' | '答疑顾问' | '其他',
  employment_status: (item.employment_status as '在职' | '离职') || '在职',
  is_active: item.is_active,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

// 生成唯一ID
export const generateId = () => 
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// 安全密码哈希
const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

// 验证密码
const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  // 兼容旧的 Base64 密码：如果 hash 不以 $2 开头，说明是旧密码
  if (!hash.startsWith('$2')) {
    const legacyMatch = btoa(password) === hash;
    return legacyMatch;
  }
  return bcrypt.compare(password, hash);
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
      const adminPasswordHash = await hashPassword(process.env.ADMIN_INITIAL_PASSWORD || 'admin123');
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

    return data.map((item: any) => mapUserFromDb(item));
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

    return mapUserFromDb(data);
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

    return mapUserFromDb(data);
  }

  async create(data: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password?: string }): Promise<User> {
    const client = await this.getClient();
    
    const insertData: any = {
      username: data.username,
      email: data.email,
      role: data.role || '交付顾问',
      employment_status: data.employment_status || '在职',
      is_active: data.is_active,
    };

    if (data.password) {
      insertData.password_hash = await hashPassword(data.password);
    }

    const { data: newUser, error } = await client
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error('创建用户失败');
    }

    return mapUserFromDb(newUser);
  }

  async update(id: string, data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>> & { password?: string }): Promise<User | null> {
    const client = await this.getClient();
    
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.username !== undefined) updateData.username = data.username;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.employment_status !== undefined) updateData.employment_status = data.employment_status;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.password) updateData.password_hash = await hashPassword(data.password);

    const { data: updatedUser, error } = await client
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedUser) {
      return null;
    }

    return mapUserFromDb(updatedUser);
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
    if (userWithPassword.password_hash) {
      isValid = await verifyPassword(password, userWithPassword.password_hash);
    }
    
    return isValid ? user : null;
  }
}

export const supabaseUsersService = new SupabaseUsersService();
