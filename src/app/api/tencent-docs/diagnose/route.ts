import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient, getSupabaseServiceRoleKey } from '@/storage/database/supabase-client';
import { readFile } from 'fs/promises';
import path from 'path';

const CONFIG_FILE = path.join('/tmp', 'tencent_docs_config.json');
const CONFIG_KEY = 'tencent_docs_token';
const ENV_KEY = 'TENCENT_DOCS_TOKEN';

// GET: 诊断 Token 配置状态（仅管理员可用）
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const sources: Record<string, { available: boolean; detail?: string }> = {};

  // 1. 检查环境变量
  const envToken = process.env[ENV_KEY];
  sources['env_var'] = {
    available: !!envToken,
    detail: envToken
      ? `已配置 (长度: ${envToken.length}, 前缀: ${envToken.substring(0, 4)}...)`
      : `未设置环境变量 ${ENV_KEY}`,
  };

  // 2. 检查数据库
  try {
    const supabase = getSupabaseClient(getSupabaseServiceRoleKey());
    const { data, error } = await supabase
      .from('system_config')
      .select('value, updated_at')
      .eq('key', CONFIG_KEY)
      .single();

    if (error) {
      sources['database'] = { available: false, detail: `查询失败: ${error.message}` };
    } else if (data?.value) {
      const parsed = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
      sources['database'] = {
        available: true,
        detail: `已配置 (更新时间: ${data.updated_at})`,
      };
    } else {
      sources['database'] = { available: false, detail: '数据库中无记录' };
    }
  } catch (err) {
    sources['database'] = { available: false, detail: `异常: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 3. 检查本地文件
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);
    sources['local_file'] = {
      available: !!config.token,
      detail: config.token
        ? `已配置 (长度: ${config.token.length})`
        : '文件存在但无 token 字段',
    };
  } catch {
    sources['local_file'] = { available: false, detail: '文件不存在或无法读取' };
  }

  // 4. 检查 URL 参数
  const urlToken = request.nextUrl.searchParams.get('token');
  sources['url_param'] = {
    available: !!urlToken,
    detail: urlToken
      ? `已提供 (长度: ${urlToken.length})`
      : 'URL 中未提供 token 参数',
  };

  const anyAvailable = Object.values(sources).some(s => s.available);

  return NextResponse.json({
    configured: anyAvailable,
    sources,
    recommendation: anyAvailable
      ? 'Token 已配置，可正常使用腾讯文档功能'
      : `所有来源均未配置 Token，请通过以下任一方式配置：1) 设置环境变量 ${ENV_KEY}；2) 调用 /api/tencent-docs/config POST 接口保存 Token`,
  });
}
