// 用户存储模块 - 使用文件持久化存储
// 目前使用文件存储确保功能稳定，后续可切换到 Supabase PostgreSQL

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

// 用户存储类
class UsersMemoryStorage {
  private static instance: UsersMemoryStorage;

  private constructor() {
    console.log('初始化文件用户存储');
    this.ensureFileExists();
  }

  public static getInstance(): UsersMemoryStorage {
    if (!UsersMemoryStorage.instance) {
      UsersMemoryStorage.instance = new UsersMemoryStorage();
    }
    return UsersMemoryStorage.instance;
  }

  // 确保数据文件存在
  private ensureFileExists(): void {
    if (!isServer) return;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (!fs.existsSync(DATA_FILE)) {
        console.log('用户数据文件不存在，初始化默认数据');
        const initialUsers = [defaultAdmin];
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialUsers, null, 2), 'utf-8');
        console.log('已创建默认用户数据文件');
      }
    } catch (error) {
      console.error('初始化用户数据文件失败:', error);
    }
  }

  // 从文件加载数据
  private loadFromFile(): User[] {
    if (!isServer) {
      return [defaultAdmin];
    }

    try {
      if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        const users = JSON.parse(data);
        console.log('从文件加载用户数据:', users.length, '个用户');
        return users;
      }
      return [defaultAdmin];
    } catch (error) {
      console.error('加载用户数据失败，使用默认数据:', error);
      return [defaultAdmin];
    }
  }

  // 保存数据到文件
  private saveToFile(users: User[]): void {
    if (!isServer) return;

    try {
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
    return [...this.loadFromFile()];
  }

  // 根据ID获取用户
  getById(id: string): User | null {
    const users = this.loadFromFile();
    return users.find(u => u.id === id) || null;
  }

  // 根据用户名获取用户
  getByUsername(username: string): User | null {
    const users = this.loadFromFile();
    return users.find(u => u.username === username) || null;
  }

  // 创建用户
  create(data: {
    username: string;
    email: string;
    role: 'admin' | 'user';
    is_active: boolean;
    password?: string;
  }): User {
    const users = this.loadFromFile();
    
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
      (newUser as any).password_hash = hashPassword(data.password);
    } else {
      (newUser as any).password_hash = hashPassword('123456');
    }

    users.push(newUser);
    this.saveToFile(users);
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
    const users = this.loadFromFile();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.username !== undefined) updateData.username = data.username;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.password) updateData.password_hash = hashPassword(data.password);

    users[index] = {
      ...users[index],
      ...updateData,
    };

    this.saveToFile(users);
    return users[index];
  }

  // 删除用户
  delete(id: string): boolean {
    const users = this.loadFromFile();
    
    const user = users.find(u => u.id === id);
    if (!user) return false;

    if (user.role === 'admin') {
      const activeAdmins = users.filter(u => u.role === 'admin' && u.is_active);
      if (activeAdmins.length <= 1) {
        return false;
      }
    }

    const initialLength = users.length;
    const filteredUsers = users.filter(u => u.id !== id);
    
    if (filteredUsers.length < initialLength) {
      this.saveToFile(filteredUsers);
      return true;
    }
    return false;
  }
}

// 导出单例实例
export const usersMemoryStorage = UsersMemoryStorage.getInstance();
