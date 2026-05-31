/**
 * 数据库服务层 - 所有业务数据通过 Supabase 操作
 * 替代原 ServerStorage 文件存储
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// ==================== 认证服务 ====================

export interface DbUser {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

// 简单密码哈希（与原系统兼容）
export const hashPassword = (password: string): string => {
  return Buffer.from(password).toString('base64');
};

const verifyPassword = (password: string, hash: string): boolean => {
  return hashPassword(password) === hash;
};

// 生成唯一ID
export const generateId = () =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// ==================== 管理员初始化 ====================

let adminEnsured = false;

/**
 * 确保默认管理员账号存在
 * 如果 admin 用户不存在则自动创建（首次启动或新环境时）
 */
export async function ensureAdminUser(): Promise<void> {
  if (adminEnsured) return;
  
  try {
    const existing = await dbGetUserByUsername('admin');
    if (!existing) {
      const client = getSupabaseClient();
      const { error } = await client
        .from('users')
        .insert({
          id: 'admin_default',
          username: 'admin',
          email: 'admin@company.com',
          password_hash: hashPassword('admin123'),
          role: 'admin',
          is_active: true,
        });
      if (error) {
        console.error('创建默认管理员失败:', error.message);
      }
    }
    adminEnsured = true;
  } catch (err) {
    console.error('确保管理员账号失败:', err);
  }
}

// ==================== 用户操作 ====================

export async function dbGetAllUsers(): Promise<DbUser[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('users')
    .select('id, username, email, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`获取用户列表失败: ${error.message}`);
  return (data as DbUser[]) || [];
}

export async function dbGetUserById(id: string): Promise<DbUser | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('users')
    .select('id, username, email, role, is_active, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`获取用户失败: ${error.message}`);
  return data as DbUser | null;
}

export async function dbGetUserByUsername(username: string): Promise<(DbUser & { password_hash: string }) | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  if (error) throw new Error(`获取用户失败: ${error.message}`);
  return data as (DbUser & { password_hash: string }) | null;
}

export async function dbCreateUser(userData: {
  username: string;
  email?: string;
  password: string;
  role?: 'admin' | 'user';
  is_active?: boolean;
}): Promise<DbUser> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('users')
    .insert({
      username: userData.username,
      email: userData.email || null,
      password_hash: hashPassword(userData.password),
      role: userData.role || 'user',
      is_active: userData.is_active !== undefined ? userData.is_active : true,
    })
    .select('id, username, email, role, is_active, created_at, updated_at')
    .single();
  if (error) throw new Error(`创建用户失败: ${error.message}`);
  return data as DbUser;
}

export async function dbUpdateUser(id: string, updates: Partial<{
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  is_active: boolean;
}>): Promise<DbUser | null> {
  const client = getSupabaseClient();
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.username !== undefined) updateData.username = updates.username;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.password !== undefined) updateData.password_hash = hashPassword(updates.password);
  if (updates.role !== undefined) updateData.role = updates.role;
  if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

  const { data, error } = await client
    .from('users')
    .update(updateData)
    .eq('id', id)
    .select('id, username, email, role, is_active, created_at, updated_at')
    .maybeSingle();
  if (error) throw new Error(`更新用户失败: ${error.message}`);
  return data as DbUser | null;
}

export async function dbDeleteUser(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from('users').delete().eq('id', id);
  if (error) throw new Error(`删除用户失败: ${error.message}`);
  return true;
}

// ==================== 认证操作 ====================

export interface AuthResult {
  success: boolean;
  user?: DbUser;
  token?: string;
  error?: string;
}

export async function dbAuthenticateUser(username: string, password: string): Promise<AuthResult> {
  const userWithHash = await dbGetUserByUsername(username);

  if (!userWithHash) {
    return { success: false, error: '用户名或密码错误' };
  }

  if (!userWithHash.is_active) {
    return { success: false, error: '账号已被禁用' };
  }

  if (!verifyPassword(password, userWithHash.password_hash)) {
    return { success: false, error: '用户名或密码错误' };
  }

  const { password_hash, ...safeUser } = userWithHash;
  const token = Buffer.from(`${safeUser.id}:${safeUser.username}:${safeUser.role}:${generateId()}`).toString('base64');

  return {
    success: true,
    user: safeUser,
    token,
  };
}

// ==================== 客户操作 ====================

export async function dbGetCustomers(filters?: {
  status?: string;
  acceptanceStatus?: string;
  search?: string;
  userId?: string;
  isAdmin?: boolean;
  timeRange?: string;
  name?: string;
}): Promise<any[]> {
  const client = getSupabaseClient();
  let query = client.from('customers').select('*');

  // 数据隔离：普通用户只能看到自己创建的客户
  if (filters?.userId && !filters?.isAdmin) {
    query = query.eq('user_id', filters.userId);
  }

  // 状态筛选
  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  // 验收状态筛选
  if (filters?.acceptanceStatus && filters.acceptanceStatus !== 'all') {
    query = query.eq('acceptance_status', filters.acceptanceStatus);
  }

  // 按名称精确筛选
  if (filters?.name) {
    query = query.eq('name', filters.name);
  }

  // 时间范围
  if (filters?.timeRange && filters.timeRange !== 'all') {
    const now = new Date();
    let startDate: string;
    if (filters.timeRange === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else if (filters.timeRange === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1).toISOString();
    } else {
      startDate = new Date(0).toISOString();
    }
    query = query.gte('created_at', startDate);
  }

  // 搜索
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    query = query.or(`name.ilike.%${s}%,sales_order_no.ilike.%${s}%,industry.ilike.%${s}%`);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`获取客户列表失败: ${error.message}`);
  return data || [];
}

export async function dbGetCustomerById(id: string): Promise<any | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`获取客户详情失败: ${error.message}`);
  return data;
}

export async function dbCreateCustomer(customerData: Record<string, any>): Promise<any> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('customers')
    .insert(customerData)
    .select()
    .single();
  if (error) throw new Error(`创建客户失败: ${error.message}`);
  return data;
}

export async function dbUpdateCustomer(id: string, updates: Record<string, any>): Promise<any | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('customers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`更新客户失败: ${error.message}`);
  return data;
}

export async function dbDeleteCustomer(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from('customers').delete().eq('id', id);
  if (error) throw new Error(`删除客户失败: ${error.message}`);
  return true;
}

// ==================== 跟进记录操作 ====================

export async function dbGetFollowUps(filters?: {
  customerId?: string;
  userId?: string;
  isAdmin?: boolean;
}): Promise<any[]> {
  const client = getSupabaseClient();
  let query = client.from('follow_up_records').select('*');

  if (filters?.userId && !filters?.isAdmin) {
    query = query.eq('user_id', filters.userId);
  }
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }
  query = query.order('follow_up_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`获取跟进记录失败: ${error.message}`);
  return data || [];
}

export async function dbCreateFollowUp(recordData: Record<string, any>): Promise<any> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('follow_up_records')
    .insert(recordData)
    .select()
    .single();
  if (error) throw new Error(`创建跟进记录失败: ${error.message}`);
  return data;
}

export async function dbUpdateFollowUp(id: string, updates: Record<string, any>): Promise<any | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('follow_up_records')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`更新跟进记录失败: ${error.message}`);
  return data;
}

export async function dbDeleteFollowUp(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from('follow_up_records').delete().eq('id', id);
  if (error) throw new Error(`删除跟进记录失败: ${error.message}`);
  return true;
}

// ==================== 日程排期操作 ====================

export async function dbGetSchedules(filters?: {
  customerId?: string;
  userId?: string;
  isAdmin?: boolean;
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  const client = getSupabaseClient();
  let query = client.from('schedules').select('*');

  if (filters?.userId && !filters?.isAdmin) {
    query = query.eq('user_id', filters.userId);
  }
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }
  if (filters?.startDate) {
    query = query.gte('schedule_date', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('schedule_date', filters.endDate);
  }
  query = query.order('schedule_date', { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`获取日程列表失败: ${error.message}`);
  return data || [];
}

export async function dbCreateSchedule(scheduleData: Record<string, any>): Promise<any> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('schedules')
    .insert(scheduleData)
    .select()
    .single();
  if (error) throw new Error(`创建日程失败: ${error.message}`);
  return data;
}

export async function dbUpdateSchedule(id: string, updates: Record<string, any>): Promise<any | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`更新日程失败: ${error.message}`);
  return data;
}

export async function dbDeleteSchedule(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from('schedules').delete().eq('id', id);
  if (error) throw new Error(`删除日程失败: ${error.message}`);
  return true;
}

// ==================== 实施日志操作 ====================

export async function dbGetImplementationLogs(filters?: {
  customerId?: string;
  userId?: string;
  isAdmin?: boolean;
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  const client = getSupabaseClient();
  let query = client.from('implementation_logs').select('*');

  if (filters?.userId && !filters?.isAdmin) {
    query = query.eq('user_id', filters.userId);
  }
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }
  if (filters?.startDate) {
    query = query.gte('log_date', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('log_date', filters.endDate);
  }
  query = query.order('log_date', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`获取实施日志失败: ${error.message}`);
  return data || [];
}

export async function dbCreateImplementationLog(logData: Record<string, any>): Promise<any> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('implementation_logs')
    .insert(logData)
    .select()
    .single();
  if (error) throw new Error(`创建实施日志失败: ${error.message}`);
  return data;
}

export async function dbUpdateImplementationLog(id: string, updates: Record<string, any>): Promise<any | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('implementation_logs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`更新实施日志失败: ${error.message}`);
  return data;
}

export async function dbDeleteImplementationLog(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from('implementation_logs').delete().eq('id', id);
  if (error) throw new Error(`删除实施日志失败: ${error.message}`);
  return true;
}

// ==================== 提成记录操作 ====================

export async function dbGetCommissionRecords(filters?: {
  customerId?: string;
  userId?: string;
  isAdmin?: boolean;
}): Promise<any[]> {
  const client = getSupabaseClient();
  let query = client.from('commission_records').select('*');

  if (filters?.userId && !filters?.isAdmin) {
    query = query.eq('user_id', filters.userId);
  }
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`获取提成记录失败: ${error.message}`);
  return data || [];
}

export async function dbCreateCommissionRecord(recordData: Record<string, any>): Promise<any> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('commission_records')
    .insert(recordData)
    .select()
    .single();
  if (error) throw new Error(`创建提成记录失败: ${error.message}`);
  return data;
}

export async function dbUpdateCommissionRecord(id: string, updates: Record<string, any>): Promise<any | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('commission_records')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`更新提成记录失败: ${error.message}`);
  return data;
}

export async function dbDeleteCommissionRecord(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from('commission_records').delete().eq('id', id);
  if (error) throw new Error(`删除提成记录失败: ${error.message}`);
  return true;
}

// ==================== Todo 操作 ====================

export async function dbGetTodos(filters?: {
  userId?: string;
  completed?: boolean;
  customerId?: string;
}): Promise<any[]> {
  const client = getSupabaseClient();
  let query = client.from('todos').select('*');

  if (filters?.userId) {
    query = query.eq('user_id', filters.userId);
  }
  if (filters?.completed !== undefined) {
    query = query.eq('completed', filters.completed);
  }
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }
  query = query.order('due_date', { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`获取待办失败: ${error.message}`);
  return data || [];
}

export async function dbCreateTodo(todoData: Record<string, any>): Promise<any> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('todos')
    .insert(todoData)
    .select()
    .single();
  if (error) throw new Error(`创建待办失败: ${error.message}`);
  return data;
}

export async function dbUpdateTodo(id: string, updates: Record<string, any>): Promise<any | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('todos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`更新待办失败: ${error.message}`);
  return data;
}

export async function dbDeleteTodo(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from('todos').delete().eq('id', id);
  if (error) throw new Error(`删除待办失败: ${error.message}`);
  return true;
}

// ==================== 用户 Profile 操作 ====================

export async function dbGetUserProfile(userId: string): Promise<any | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`获取用户资料失败: ${error.message}`);
  return data;
}

export async function dbUpsertUserProfile(userId: string, profileData: Record<string, any>): Promise<any> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('user_profiles')
    .upsert({
      id: userId,
      user_id: userId,
      ...profileData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(`更新用户资料失败: ${error.message}`);
  return data;
}
