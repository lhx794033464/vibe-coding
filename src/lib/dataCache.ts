/**
 * 全局数据缓存层
 *
 * 解决的问题：
 * 1. 切换页面时重复请求相同 API（如 /api/customers 在日程页、客户页、工作台都会请求）
 * 2. 后台切回前台时全量刷新，导致长时间转圈
 * 3. 初次加载多个页面串行请求
 *
 * 策略：
 * - 内存缓存 + 过期时间，同一会话内页面切换直接复用
 * - 后台切回前台时，先展示缓存数据，后台静默刷新
 * - 支持 stale-while-revalidate：缓存未过期直接用；过期了先用旧数据，同时刷新
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  promise: Promise<T> | null; // 防止同一时刻重复请求（请求去重）
}

const cache = new Map<string, CacheEntry<unknown>>();

// 各 API 的缓存时间配置（毫秒）
const TTL_CONFIG: Record<string, number> = {
  '/api/customers': 2 * 60 * 1000,       // 客户列表：2分钟
  '/api/dashboard': 3 * 60 * 1000,       // 看板数据：3分钟
  '/api/holidays': 30 * 60 * 1000,       // 假日数据：30分钟
  '/api/reminders': 1 * 60 * 1000,       // 提醒：1分钟
  '/api/schedule': 2 * 60 * 1000,        // 日程：2分钟
  '/api/commissions': 5 * 60 * 1000,     // 提成：5分钟
  '/api/users': 5 * 60 * 1000,           // 用户管理：5分钟
  '/api/process-applications': 2 * 60 * 1000, // 流程申请：2分钟
  '/api/follow-ups': 2 * 60 * 1000,      // 跟进记录：2分钟
  '/api/implementation-logs': 2 * 60 * 1000, // 实施日志：2分钟
  '/api/acceptance-doc': 5 * 60 * 1000,  // 验收单：5分钟
  '/api/todos': 1 * 60 * 1000,           // 待办：1分钟
};

const DEFAULT_TTL = 2 * 60 * 1000; // 默认2分钟

function getTTL(url: string): number {
  // 匹配最长的前缀
  let bestMatch = '';
  for (const key of Object.keys(TTL_CONFIG)) {
    if (url.startsWith(key) && key.length > bestMatch.length) {
      bestMatch = key;
    }
  }
  return bestMatch ? TTL_CONFIG[bestMatch] : DEFAULT_TTL;
}

function isExpired(entry: CacheEntry<unknown>, ttl: number): boolean {
  return Date.now() - entry.timestamp > ttl;
}

/**
 * 带缓存的数据请求
 *
 * @param url API 地址（含查询参数）
 * @param options fetch 选项
 * @param forceRefresh 强制刷新（忽略缓存）
 * @returns 响应数据
 */
export async function cachedFetch<T = unknown>(
  url: string,
  options?: RequestInit,
  forceRefresh = false
): Promise<T> {
  const ttl = getTTL(url);

  // 1. 检查内存缓存
  if (!forceRefresh) {
    const entry = cache.get(url);
    if (entry) {
      // 未过期：直接返回
      if (!isExpired(entry, ttl)) {
        return entry.data as T;
      }
      // 已过期但有数据：如果已有正在进行的刷新请求，等它完成
      if (entry.promise) {
        return entry.promise as Promise<T>;
      }
      // 已过期，需要刷新（但先返回旧数据让页面有东西可展示）
    }
  }

  // 2. 发起网络请求
  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      // 写入缓存
      cache.set(url, {
        data,
        timestamp: Date.now(),
        promise: null,
      });

      return data as T;
    } catch (error) {
      // 请求失败，清除 promise 标记
      const entry = cache.get(url);
      if (entry) {
        entry.promise = null;
      }
      throw error;
    }
  })();

  // 标记正在请求中（去重）
  const entry = cache.get(url);
  if (entry) {
    entry.promise = fetchPromise;
  } else {
    cache.set(url, {
      data: null,
      timestamp: 0,
      promise: fetchPromise,
    });
  }

  return fetchPromise;
}

/**
 * stale-while-revalidate 策略
 *
 * 先返回缓存数据（即使过期），同时后台静默刷新
 * 适用于：页面初始化、后台切回前台等场景
 *
 * @param url API 地址
 * @param options fetch 选项
 * @param onRefreshed 刷新完成后的回调（用于更新页面数据）
 * @returns 缓存数据或新请求的数据
 */
export async function staleWhileRevalidate<T = unknown>(
  url: string,
  options: RequestInit | undefined,
  onRefreshed?: (data: T) => void
): Promise<{ data: T | null; fromCache: boolean }> {
  const ttl = getTTL(url);
  const entry = cache.get(url);

  // 有缓存且未过期：直接用
  if (entry && entry.data !== null && !isExpired(entry, ttl)) {
    return { data: entry.data as T, fromCache: true };
  }

  // 有缓存但已过期：先返回旧数据，后台刷新
  if (entry && entry.data !== null) {
    // 如果已有正在进行的刷新，等它
    if (entry.promise) {
      try {
        const freshData = await entry.promise as T;
        onRefreshed?.(freshData);
        return { data: freshData, fromCache: false };
      } catch {
        return { data: entry.data as T, fromCache: true };
      }
    }

    // 后台静默刷新
    const fetchPromise = (async () => {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        cache.set(url, { data, timestamp: Date.now(), promise: null });
        onRefreshed?.(data as T);
        return data;
      } catch (error) {
        const e = cache.get(url);
        if (e) e.promise = null;
        throw error;
      }
    })();

    entry.promise = fetchPromise;

    // 立即返回旧数据
    return { data: entry.data as T, fromCache: true };
  }

  // 无缓存：必须等待网络请求
  const data = await cachedFetch<T>(url, options);
  return { data, fromCache: false };
}

/**
 * 使指定 URL 的缓存失效
 */
export function invalidateCache(urlPattern: string | RegExp): void {
  if (typeof urlPattern === 'string') {
    // 精确匹配或前缀匹配
    for (const key of cache.keys()) {
      if (key === urlPattern || key.startsWith(urlPattern)) {
        cache.delete(key);
      }
    }
  } else {
    for (const key of cache.keys()) {
      if (urlPattern.test(key)) {
        cache.delete(key);
      }
    }
  }
}

/**
 * 清空所有缓存（登出时调用）
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * 标记所有缓存为过期（不删除数据，下次访问时后台刷新）
 * 用于后台切回前台时：页面立即展示旧数据，同时静默刷新
 */
export function markStale(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    // 将时间戳设为很久以前，使缓存"过期"但数据仍在
    cache.set(key, { ...entry, timestamp: 0 });
  }
}

/**
 * 预热缓存：提前请求即将用到的 API
 * 用于登录后、首页加载时提前拉取数据
 */
export async function prefetch(urls: string[], authHeader: Record<string, string>): Promise<void> {
  const promises = urls.map(url => {
    const entry = cache.get(url);
    const ttl = getTTL(url);
    // 只预请求没有缓存或已过期的
    if (!entry || isExpired(entry, ttl)) {
      return cachedFetch(url, { headers: authHeader }).catch(() => {
        // 预请求失败不影响主流程
      });
    }
    return Promise.resolve();
  });
  await Promise.allSettled(promises);
}

/**
 * 简化版缓存请求：传入 URL + authHeader + 自定义TTL
 * 用于各页面组件快速接入缓存
 */
export async function fetchWithCache(
  url: string,
  authHeader: Record<string, string>,
  ttlMs?: number
): Promise<any> {
  const ttl = ttlMs || getTTL(url);
  const entry = cache.get(url);

  // 未过期：直接返回缓存
  if (entry && Date.now() - entry.timestamp < ttl) {
    return entry.data;
  }

  // 有过期数据：先返回旧数据，后台静默刷新
  if (entry && entry.promise) {
    return entry.data;
  }

  // 发起请求
  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, { headers: authHeader });
      const data = await response.json();
      cache.set(url, { data, timestamp: Date.now(), promise: null });
      return data;
    } catch (error) {
      cache.set(url, { ...(entry || { data: null, timestamp: 0 }), promise: null });
      throw error;
    }
  })();

  // 如果有过期数据，立即返回旧数据，后台刷新
  if (entry) {
    cache.set(url, { ...entry, promise: fetchPromise });
    // 后台刷新，不阻塞
    fetchPromise.catch(() => {});
    return entry.data;
  }

  // 没有缓存，必须等请求完成
  const data = await fetchPromise;
  return data;
}
