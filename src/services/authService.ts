/**
 * 用户和认证服务
 * 支持用户管理、登录认证、权限控制
 */

// 服务端内存存储
const serverMemoryStorage: Record<string, string> = {};

const isServer = () => typeof window === 'undefined';

const getItem = (key: string): string | null => {
  if (isServer()) {
    return serverMemoryStorage[key] || null;
  }
  return localStorage.getItem(key);
};

const setItem = (key: string, value: string): void => {
  if (isServer()) {
    serverMemoryStorage[key] = value;
  } else {
    localStorage.setItem(key, value);
  }
};

const removeItem = (key: string): void => {
  if (isServer()) {
    delete serverMemoryStorage[key];
  } else {
    localStorage.removeItem(key);
  }
};

const STORAGE_KEYS = {
  USERS: 'app_users',
  AUTH: 'app_auth',
} as const;

// 生成唯一ID
export const generateId = () => 
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// ================= 用户类型定义
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// ================= 用户存储服务
class UsersService {
  private key = STORAGE_KEYS.USERS;

  // 获取所有用户
  getAll(): User[] {
    const data = getItem(this.key);
    if (!data) {
      const initUsers: User[] = [];
      const adminUser: User = {
        id: generateId(),
        username: 'admin',
        email: 'admin@company.com',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      initUsers.push(adminUser);
      setItem(this.key, JSON.stringify(initUsers));
      return initUsers;
    }
    return JSON.parse(data);
  }

  getById(id: string): User | null {
    return this.getAll().find(u => u.id === id) || null;
  }

  getByUsername(username: string): User | null {
    return this.getAll().find(u => u.username === username) || null;
  }

  create(data: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const users = this.getAll();
    const newUser: User = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    users.push(newUser);
    setItem(this.key, JSON.stringify(users));
    return newUser;
  }

  update(id: string, data: Partial<User>): User | null {
    const users = this.getAll();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    users[index] = {
      ...users[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    setItem(this.key, JSON.stringify(users));
    return users[index];
  }

  delete(id: string): boolean {
    const users = this.getAll();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return false;
    // 不允许删除最后一个管理员
    const user = users[index];
    const adminCount = users.filter(u => u.role === 'admin' && u.is_active).length;
    if (user.role === 'admin' && adminCount <= 1) {
      return false;
    }
    users.splice(index, 1);
    setItem(this.key, JSON.stringify(users));
    return true;
  }
}

export const usersService = new UsersService();

// ================= 认证服务
interface AuthSession {
  user_id: string;
  username: string;
  role: 'admin' | 'user';
  token: string;
  expires_at: string;
}

class AuthService {
  private key = STORAGE_KEYS.AUTH;

  // 验证账号密码
  authenticate(username: string, password: string): AuthSession | null {
    const users = usersService.getAll();
    const user = users.find(u => u.username === username && u.is_active);
    
    if (!user) {
      return null;
    }
    
    // 验证密码
    let isValid = false;
    if (user.username === 'admin' && password === 'admin123') {
      isValid = true;
    } else if (user.username !== 'admin') {
      // 普通用户密码暂时不验证（接受任意密码）
      isValid = true;
    }
    
    if (!isValid) {
      return null;
    }
    
    const session: AuthSession = {
      user_id: user.id,
      username: user.username,
      role: user.role,
      token: generateId(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    
    setItem(this.key, JSON.stringify(session));
    return session;
  }

  // 获取当前登录用户
  getCurrentUser(): User | null {
    const data = getItem(this.key);
    if (!data) return null;
    const session: AuthSession = JSON.parse(data);
    
    // 检查是否过期
    if (new Date(session.expires_at) < new Date()) {
      removeItem(this.key);
      return null;
    }
    
    // 从用户列表中获取完整用户信息
    const users = usersService.getAll();
    return users.find(u => u.id === session.user_id) || null;
  }

  // 登出
  logout(): void {
    removeItem(this.key);
  }

  // 检查是否是管理员
  isAdmin(): boolean {
    const session = this.getCurrentUser();
    return session?.role === 'admin';
  }

  // 检查是否已登录
  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  }
}

export const authService = new AuthService();
