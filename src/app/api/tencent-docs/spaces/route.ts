import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { getTencentDocsToken } from '@/lib/tencentDocsConfig';

async function getClient(request?: NextRequest): Promise<TencentDocsClient> {
  const token = await getTencentDocsToken(request);
  return new TencentDocsClient(token);
}

// GET: 查询空间节点或搜索文档
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'spaces';
  const parentId = searchParams.get('parent_id') || undefined;
  const keyword = searchParams.get('keyword') || undefined;
  const pageToken = searchParams.get('page_token') || undefined;

  try {
    const client = await getClient();

    switch (action) {
      case 'spaces': {
        const result = await client.querySpaceNode(parentId, pageToken);
        return NextResponse.json({ data: result });
      }
      case 'search': {
        if (!keyword) {
          return NextResponse.json({ error: '搜索关键词不能为空' }, { status: 400 });
        }
        const result = await client.searchSpaceFile(keyword, pageToken);
        return NextResponse.json({ data: result });
      }
      default:
        return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('腾讯文档空间查询失败:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
