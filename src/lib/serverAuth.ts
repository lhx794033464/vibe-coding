// 服务端认证辅助模块
// 用于在API路由中获取当前登录用户

import { NextRequest } from 'next/server';
import { usersMemoryStorage } from './usersMemoryStorage';
import { customersStorage } from './serverStorage';

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

/**
 * 获取当前用户可见的客户ID列表
 * 管理员: 返回所有客户ID (null表示不过滤)
 * 普通用户: 返回delivery_consultant等于自己用户名的客户ID列表
 */
export async function getVisibleCustomerIds(request: NextRequest): Promise<string[] | null> {
  const userInfo = await getCurrentUserInfo(request);
  const userIsAdmin = await isAdmin(request);
  
  if (userIsAdmin) return null; // null表示不过滤，可见所有
  
  if (!userInfo) return []; // 未登录，不可见任何
  
  const customers = customersStorage.getAll();
  return (customers as any[])
    .filter(c => c.delivery_consultant === userInfo.username)
    .map(c => c.id);
}

/**
 * 过滤数据：根据客户ID列表过滤关联数据
 * @param data 原始数据数组
 * @param visibleIds 可见客户ID列表，null表示不过滤
 * @param customerIdField 客户ID字段名，默认'customer_id'
 */
export function filterByCustomerAccess<T extends Record<string, any>>(
  data: T[],
  visibleIds: string[] | null,
  customerIdField: string = 'customer_id'
): T[] {
  if (visibleIds === null) return data; // 管理员不过滤
  if (visibleIds.length === 0) return []; // 无权限
  return data.filter(item => {
    const cid = item[customerIdField];
    return cid && visibleIds.includes(cid);
  });
}
