import { NextRequest, NextResponse } from 'next/server';
import { setStsToken } from '@/services/tencentMeeting';

/**
 * 腾讯会议 Webhook 回调 - 接收 STS-Token
 * 需要在腾讯会议开放平台配置此 URL 作为事件订阅地址
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    console.log('[TencentMeeting] Webhook 收到事件:', JSON.stringify(data).substring(0, 500));

    // 处理 STS-Token 生成事件
    if (data.event === 'sts_token_generated' || data.event_type === 'sts_token_generated') {
      const token = data.payload?.sts_token || data.sts_token;
      if (token) {
        const validHours = data.payload?.valid_time || 6;
        setStsToken(token, validHours * 3600 * 1000);
        console.log('[TencentMeeting] STS-Token 已缓存，有效期:', validHours, '小时');
      }
    }

    // 通用事件处理 - 检查是否有 token 字段
    if (data.sts_token) {
      setStsToken(data.sts_token, 6 * 3600 * 1000);
      console.log('[TencentMeeting] STS-Token 已从 Webhook 缓存');
    }

    return NextResponse.json({ code: 0, message: 'success' });
  } catch (err) {
    console.error('[TencentMeeting] Webhook 处理错误:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * 腾讯会议 Webhook URL 验证（GET 请求）
 * 配置 Webhook 时腾讯会议会发 GET 请求验证
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const checkStr = searchParams.get('check_str');

  if (checkStr) {
    // 验证流程：base64 解码 check_str 并返回
    const decoded = Buffer.from(checkStr, 'base64').toString('utf-8');
    console.log('[TencentMeeting] Webhook 验证通过');
    return new NextResponse(decoded, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ status: 'ok', message: 'Tencent Meeting Webhook Endpoint' });
}
