// 服务端认证辅助模块
// 用于在API路由中获取当前登录用户

import { NextRequest } from 'next/server';
import { usersMemoryStorage } from './usersMemoryStorage';

// 从请求中获取当前用户ID
export async function getCurrentUserId(request: NextRequest): Promise<string | null> {
  const userInfo = await getCurrentUserInfo(request);
  return userInfo?.id || null;
}

// 从请求中获取当前用户信息（包含username和role）
export async function getCurrentUserInfo(request: NextRequest): Promise<{ id: string; username: string; role: string } | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    
    // 尝试Base64解码（新格式），如果失败则使用原始格式（兼容旧token）
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

// 从请求中获取当前用户
export async function getCurrentUser(request: NextRequest) {
  const userId = await getCurrentUserId(request);
  if (!userId) return null;
  
  return usersMemoryStorage.getById(userId);
}

// 检查是否是管理员
export async function isAdmin(request: NextRequest): Promise<boolean> {
  const userInfo = await getCurrentUserInfo(request);
  return userInfo?.role === 'admin';
}
