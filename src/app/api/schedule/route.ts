import { NextRequest, NextResponse } from 'next/server';
import { schedulesStorage } from '@/lib/serverStorage';

// 获取日程列表 - 本地存储模式
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    let schedules = schedulesStorage.getAll();

    // 按日期范围筛选
    if (start && end) {
      schedules = schedules.filter((s: any) => {
        const eventDate = new Date(s.start_time);
        return eventDate >= new Date(start) && eventDate <= new Date(end);
      });
    }

    // 排序：按开始时间
    schedules.sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    return NextResponse.json({ data: schedules });
  } catch (error) {
    console.error('获取日程失败:', error);
    return NextResponse.json({ error: '获取日程失败' }, { status: 500 });
  }
}

// 创建日程 - 本地存储模式
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, start_time, end_time, meeting_url, type } = body;

    if (!title || !start_time) {
      return NextResponse.json({ error: '标题和开始时间不能为空' }, { status: 400 });
    }

    const data = schedulesStorage.create({
      title,
      description: description || null,
      start_time,
      end_time: end_time || null,
      meeting_url: meeting_url || null,
      type: type || 'meeting',
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建日程失败:', error);
    return NextResponse.json({ error: '创建日程失败' }, { status: 500 });
  }
}
