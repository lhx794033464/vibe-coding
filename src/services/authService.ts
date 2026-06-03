/**
 * 用户和认证服务
 * - 客户端会话管理使用 LocalStorage
 * - 用户数据操作通过 API 路由使用 Supabase
 * 支持用户管理、登录认证、权限控制
 */

// 直接定义用户接口
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  role_type: '交付顾问' | '答疑顾问';
  employment_status: '在职' | '离职';
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  created_by?: string;
}

const STORAGE_KEYS = {
  AUTH: 'app_auth',
} as const;

// 生成唯一ID（使用加密安全随机数）
export const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 降级方案
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// 客户端不再进行密码哈希验证，全部由后端 API 处理

// ================= 用户存储服务 - 通过 API 操作
class UsersService {
  // 获取所有用户
  async getAll(): Promise<User[]> {
    const response = await fetch('/api/users');
    const result = await response.json();
    return result.data || [];
  }

  async getById(id: string): Promise<User | null> {
    const response = await fetch(`/api/users/${id}`);
    const result = await response.json();
    return result.data || null;
  }

  async getByUsername(username: string): Promise<User | null> {
    const users = await this.getAll();
    return users.find(u => u.username === username) || null;
  }

  async create(data: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password?: string }): Promise<User> {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || '创建用户失败');
    }
    return result.data;
  }

  async update(id: string, data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>> & { password?: string }): Promise<User | null> {
    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    return result.data || null;
  }

  async delete(id: string): Promise<boolean> {
    const response = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
    });
    return response.ok;
  }
}

export const usersService = new UsersService();

// ================= 认证会话接口
interface AuthSession {
  user_id: string;
  username: string;
  role: 'admin' | 'user';
  token: string;
  expires_at: string;
}

// ================= 认证服务 - 客户端使用 LocalStorage
class AuthService {
  private key = STORAGE_KEYS.AUTH;

  private isServer(): boolean {
    return typeof window === 'undefined';
  }

  private getSession(): AuthSession | null {
    if (this.isServer()) {
      return null;
    }
    const data = localStorage.getItem(this.key);
    if (!data) return null;
    
    try {
      const session: AuthSession = JSON.parse(data);
      
      // 检查是否过期
      if (new Date(session.expires_at) < new Date()) {
        localStorage.removeItem(this.key);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  private setSession(session: AuthSession): void {
    if (!this.isServer()) {
      localStorage.setItem(this.key, JSON.stringify(session));
    }
  }

  private removeSession(): void {
    if (!this.isServer()) {
      localStorage.removeItem(this.key);
    }
  }

  // 验证账号密码 - 通过后端 API 验证
  async authenticate(username: string, password: string): Promise<AuthSession | null> {
    // 始终通过后端 API 认证，不在客户端做密码验证
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      if (!data.user || !data.token) return null;
      
      const session: AuthSession = {
        user_id: data.user.id,
        username: data.user.username,
        role: data.user.role,
        token: data.token,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      
      this.setSession(session);
      return session;
    } catch (error) {
      console.error('登录失败:', error);
      return null;
    }
  }

  // 获取当前登录用户
  async getCurrentUser(): Promise<User | null> {
    const session = this.getSession();
    if (!session) return null;
    return await usersService.getById(session.user_id);
  }

  // 登出
  logout(): void {
    this.removeSession();
  }

  // 检查是否是管理员
  isAdmin(): boolean {
    const session = this.getSession();
    return session?.role === 'admin';
  }

  // 检查是否已登录
  isAuthenticated(): boolean {
    return this.getSession() !== null;
  }

  // 获取Authorization header
  getAuthHeader(): { [key: string]: string } {
    const session = this.getSession();
    if (session) {
      return {
        'Authorization': `Bearer ${session.token}`,
      };
    }
    return {};
  }

  // 获取当前用户ID
  getCurrentUserId(): string | null {
    const session = this.getSession();
    return session?.user_id || null;
  }
}

export const authService = new AuthService();

// 便捷函数：获取认证header
export function getAuthHeader(): Record<string, string> {
  return authService.getAuthHeader();
}
