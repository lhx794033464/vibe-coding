import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

/**
 * 腾讯会议API集成
 * 文档: https://cloud.tencent.com/document/product/1095/42407
 */

// 腾讯会议API配置
const TENCENT_MEETING_CONFIG = {
  // 企业ID (需要在腾讯会议开放平台申请)
  appId: process.env.TENCENT_MEETING_APP_ID || '',
  // 应用Secret
  secretId: process.env.TENCENT_MEETING_SECRET_ID || '',
  secretKey: process.env.TENCENT_MEETING_SECRET_KEY || '',
  // API地址
  apiHost: 'api.meeting.qq.com',
};

/**
 * 获取AccessToken
 * 腾讯会议API使用JWT方式认证
 */
async function getAccessToken(): Promise<string> {
  const { appId, secretId, secretKey } = TENCENT_MEETING_CONFIG;
  
  if (!appId || !secretId || !secretKey) {
    throw new Error('腾讯会议API未配置，请在环境变量中设置 TENCENT_MEETING_APP_ID, TENCENT_MEETING_SECRET_ID, TENCENT_MEETING_SECRET_KEY');
  }

  // 使用JWT方式生成AccessToken
  // 参考: https://cloud.tencent.com/document/product/1095/42412
  const payload = {
    iss: secretId,
    exp: Math.floor(Date.now() / 1000) + 3600, // 1小时过期
    nbf: Math.floor(Date.now() / 1000) - 300, // 5分钟前生效
    aud: 'meeting.qq.com',
    sub: appId,
    ver: '1.0',
  };

  return jwt.sign(payload, secretKey, { algorithm: 'HS256' });
}

/**
 * 创建腾讯会议
 * POST /api/tencent-meeting
 * 
 * Body:
 * - subject: 会议主题
 * - startTime: 开始时间 (Unix时间戳, 秒)
 * - duration: 会议时长 (分钟)
 * - customerId: 客户ID (用于记录)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subject, startTime, duration, customerId } = body;

    if (!subject || !startTime || !duration) {
      return NextResponse.json(
        { error: '缺少必要参数: subject, startTime, duration' },
        { status: 400 }
      );
    }

    // 检查是否配置了腾讯会议API
    if (!TENCENT_MEETING_CONFIG.appId || !TENCENT_MEETING_CONFIG.secretId || !TENCENT_MEETING_CONFIG.secretKey) {
      // 如果未配置，返回模拟数据（开发模式）
      return NextResponse.json({
        success: true,
        data: {
          meetingCode: generateMockMeetingCode(),
          meetingUrl: `https://meeting.tencent.com/dm/${generateMockMeetingCode()}`,
          subject,
          startTime,
          duration,
          hostUrl: `https://meeting.tencent.com/dm/${generateMockMeetingCode()}?host=1`,
          message: '腾讯会议API未配置，返回模拟会议链接。请配置环境变量 TENCENT_MEETING_APP_ID, TENCENT_MEETING_SECRET_ID, TENCENT_MEETING_SECRET_KEY 以使用真实API。',
        }
      });
    }

    // 获取AccessToken
    const accessToken = await getAccessToken();

    // 调用腾讯会议API创建会议
    // 参考: https://cloud.tencent.com/document/product/1095/42416
    const response = await fetch(`https://${TENCENT_MEETING_CONFIG.apiHost}/v1/meetings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        userid: 'system', // 会议创建者用户ID
        instanceid: 1, // 终端设备类型: 1-PC
        subject: subject,
        type: 0, // 会议类型: 0-即时会议, 1-预约会议
        start_time: startTime,
        duration: duration,
        hosts: [
          { userid: 'system' }
        ],
        settings: {
          mute_enable_join: true, // 入会静音
          allow_unmute_self: true, // 允许解除静音
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('腾讯会议API错误:', errorData);
      return NextResponse.json(
        { error: '创建会议失败', details: errorData },
        { status: 500 }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      data: {
        meetingCode: result.meeting_code,
        meetingUrl: `https://meeting.tencent.com/dm/${result.meeting_code}`,
        subject,
        startTime,
        duration,
        hostUrl: result.host_url,
      }
    });

  } catch (error) {
    console.error('创建腾讯会议失败:', error);
    return NextResponse.json(
      { error: '创建会议失败', message: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

/**
 * 生成模拟会议码 (用于开发测试)
 */
function generateMockMeetingCode(): string {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}
