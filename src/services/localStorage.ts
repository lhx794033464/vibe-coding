/**
 * 本地存储服务
 * 替代 Supabase，所有数据存储在浏览器 localStorage 中
 */

const STORAGE_KEYS = {
  CUSTOMERS: 'customers',
  FOLLOW_UPS: 'follow_ups',
  IMPLEMENTATION_LOGS: 'implementation_logs',
  COMMISSIONS: 'commissions',
  SCHEDULES: 'schedules',
  TODOS: 'todos',
  USER_PROFILES: 'user_profiles',
} as const;

// 生成唯一ID
type IdGenerator = () => string;
export const generateId: IdGenerator = () => 
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// 获取当前用户ID
const getUserId = (): string => {
  if (typeof window === 'undefined') return 'server';
  return localStorage.getItem('local_user_id') || 'local_default';
};

// 通用 CRUD 操作
class LocalStorageService<T extends Record<string, any>> {
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  // 获取所有数据（带用户过滤）
  getAll(): T[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(`${this.key}_${getUserId()}`);
    return data ? JSON.parse(data) : [];
  }

  // 根据ID获取
  getById(id: string): T | null {
    const items = this.getAll();
    return items.find(item => item.id === id) || null;
  }

  // 创建
  create(data: Omit<T, 'id' | 'user_id' | 'created_at' | 'updated_at'>): T {
    const items = this.getAll();
    const newItem = {
      ...data,
      id: generateId(),
      user_id: getUserId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as T;
    
    items.push(newItem);
    localStorage.setItem(`${this.key}_${getUserId()}`, JSON.stringify(items));
    return newItem;
  }

  // 更新
  update(id: string, data: Partial<T>): T | null {
    const items = this.getAll();
    const index = items.findIndex(item => item.id === id);
    
    if (index === -1) return null;
    
    items[index] = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    localStorage.setItem(`${this.key}_${getUserId()}`, JSON.stringify(items));
    return items[index];
  }

  // 删除
  delete(id: string): boolean {
    const items = this.getAll();
    const filtered = items.filter(item => item.id !== id);
    
    if (filtered.length === items.length) return false;
    
    localStorage.setItem(`${this.key}_${getUserId()}`, JSON.stringify(filtered));
    return true;
  }

  // 批量导入
  import(items: T[]): void {
    localStorage.setItem(`${this.key}_${getUserId()}`, JSON.stringify(items));
  }

  // 清空
  clear(): void {
    localStorage.removeItem(`${this.key}_${getUserId()}`);
  }
}

// 导出各数据表的存储服务
export const customersStorage = new LocalStorageService('customers');
export const followUpsStorage = new LocalStorageService('follow_ups');
export const implementationLogsStorage = new LocalStorageService('implementation_logs');
export const commissionsStorage = new LocalStorageService('commissions');
export const schedulesStorage = new LocalStorageService('schedules');
export const todosStorage = new LocalStorageService('todos');
export const userProfilesStorage = new LocalStorageService('user_profiles');

// 导出类型
export type { LocalStorageService };
