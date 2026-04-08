// 共享的用户内存存储模块
// 确保所有 API 路由使用同一个存储

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

// 服务端内存存储 - 单例模式
class UsersMemoryStorage {
  private static instance: UsersMemoryStorage;
  private users: User[];

  private constructor() {
    // 初始化默认管理员用户
    this.users = [
      {
        id: 'admin_default',
        username: 'admin',
        email: 'admin@company.com',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        password_hash: hashPassword('admin123'),
      }
    ];
  }

  public static getInstance(): UsersMemoryStorage {
    if (!UsersMemoryStorage.instance) {
      UsersMemoryStorage.instance = new UsersMemoryStorage();
    }
    return UsersMemoryStorage.instance;
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
    return this.users.length < initialLength;
  }
}

// 导出单例实例
export const usersMemoryStorage = UsersMemoryStorage.getInstance();
