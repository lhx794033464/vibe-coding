// 服务端认证辅助模块
// 用于在API路由中获取当前登录用户

import { NextRequest } from 'next/server';
import { usersMemoryStorage } from './usersMemoryStorage';

// 从请求中获取当前用户ID
export async function getCurrentUserId(request: NextRequest): Promise<string | null> {
  try {
    // 从Authorization header中获取token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    
    // 注意：这里简化处理，实际应该验证token
    // 我们假设token格式是：user_id:username:role:random_string
    const parts = token.split(':');
    if (parts.length >= 1) {
      return parts[0];
    }
    
    return null;
  } catch (error) {
    console.error('获取当前用户失败:', error);
    return null;
  }
}

// 从请求中获取当前用户
export async function getCurrentUser(request: NextRequest) {
  const userId = await getCurrentUserId(request);
  if (!userId) return null;
  
  return usersMemoryStorage.getById(userId);
}

// 检查是否是管理员
export async function isAdmin(request: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(request);
  return user?.role === 'admin';
}

// 从cookie或其他方式获取会话（备用方案）
export function getSessionFromRequest(request: NextRequest) {
  // 这里可以扩展支持从cookie获取会话
  return null;
}
