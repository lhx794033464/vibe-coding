import { createBrowserClient } from '@supabase/ssr';

let cachedClient: ReturnType<typeof createBrowserClient> | null = null;
let cachedConfig: { url: string; key: string } | null = null;

// 从 API 获取配置
async function getConfig() {
  if (cachedConfig) return cachedConfig;
  
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      const data = await response.json();
      cachedConfig = { url: data.supabaseUrl, key: data.supabaseAnonKey };
      return cachedConfig;
    }
  } catch (error) {
    console.error('获取 Supabase 配置失败:', error);
  }
  
  return null;
}

// 同步获取客户端（用于已有缓存的场景）
export function getClient() {
  if (cachedClient && cachedConfig) {
    return cachedClient;
  }
  return null;
}

// 初始化客户端
export async function initClient() {
  const config = await getConfig();
  if (!config) {
    throw new Error('无法获取 Supabase 配置');
  }
  
  cachedClient = createBrowserClient(config.url, config.key);
  return cachedClient;
}

// 创建客户端（兼容旧代码）
export function createClient() {
  // 如果已有缓存，直接返回
  if (cachedClient && cachedConfig) {
    return cachedClient;
  }
  
  // 尝试从环境变量获取（服务端渲染时）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || '';
  
  if (supabaseUrl && supabaseAnonKey) {
    cachedConfig = { url: supabaseUrl, key: supabaseAnonKey };
    cachedClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
    return cachedClient;
  }
  
  // 客户端渲染时，抛出错误提示需要先初始化
  throw new Error('Supabase 客户端未初始化，请确保在组件挂载后调用');
}
