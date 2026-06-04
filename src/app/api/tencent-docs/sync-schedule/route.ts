import { NextRequest, NextResponse } from 'next/server';
import { TencentDocsClient } from '@/lib/tencentDocsClient';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getTencentDocsToken } from '@/lib/tencentDocsConfig';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo || userInfo.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const body = await request.json();
    const { fileId, sheetId } = body;

    if (!fileId || !sheetId) {
      return NextResponse.json({ error: '请提供文档ID和工作表ID' }, { status: 400 });
    }

    const client = new TencentDocsClient(getTencentDocsToken());
    const supabase = getSupabaseClient();
    
    // Read all cell data from the schedule sheet
    const cellData = await client.getSheetCellData(fileId, sheetId);
    
    if (!cellData || cellData.length === 0) {
      return NextResponse.json({ error: '未找到排班数据，请检查文档ID和工作表ID' }, { status: 404 });
    }

    // Parse the schedule data
    // Expected format: First row = header with consultant names
    // First column = dates
    // Cells = customer/project names
    const headerRow = cellData[0] || [];
    const consultantNames: string[] = [];
    
    // Extract consultant names from header (skip first column which is dates)
    for (let i = 1; i < headerRow.length; i++) {
      const name = String(headerRow[i] || '').trim();
      if (name) {
        consultantNames.push(name);
      }
    }

    if (consultantNames.length === 0) {
      return NextResponse.json({ error: '未找到顾问名称，请确保第一行包含顾问姓名' }, { status: 400 });
    }

    // Get all users for mapping
    const { data: users } = await supabase
      .from('users')
      .select('id, username')
      .eq('is_active', true);

    const userMap = new Map<string, string>();
    if (users) {
      for (const u of users) {
        userMap.set(u.username, u.id);
      }
    }

    // Parse schedule entries
    const entries: Array<{
      consultant: string;
      userId: string | null;
      date: string;
      content: string;
    }> = [];

    for (let rowIdx = 1; rowIdx < cellData.length; rowIdx++) {
      const row = cellData[rowIdx];
      if (!row || row.length === 0) continue;

      const dateStr = String(row[0] || '').trim();
      if (!dateStr) continue;

      // Parse date - try multiple formats
      let dateValue: Date | null = null;
      
      // Format: 2026/6/1 or 2026-6-1
      const dateMatch = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (dateMatch) {
        dateValue = new Date(
          parseInt(dateMatch[1]),
          parseInt(dateMatch[2]) - 1,
          parseInt(dateMatch[3])
        );
      }
      
      // Format: 6/1 or 6月1日 (assume current year or next month if month < current)
      if (!dateValue) {
        const shortMatch = dateStr.match(/(\d{1,2})[\/月](\d{1,2})[日]?/);
        if (shortMatch) {
          const now = new Date();
          let year = now.getFullYear();
          const month = parseInt(shortMatch[1]);
          const day = parseInt(shortMatch[2]);
          if (month < now.getMonth() + 1) year++;
          dateValue = new Date(year, month - 1, day);
        }
      }

      if (!dateValue || isNaN(dateValue.getTime())) continue;

      const formattedDate = dateValue.toISOString().split('T')[0];

      // Process each consultant column
      for (let colIdx = 0; colIdx < consultantNames.length; colIdx++) {
        const cellValue = String(row[colIdx + 1] || '').trim();
        if (!cellValue) continue;

        const consultantName = consultantNames[colIdx];
        const userId = userMap.get(consultantName) || null;

        // Skip if cell contains only symbols or status markers
        if (/^[—\-\/\\]$/.test(cellValue)) continue;
        // Skip if it's just numbers (like day count)
        if (/^\d+$/.test(cellValue)) continue;

        entries.push({
          consultant: consultantName,
          userId,
          date: formattedDate,
          content: cellValue,
        });
      }
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: '未解析到有效的排班数据' }, { status: 400 });
    }

    // Check for existing schedules to avoid duplicates
    const dates = [...new Set(entries.map(e => e.date))];
    const { data: existingSchedules } = await supabase
      .from('schedules')
      .select('user_id, date, content')
      .in('date', dates);

    const existingSet = new Set<string>();
    if (existingSchedules) {
      for (const s of existingSchedules) {
        existingSet.add(`${s.user_id}:${s.date}:${s.content}`);
      }
    }

    // Create new schedule entries (skip duplicates)
    const newEntries = entries.filter(e => {
      const key = `${e.userId || 'null'}:${e.date}:${e.content}`;
      return !existingSet.has(key);
    });

    if (newEntries.length === 0) {
      return NextResponse.json({
        success: true,
        message: '所有排班数据已存在，无需同步',
        total: entries.length,
        created: 0,
        skipped: entries.length,
      });
    }

    // Insert new schedules
    const insertData = newEntries.map(e => ({
      user_id: e.userId || 'admin_default',
      title: e.content,
      date: e.date,
      content: e.content,
      type: 'visit',
      status: 'scheduled',
      created_by: userInfo.username,
    }));

    const { error: insertError } = await supabase
      .from('schedules')
      .insert(insertData);

    if (insertError) {
      console.error('Error inserting schedules:', insertError);
      return NextResponse.json({ error: '创建排班失败: ' + insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `成功同步 ${newEntries.length} 条排班`,
      total: entries.length,
      created: newEntries.length,
      skipped: entries.length - newEntries.length,
      consultants: consultantNames,
      dateRange: dates.length > 0 ? `${dates.sort()[0]} ~ ${dates.sort()[dates.length - 1]}` : '',
    });
  } catch (error) {
    console.error('Sync schedule error:', error);
    return NextResponse.json(
      { error: '同步排班失败: ' + (error instanceof Error ? error.message : '未知错误') },
      { status: 500 }
    );
  }
}

// GET: Preview schedule data from tencent doc
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo || userInfo.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const sheetId = searchParams.get('sheetId');

    if (!fileId || !sheetId) {
      return NextResponse.json({ error: '请提供文档ID和工作表ID' }, { status: 400 });
    }

    const client = getTencentDocsClient();
    const cellData = await client.getSheetCellData(fileId, sheetId);
    
    if (!cellData || cellData.length === 0) {
      return NextResponse.json({ error: '未找到数据' }, { status: 404 });
    }

    // Return preview data (first 10 rows)
    const previewRows = cellData.slice(0, 10).map((row: unknown[]) => 
      row.map((cell: unknown) => String(cell || ''))
    );

    return NextResponse.json({
      fileId,
      sheetId,
      totalRows: cellData.length,
      totalCols: cellData[0]?.length || 0,
      preview: previewRows,
    });
  } catch (error) {
    console.error('Preview schedule error:', error);
    return NextResponse.json(
      { error: '预览失败: ' + (error instanceof Error ? error.message : '未知错误') },
      { status: 500 }
    );
  }
}
