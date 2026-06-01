import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { getSupabaseClient, getSupabaseServiceRoleKey } from '@/storage/database/supabase-client';

const CONFIG_FILE = path.join('/tmp', 'tencent_docs_config.json');
const CONFIG_KEY = 'tencent_docs_token';
const ENV_KEY = 'TENCENT_DOCS_TOKEN';

/**
 * 按优先级获取腾讯文档 Token：
 * 1. URL 参数 token
 * 2. 环境变量 TENCENT_DOCS_TOKEN
 * 3. 数据库 system_config 表
 * 4. /tmp 本地配置文件
 */
export async function getTencentDocsToken(request?: NextRequest): Promise<string> {
  const checkedSources: string[] = [];

  // 1. URL 参数
  if (request) {
    const urlToken = request.nextUrl.searchParams.get('token');
    if (urlToken) return urlToken;
    checkedSources.push('URL参数');
  } else {
    checkedSources.push('URL参数(无request)');
  }

  // 2. 环境变量（生产环境推荐方式）
  const envToken = process.env[ENV_KEY];
  if (envToken) return envToken;
  checkedSources.push(`环境变量${ENV_KEY}(未设置)`);

  // 3. 数据库 system_config
  try {
    const supabase = getSupabaseClient(getSupabaseServiceRoleKey());
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .single();
    if (!error && data?.value) {
      const token = typeof data.value === 'string' ? data.value : (data.value as { token?: string }).token;
      if (token) return token;
    }
    checkedSources.push('数据库system_config(无记录)');
  } catch (err) {
    checkedSources.push(`数据库(查询异常: ${err instanceof Error ? err.message : 'unknown'})`);
  }

  // 4. 本地配置文件（开发环境兼容）
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);
    if (config.token) return config.token;
    checkedSources.push('本地文件(无token)');
  } catch {
    checkedSources.push('本地文件(不存在)');
  }

  throw new Error(
    `未配置腾讯文档 Token。已检查来源: ${checkedSources.join(' → ')}。` +
    `请配置环境变量 ${ENV_KEY} 或通过 /api/tencent-docs/config 接口保存 Token`
  );
}

/**
 * 检查 Token 是否已配置（不抛异常）
 */
export async function isTencentDocsTokenConfigured(): Promise<{
  configured: boolean;
  source?: string;
}> {
  try {
    // 检查环境变量
    if (process.env[ENV_KEY]) {
      return { configured: true, source: '环境变量' };
    }

    // 检查数据库
    const supabase = getSupabaseClient(getSupabaseServiceRoleKey());
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .single();
    if (!error && data?.value) {
      const token = typeof data.value === 'string' ? data.value : (data.value as { token?: string }).token;
      if (token) return { configured: true, source: '数据库' };
    }

    // 检查本地文件
    const fileData = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(fileData);
    if (config.token) return { configured: true, source: '本地文件' };

    return { configured: false };
  } catch {
    return { configured: false };
  }
}
