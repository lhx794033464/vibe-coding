import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient, getSupabaseCredentials } from './supabase-client';

// 游客用户ID
export const GUEST_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * 获取 Supabase 客户端（支持游客模式）
 * @param token - 访问令牌或 'guest'
 * @returns Supabase 客户端
 */
export function getClient(token?: string): SupabaseClient {
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

/**
 * 获取用户ID（支持游客模式）
 * @param token - 访问令牌或 'guest'
 * @returns 用户ID或null
 */
export async function getUserId(token?: string): Promise<string | null> {
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

/**
 * 验证请求是否已授权（支持游客模式）
 * @param authHeader - Authorization 请求头
 * @returns 包含 token 和 userId 的对象，如果未授权则返回 null
 */
export async function authenticateRequest(authHeader: string | null): Promise<{ token: string; userId: string } | null> {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return null;
  }
  
  const userId = await getUserId(token);
  if (!userId) {
    return null;
  }
  
  return { token, userId };
}
