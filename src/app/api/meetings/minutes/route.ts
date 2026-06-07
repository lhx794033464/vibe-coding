import { NextRequest } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { extractMeetingMinutes, parseMeetingId } from '@/services/tencentMeeting';

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return Response.json({ error: '未认证' }, { status: 401 });
    }

    const body = await request.json();
    const { input } = body;

    if (!input) {
      return Response.json({ error: '请提供会议回放链接或会议 ID' }, { status: 400 });
    }

    const result = await extractMeetingMinutes(input);

    return Response.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[MeetingMinutes] Error:', error);
    return Response.json({
      success: false,
      error: error.message || '提取会议纪要失败',
    }, { status: 500 });
  }
}

/**
 * 辅助接口：验证链接并返回解析后的 meetingId（不发起真实请求）
 */
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return Response.json({ error: '未认证' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const input = searchParams.get('input');

    if (!input) {
      return Response.json({ error: '请提供会议回放链接或会议 ID' }, { status: 400 });
    }

    const meetingId = parseMeetingId(input);

    return Response.json({
      success: true,
      meetingId,
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || '解析失败',
    });
  }
}