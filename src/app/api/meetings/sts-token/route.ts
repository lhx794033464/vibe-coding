import { NextRequest, NextResponse } from 'next/server';
import { getStsToken, getCachedStsToken } from '@/services/tencentMeeting';

/**
 * 触发 STS-Token 生成
 * POST /api/meetings/sts-token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const operatorId = body.operator_id as string | undefined;

    // getStsToken 会触发 STS-Token 生成并等待 Webhook 回调
    const token = await getStsToken(operatorId);

    if (token) {
      return NextResponse.json({
        success: true,
        message: 'STS-Token 已获取并缓存',
        hasToken: true,
      });
    }

    return NextResponse.json({
      success: false,
      message: 'STS-Token 获取超时。请确保已在腾讯会议开放平台配置 Webhook URL，并重试',
      hasToken: false,
    });
  } catch (err) {
    console.error('[TencentMeeting] STS-Token 生成错误:', err);
    return NextResponse.json(
      { error: `STS-Token 生成失败: ${err instanceof Error ? err.message : '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * 查询当前 STS-Token 状态
 * GET /api/meetings/sts-token
 */
export async function GET() {
  const token = getCachedStsToken();
  return NextResponse.json({
    hasToken: !!token,
    message: token ? 'STS-Token 有效' : '暂无有效的 STS-Token，请先生成',
  });
}
