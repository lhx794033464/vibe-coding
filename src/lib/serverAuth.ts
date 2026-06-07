import { verifyToken } from '@/services/dbService';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface UserInfo {
  id: string;
  username: string;
  role: string;
}

/**
 * 从请求中解析 JWT Token，获取当前用户信息
 * 支持 Authorization: Bearer <token> 和 x-session: <token> 两种格式
 */
export async function getCurrentUserInfo(request: Request): Promise<UserInfo | null> {
  try {
    // 尝试从 Authorization header 获取
    const authHeader = request.headers.get('Authorization');
    let token: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // 尝试从 x-session header 获取
    if (!token) {
      token = request.headers.get('x-session');
    }

    if (!token) {
      return null;
    }

    // 使用 JWT 验证
    const decoded = verifyToken(token);
    if (!decoded) {
      return null;
    }

    // 二次验证：确认用户在数据库中仍然有效
    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, role, is_active')
      .eq('id', decoded.id)
      .single();

    if (error || !user || !user.is_active) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  } catch (error) {
    console.error('[serverAuth] Token验证失败:', error);
    return null;
  }
}

/**
 * 检查请求是否来自管理员
 */
export async function isAdminRequest(request: Request): Promise<boolean> {
  const userInfo = await getCurrentUserInfo(request);
  return userInfo?.role === 'admin';
}
