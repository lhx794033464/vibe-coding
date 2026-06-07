import { NextRequest, NextResponse } from 'next/server';
import { extractMinutes, getTencentMeetingConfigStatus } from '@/services/tencentMeeting';
import { getCurrentUserInfo } from '@/lib/serverAuth';

/**
 * POST /api/meetings/minutes
 * 从腾讯会议回放链接提取会议纪要
 *
 * Body: { url: string } - 腾讯会议回放链接或会议号
 */
export async function POST(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未认证' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        { error: '请提供腾讯会议回放链接或会议号' },
        { status: 400 }
      );
    }

    // 优先使用用户个人配置的 operator_id，否则使用全局环境变量
    const operatorId = userInfo.tencent_meeting_operator_id || undefined;
    const result = await extractMinutes(url.trim(), operatorId);

    return NextResponse.json(result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[API /meetings/minutes] 错误:', errorMessage);
    return NextResponse.json(
      { success: false, minutes: '', error: `服务器错误: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/meetings/minutes
 * 获取腾讯会议 API 配置状态
 */
export async function GET(request: NextRequest) {
  const userInfo = await getCurrentUserInfo(request);
  if (!userInfo) {
    return NextResponse.json({ error: '未认证' }, { status: 401 });
  }

  const configStatus = getTencentMeetingConfigStatus();
  // 如果用户有个人 operator_id，标记已配置
  const hasPersonalConfig = !!userInfo.tencent_meeting_operator_id;
  return NextResponse.json({ ...configStatus, hasPersonalOperatorId: hasPersonalConfig });
}
