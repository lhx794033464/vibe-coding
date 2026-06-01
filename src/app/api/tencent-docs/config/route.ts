import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const CONFIG_FILE = path.join('/tmp', 'tencent_docs_config.json');
const CONFIG_KEY = 'tencent_docs_token';

interface TencentDocsConfig {
  token: string;
  updated_by: string;
  updated_at: string;
}

async function loadConfigFromDb(): Promise<TencentDocsConfig | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('system_config')
      .select('value, updated_at')
      .eq('key', CONFIG_KEY)
      .single();
    if (error || !data) return null;
    const parsed = JSON.parse(data.value);
    return {
      token: parsed.token,
      updated_by: parsed.updated_by,
      updated_at: data.updated_at,
    };
  } catch {
    return null;
  }
}

async function saveConfigToDb(config: TencentDocsConfig): Promise<void> {
  const supabase = getSupabaseClient();
  const value = JSON.stringify({
    token: config.token,
    updated_by: config.updated_by,
  });
  await supabase
    .from('system_config')
    .upsert({ key: CONFIG_KEY, value, updated_at: new Date().toISOString() });
}

async function deleteConfigFromDb(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('system_config').delete().eq('key', CONFIG_KEY);
  } catch {
    // 忽略
  }
}

async function loadConfig(): Promise<TencentDocsConfig | null> {
  // 优先从数据库读取（生产环境持久化）
  const dbConfig = await loadConfigFromDb();
  if (dbConfig) return dbConfig;

  // 回退到本地文件（开发环境兼容）
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveConfig(config: TencentDocsConfig): Promise<void> {
  // 同时保存到数据库（持久化）和本地文件
  await Promise.all([
    saveConfigToDb(config),
    writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8'),
  ]);
}

async function deleteConfig(): Promise<void> {
  await Promise.all([
    deleteConfigFromDb(),
    (async () => {
      try {
        const { unlink } = await import('fs/promises');
        await unlink(CONFIG_FILE);
      } catch {
        // 文件不存在则忽略
      }
    })(),
  ]);
}

// GET: 获取配置（Token 脱敏）
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const config = await loadConfig();
  if (!config) {
    return NextResponse.json({ configured: false });
  }

  // 脱敏 Token：只显示前后4位
  const token = config.token;
  const maskedToken = token.length > 8
    ? `${token.substring(0, 4)}${'*'.repeat(token.length - 8)}${token.substring(token.length - 4)}`
    : '****';

  return NextResponse.json({
    configured: true,
    token: maskedToken,
    updated_by: config.updated_by,
    updated_at: config.updated_at,
  });
}

// POST: 保存配置
export async function POST(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token 不能为空' }, { status: 400 });
    }

    await saveConfig({
      token,
      updated_by: userInfo.username,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存腾讯文档配置失败:', error);
    return NextResponse.json({ error: '保存配置失败' }, { status: 500 });
  }
}

// DELETE: 删除配置
export async function DELETE(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  await deleteConfig();
  return NextResponse.json({ success: true });
}
