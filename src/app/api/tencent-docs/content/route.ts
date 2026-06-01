import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { getTencentDocsToken } from '@/lib/tencentDocsConfig';

async function getClient(request?: NextRequest): Promise<TencentDocsClient> {
  const token = await getTencentDocsToken(request);
  return new TencentDocsClient(token);
}

// GET: 获取文档内容或智能表格结构
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('file_id');
  const action = searchParams.get('action') || 'content';
  const sheetId = searchParams.get('sheet_id') || undefined;

  if (!fileId) {
    return NextResponse.json({ error: 'file_id 不能为空' }, { status: 400 });
  }

  try {
    const client = await getClient();

    switch (action) {
      case 'content': {
        const result = await client.getContent(fileId);
        return NextResponse.json({ data: result });
      }
      case 'tables': {
        const result = await client.listSmartSheetTables(fileId);
        return NextResponse.json({ data: result });
      }
      case 'fields': {
        if (!sheetId) {
          return NextResponse.json({ error: 'sheet_id 不能为空' }, { status: 400 });
        }
        const result = await client.listSmartSheetFields(fileId, sheetId);
        return NextResponse.json({ data: result });
      }
      case 'records': {
        if (!sheetId) {
          return NextResponse.json({ error: 'sheet_id 不能为空' }, { status: 400 });
        }
        const pageSize = searchParams.get('page_size')
          ? parseInt(searchParams.get('page_size')!)
          : undefined;
        const pageToken = searchParams.get('page_token') || undefined;
        const result = await client.listSmartSheetRecords(fileId, sheetId, pageSize, pageToken);
        return NextResponse.json({ data: result });
      }
      case 'all_records': {
        if (!sheetId) {
          return NextResponse.json({ error: 'sheet_id 不能为空' }, { status: 400 });
        }
        const result = await client.getAllSmartSheetRecords(fileId, sheetId);
        return NextResponse.json({ data: { records: result } });
      }
      default:
        return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('获取腾讯文档内容失败:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
