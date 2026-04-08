// 通用服务器端文件存储模块
// 支持所有业务数据类型的持久化存储

import * as fs from 'fs';
import * as path from 'path';

// 数据目录 - 使用 /tmp 目录确保可写
const isServer = typeof window === 'undefined';
const DATA_DIR = isServer ? '/tmp' : path.join(process.cwd(), 'data');

// 生成唯一ID
export const generateId = () => 
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// 确保数据目录存在
const ensureDataDir = (): void => {
  if (!isServer) return;
  
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('创建数据目录失败:', error);
  }
};

// 获取数据文件路径
const getDataFilePath = (collection: string): string => {
  return path.join(DATA_DIR, `${collection}.json`);
};

// 通用存储类
export class ServerStorage<T extends Record<string, any>> {
  private collection: string;

  constructor(collection: string) {
    this.collection = collection;
    this.ensureFileExists();
  }

  // 确保数据文件存在
  private ensureFileExists(): void {
    if (!isServer) return;

    try {
      ensureDataDir();
      const filePath = getDataFilePath(this.collection);
      
      if (!fs.existsSync(filePath)) {
        console.log(`初始化数据文件: ${this.collection}`);
        fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf-8');
      }
    } catch (error) {
      console.error(`初始化数据文件失败 ${this.collection}:`, error);
    }
  }

  // 从文件加载数据
  private loadFromFile(): T[] {
    if (!isServer) {
      return [];
    }

    try {
      const filePath = getDataFilePath(this.collection);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const items = JSON.parse(data);
        return items;
      }
      return [];
    } catch (error) {
      console.error(`加载数据失败 ${this.collection}:`, error);
      return [];
    }
  }

  // 保存数据到文件
  private saveToFile(items: T[]): void {
    if (!isServer) return;

    try {
      ensureDataDir();
      const filePath = getDataFilePath(this.collection);
      fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
    } catch (error) {
      console.error(`保存数据失败 ${this.collection}:`, error);
    }
  }

  // 获取所有数据（管理员可以获取所有，普通用户只能获取自己的）
  getAll(userId?: string): T[] {
    const items = this.loadFromFile();
    if (!userId) {
      return [...items];
    }
    // 普通用户只能看到自己的数据
    return items.filter(item => (item as any).user_id === userId);
  }

  // 根据ID获取
  getById(id: string, userId?: string): T | null {
    const items = this.loadFromFile();
    const item = items.find(item => (item as any).id === id) || null;
    
    if (!item || !userId) {
      return item;
    }
    
    // 检查数据归属
    if ((item as any).user_id === userId) {
      return item;
    }
    return null;
  }

  // 根据条件查找
  find(predicate: (item: T) => boolean, userId?: string): T[] {
    const items = this.loadFromFile();
    let filtered = items.filter(predicate);
    
    if (userId) {
      filtered = filtered.filter(item => (item as any).user_id === userId);
    }
    
    return filtered;
  }

  // 创建
  create(data: Omit<T, 'id' | 'created_at' | 'updated_at'> & { user_id?: string }, userId?: string): T {
    const items = this.loadFromFile();
    const newItem = {
      ...data,
      id: generateId(),
      user_id: userId || (data as any).user_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as T;
    
    items.push(newItem);
    this.saveToFile(items);
    return newItem;
  }

  // 批量创建
  createMany(dataList: Array<Omit<T, 'id' | 'created_at' | 'updated_at'>>, userId?: string): T[] {
    const items = this.loadFromFile();
    const newItems: T[] = dataList.map(data => ({
      ...data,
      id: generateId(),
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as T));
    
    items.push(...newItems);
    this.saveToFile(items);
    return newItems;
  }

  // 更新
  update(id: string, data: Partial<T>, userId?: string): T | null {
    const items = this.loadFromFile();
    const index = items.findIndex(item => (item as any).id === id);
    
    if (index === -1) return null;
    
    // 检查数据归属
    if (userId && (items[index] as any).user_id !== userId) {
      return null;
    }
    
    items[index] = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    this.saveToFile(items);
    return items[index];
  }

  // 删除
  delete(id: string, userId?: string): boolean {
    const items = this.loadFromFile();
    const item = items.find(item => (item as any).id === id);
    
    if (!item) return false;
    
    // 检查数据归属
    if (userId && (item as any).user_id !== userId) {
      return false;
    }
    
    const initialLength = items.length;
    const filteredItems = items.filter(i => (i as any).id !== id);
    
    if (filteredItems.length < initialLength) {
      this.saveToFile(filteredItems);
      return true;
    }
    return false;
  }

  // 批量删除
  deleteMany(ids: string[], userId?: string): number {
    const items = this.loadFromFile();
    const initialLength = items.length;
    
    let filteredItems = items.filter(item => !ids.includes((item as any).id));
    
    if (userId) {
      filteredItems = filteredItems.filter(item => (item as any).user_id === userId);
    }
    
    const deletedCount = initialLength - filteredItems.length;
    if (deletedCount > 0) {
      this.saveToFile(filteredItems);
    }
    return deletedCount;
  }

  // 清空
  clear(): void {
    this.saveToFile([]);
  }

  // 批量导入（覆盖）
  import(items: T[]): void {
    this.saveToFile(items);
  }

  // 统计
  count(predicate?: (item: T) => boolean, userId?: string): number {
    let items = this.loadFromFile();
    if (userId) {
      items = items.filter(item => (item as any).user_id === userId);
    }
    if (predicate) {
      return items.filter(predicate).length;
    }
    return items.length;
  }
}

// 导出各数据集合的存储实例
export const customersStorage = new ServerStorage('customers');
export const followUpsStorage = new ServerStorage('follow_ups');
export const implementationLogsStorage = new ServerStorage('implementation_logs');
export const commissionsStorage = new ServerStorage('commissions');
export const schedulesStorage = new ServerStorage('schedules');
export const userProfilesStorage = new ServerStorage('user_profiles');
