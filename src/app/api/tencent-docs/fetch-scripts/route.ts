import { NextRequest, NextResponse } from 'next/server';
import { getTencentDocsToken } from '@/lib/tencentDocsConfig';
import { TencentDocsClient } from '@/lib/tencentDocsClient';

const FILE_ID = 'DTUZjZ3Jmc0JKdXF3';
const TAB_ID = 'cgzthd';

export async function GET(request: NextRequest) {
  try {
    const token = await getTencentDocsToken();
    if (!token) {
      return NextResponse.json({ error: '腾讯文档 Token 未配置' }, { status: 400 });
    }

    const client = new TencentDocsClient(token);
    
    // 如果debug参数，先列出所有sheet
    if (request.nextUrl.searchParams.get('debug') === '1') {
      const sheets = await client.listSheets(FILE_ID);
      return NextResponse.json({ sheets });
    }

    // 先列出所有sheet，找到对应tab的sheet_id
    const sheets = await client.listSheets(FILE_ID);
    let sheetId = TAB_ID;
    const matchedSheet = sheets.find(s => s.id === TAB_ID || s.title.includes('标准话术') || s.title.includes('话术'));
    if (matchedSheet) {
      sheetId = matchedSheet.id;
    } else if (sheets.length > 0) {
      // fallback: 使用第一个sheet
      sheetId = sheets[0].id;
    }

    // 获取表格数据
    const rows = await client.getSheetAllData({
      fileId: FILE_ID,
      sheetId,
      startCol: 0,
      endCol: 10,
      batchSize: 500,
    });

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: '未获取到话术数据' }, { status: 404 });
    }

    // 第一行是表头
    const headers = rows[0] || [];

    // 解析数据行
    const scripts: Array<{
      category: string;
      subCategory: string;
      scenario: string;
      content: string;
      notes: string;
    }> = [];

    const categories = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length === 0) continue;

      const category = (cols[0] || '').trim();
      const subCategory = (cols[1] || '').trim();
      const scenario = (cols[2] || '').trim();
      const content = (cols[3] || '').trim();
      const notes = (cols[4] || '').trim();

      if (!category && !scenario && !content) continue;

      scripts.push({ category, subCategory, scenario, content, notes });
      if (category) categories.add(category);
    }

    return NextResponse.json({
      success: true,
      total: scripts.length,
      categories: Array.from(categories),
      headers: headers.map((h: string) => (h || '').trim()),
      data: scripts,
    });
  } catch (error) {
    console.error('获取常用话术失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取话术数据失败' },
      { status: 500 }
    );
  }
}
