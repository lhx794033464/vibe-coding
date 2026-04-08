// 共享的用户内存存储模块 - 带文件持久化
// 确保所有 API 路由使用同一个存储，并且数据持久化

import * as fs from 'fs';
import * as path from 'path';

// 用户接口
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  password_hash?: string;
}

// 生成唯一ID
export const generateId = () => 
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// 简单密码哈希
export const hashPassword = (password: string): string => {
  return btoa(password);
};

// 数据文件路径 - 使用 /tmp 目录确保可写
const isServer = typeof window === 'undefined';
const DATA_DIR = isServer ? '/tmp' : path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');

// 默认管理员用户
const defaultAdmin: User = {
  id: 'admin_default',
  username: 'admin',
  email: 'admin@company.com',
  role: 'admin',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  password_hash: hashPassword('admin123'),
};

// 服务端内存存储 - 单例模式
class UsersMemoryStorage {
  private static instance: UsersMemoryStorage;
  private users: User[];

  private constructor() {
    // 初始化时从文件加载数据
    this.users = this.loadFromFile();
  }

  public static getInstance(): UsersMemoryStorage {
    if (!UsersMemoryStorage.instance) {
      UsersMemoryStorage.instance = new UsersMemoryStorage();
    }
    return UsersMemoryStorage.instance;
  }

  // 从文件加载数据
  private loadFromFile(): User[] {
    if (!isServer) {
      return [defaultAdmin];
    }

    try {
      // 确保数据目录存在
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        const users = JSON.parse(data);
        console.log('从文件加载用户数据:', users.length, '个用户');
        return users;
      } else {
        // 文件不存在，初始化默认数据
        console.log('用户数据文件不存在，初始化默认数据');
        const initialUsers = [defaultAdmin];
        this.saveToFile(initialUsers);
        return initialUsers;
      }
    } catch (error) {
      console.error('加载用户数据失败，使用默认数据:', error);
      return [defaultAdmin];
    }
  }

  // 保存数据到文件
  private saveToFile(users: User[]): void {
    if (!isServer) return;

    try {
      // 确保数据目录存在
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf-8');
      console.log('用户数据已保存到文件:', DATA_FILE);
    } catch (error) {
      console.error('保存用户数据失败:', error);
    }
  }

  // 获取所有用户
  getAll(): User[] {
    return [...this.users];
  }

  // 根据ID获取用户
  getById(id: string): User | null {
    return this.users.find(u => u.id === id) || null;
  }

  // 根据用户名获取用户
  getByUsername(username: string): User | null {
    return this.users.find(u => u.username === username) || null;
  }

  // 创建用户
  create(data: {
    username: string;
    email: string;
    role: 'admin' | 'user';
    is_active: boolean;
    password?: string;
  }): User {
    const newUser: User = {
      id: generateId(),
      username: data.username,
      email: data.email,
      role: data.role,
      is_active: data.is_active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (data.password) {
      newUser.password_hash = hashPassword(data.password);
    } else {
      // 默认密码
      newUser.password_hash = hashPassword('123456');
    }

    this.users.push(newUser);
    this.saveToFile(this.users);
    return newUser;
  }

  // 更新用户
  update(id: string, data: Partial<{
    username: string;
    email: string;
    role: 'admin' | 'user';
    is_active: boolean;
    password?: string;
  }>): User | null {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return null;

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.username !== undefined) updateData.username = data.username;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.password) updateData.password_hash = hashPassword(data.password);

    this.users[index] = {
      ...this.users[index],
      ...updateData,
    };

    this.saveToFile(this.users);
    return this.users[index];
  }

  // 删除用户
  delete(id: string): boolean {
    // 不允许删除最后一个管理员
    const user = this.users.find(u => u.id === id);
    if (!user) return false;

    if (user.role === 'admin') {
      const activeAdmins = this.users.filter(u => u.role === 'admin' && u.is_active);
      if (activeAdmins.length <= 1) {
        return false;
      }
    }

    const initialLength = this.users.length;
    this.users = this.users.filter(u => u.id !== id);
    
    if (this.users.length < initialLength) {
      this.saveToFile(this.users);
      return true;
    }
    return false;
  }
}

// 导出单例实例
export const usersMemoryStorage = UsersMemoryStorage.getInstance();
