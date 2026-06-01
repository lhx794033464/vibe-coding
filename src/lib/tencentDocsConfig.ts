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
  // 1. URL 参数
  if (request) {
    const urlToken = request.nextUrl.searchParams.get('token');
    if (urlToken) return urlToken;
  }

  // 2. 环境变量（生产环境推荐方式）
  const envToken = process.env[ENV_KEY];
  if (envToken) return envToken;

  // 3. 数据库 system_config
  try {
    const supabase = getSupabaseClient(getSupabaseServiceRoleKey());
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .single();
    if (data?.value) return data.value;
  } catch {}

  // 4. 本地配置文件（开发环境兼容）
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);
    if (config.token) return config.token;
  } catch {}

  throw new Error('未配置腾讯文档 Token，请在部署环境变量中设置 TENCENT_DOCS_TOKEN');
}
