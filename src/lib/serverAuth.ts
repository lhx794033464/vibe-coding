// 服务端认证辅助模块
// 用于在API路由中获取当前登录用户
// Token格式: Base64(user_id:username:role:random_string)

import { NextRequest } from 'next/server';

// 从请求中获取当前用户ID
export async function getCurrentUserId(request: NextRequest): Promise<string | null> {
  const userInfo = await getCurrentUserInfo(request);
  return userInfo?.id || null;
}

// 从请求中获取认证 Token（优先从 Authorization header，其次从 cookie）
function getAuthToken(request: NextRequest): string | null {
  // 优先从 Authorization header 获取
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 其次从 cookie 获取
  const cookieToken = request.cookies.get('auth_token')?.value;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

// 从请求中获取当前用户信息（包含username和role）
export async function getCurrentUserInfo(request: NextRequest): Promise<{ id: string; username: string; role: string } | null> {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return null;
    }

    // 尝试Base64解码
    let decoded: string;
    try {
      decoded = Buffer.from(token, 'base64').toString('utf-8');
    } catch {
      decoded = token;
    }

    // Token格式: user_id:username:role:random_string
    const parts = decoded.split(':');
    if (parts.length >= 3) {
      return {
        id: parts[0],
        username: parts[1],
        role: parts[2],
      };
    }

    return null;
  } catch (error) {
    console.error('获取当前用户信息失败:', error);
    return null;
  }
}

// 检查是否是管理员
export async function isAdmin(request: NextRequest): Promise<boolean> {
  const userInfo = await getCurrentUserInfo(request);
  return userInfo?.role === 'admin';
}

/**
 * 获取数据隔离过滤条件
 * 管理员: 返回 null（不过滤）
 * 普通用户: 返回 { userId, isAdmin: false }
 */
export async function getDataAccessFilter(request: NextRequest): Promise<{
  userId: string;
  isAdmin: boolean;
} | null> {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) return null;

  const userIsAdmin = userInfo.role === 'admin';
  return {
    userId: userInfo.id,
    isAdmin: userIsAdmin,
  };
}
