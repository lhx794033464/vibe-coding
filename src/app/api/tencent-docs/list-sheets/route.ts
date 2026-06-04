import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { getTencentDocsToken } from '@/lib/tencentDocsConfig';

const DOC_FILE_ID = 'DTUZjZ3Jmc0JKdXF3';

export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const token = await getTencentDocsToken();
    if (!token) {
      return NextResponse.json({ error: '腾讯文档未配置' }, { status: 500 });
    }

    const client = new TencentDocsClient(token);

    // Try reading with different sheet IDs to find the schedule sheet
    const sheetIds = ['rafiwj', 'schedule', 'paiban', 'Sheet1', 'Sheet2', 'sheet1', 'sheet2', 'bqfqcq'];
    const results: Record<string, { found: boolean; preview?: string; rowCount?: number }> = {};

    for (const sheetId of sheetIds) {
      try {
        const result = await client.getSheetCellData({
          fileId: DOC_FILE_ID,
          sheetId,
          startRow: 0,
          endRow: 5,
          startCol: 0,
          endCol: 20,
          returnCsv: true,
        });

        const csvData = result.csv_data || '';
        const rows = csvData.split('\n').filter((line: string) => line.trim());

        if (rows.length > 0) {
          results[sheetId] = {
            found: true,
            rowCount: rows.length,
            preview: rows.slice(0, 3).join(' | '),
          };
        } else {
          results[sheetId] = { found: false };
        }
      } catch {
        results[sheetId] = { found: false, preview: 'Error reading sheet' };
      }
    }

    return NextResponse.json({
      fileId: DOC_FILE_ID,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: '查找工作表失败', details: String(error) },
      { status: 500 }
    );
  }
}
