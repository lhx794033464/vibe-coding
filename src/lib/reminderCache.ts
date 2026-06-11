/**
 * 提醒数据共享缓存
 * 避免侧边栏、首页、浮动导航同时请求 /api/reminders 造成重复请求
 */

interface ReminderCache {
  data: { todos: unknown[]; customers: unknown[] } | null;
  timestamp: number;
}

const CACHE_KEY = 'reminder_cache';
const CACHE_TTL = 30 * 1000; // 30秒内复用缓存

function getCache(): ReminderCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache: ReminderCache = JSON.parse(raw);
    if (Date.now() - cache.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

function setCache(data: { todos: unknown[]; customers: unknown[] }): void {
  try {
    const cache: ReminderCache = { data, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // sessionStorage 不可用时忽略
  }
}

/**
 * 获取提醒数据（带缓存）
 * 30秒内多次调用只发一次网络请求
 */
export async function fetchReminders(authHeader: Record<string, string>): Promise<{
  todos: unknown[];
  customers: unknown[];
} | null> {
  // 先检查缓存
  const cached = getCache();
  if (cached?.data) {
    return cached.data;
  }

  // 缓存未命中，发起请求
  try {
    const res = await fetch('/api/reminders', { headers: authHeader });
    if (!res.ok) return null;
    const data = await res.json();

    const result = {
      todos: data.todoReminders || data.todos || [],
      customers: data.deadlineReminders || data.customers || [],
    };

    // 写入缓存
    setCache(result);
    return result;
  } catch {
    return null;
  }
}

/**
 * 获取提醒总数（从缓存或请求）
 */
export async function getReminderCount(authHeader: Record<string, string>): Promise<number> {
  const data = await fetchReminders(authHeader);
  if (!data) return 0;
  return (data.todos?.length || 0) + (data.customers?.length || 0);
}
