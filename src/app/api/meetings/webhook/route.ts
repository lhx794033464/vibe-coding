import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, createDecipheriv, createHash } from 'crypto';
import { setStsToken } from '@/services/tencentMeeting';

/**
 * 从环境变量读取 Webhook Token
 */
function getWebhookToken(): string {
  return process.env.TENCENT_MEETING_WEBHOOK_TOKEN || '';
}

/**
 * 从环境变量读取 EncodingAESKey（可选）
 */
function getEncodingAESKey(): string {
  return process.env.TENCENT_MEETING_ENCODING_AES_KEY || '';
}

/**
 * SHA1 签名验证
 * signature = sha1(sort(token, timestamp, nonce, data))
 */
function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  data: string,
  signature: string
): boolean {
  const sortArr = [token, timestamp, nonce, data].sort();
  const sortStr = sortArr.join('');
  const sha1 = createHash('sha1').update(sortStr).digest('hex');
  return sha1 === signature;
}

/**
 * AES-256-CBC 解密
 * AESKey = Base64_Decode(EncodingAESKey + "=")
 * IV = AESKey 前16字节
 */
function aesDecrypt(encryptedBase64: string, encodingAESKey: string): string {
  // 解码 EncodingAESKey（补齐 =）
  const aesKeyBuf = Buffer.from(encodingAESKey + '=', 'base64');
  const aesKey = Buffer.alloc(32);
  aesKeyBuf.copy(aesKey);

  // IV = AESKey 前16字节
  const iv = aesKey.subarray(0, 16);

  // Base64 解码密文
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  // AES-256-CBC 解密
  const decipher = createDecipheriv('aes-256-cbc', aesKey, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  // 移除 PKCS#7 填充
  const padding = decrypted[decrypted.length - 1];
  return decrypted.subarray(0, decrypted.length - padding).toString('utf-8');
}

/**
 * 解密 check_str / data
 * 如果有 EncodingAESKey 则 AES 解密，否则仅 base64 解码
 */
function decryptPayload(base64Str: string): string {
  const encodingKey = getEncodingAESKey();
  if (encodingKey) {
    return aesDecrypt(base64Str, encodingKey);
  }
  // 无加密时仅 base64 解码
  return Buffer.from(base64Str, 'base64').toString('utf-8');
}

/**
 * GET - 腾讯会议 Webhook URL 验证
 * 
 * 腾讯会议发送 GET 请求到配置的 URL，包含：
 * - Query Param: check_str (base64编码后可能加密的验证字符串)
 * - Header: timestamp, nonce, signature
 * 
 * 验证流程：
 * 1. 使用 Token 校验签名（Header 中的 signature）
 * 2. 对 check_str 先 base64 解码，再 AES 解密（如有 EncodingAESKey）
 * 3. 3秒内返回明文字符串（不加引号、换行符）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const checkStr = searchParams.get('check_str');

    if (!checkStr) {
      return NextResponse.json(
        { error: 'Missing check_str parameter' },
        { status: 400 }
      );
    }

    const token = getWebhookToken();
    if (!token) {
      console.error('[TencentMeeting] Webhook Token 未配置');
      return new NextResponse('Token not configured', { status: 500 });
    }

    // 从 Header 读取签名参数
    const timestamp = request.headers.get('timestamp') || '';
    const nonce = request.headers.get('nonce') || '';
    const signature = request.headers.get('signature') || '';

    console.log(
      '[TencentMeeting] Webhook 验证请求:',
      'check_str:', checkStr.substring(0, 50) + '...',
      'timestamp:', timestamp,
      'nonce:', nonce,
      'signature:', signature
    );

    // 验证签名
    if (!verifySignature(token, timestamp, nonce, checkStr, signature)) {
      console.error('[TencentMeeting] Webhook 签名验证失败');
      console.error(
        '[TencentMeeting] 期望传入:',
        'token:', token,
        'timestamp:', timestamp,
        'nonce:', nonce,
        'check_str(前50):', checkStr.substring(0, 50)
      );
      return new NextResponse('Signature verification failed', { status: 403 });
    }

    // 解码 check_str
    const decoded = decryptPayload(decodeURIComponent(checkStr));
    console.log('[TencentMeeting] Webhook URL 验证成功');

    // 返回纯文本（不能加引号、换行符、空格）
    return new NextResponse(decoded, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('[TencentMeeting] Webhook GET 处理错误:', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

/**
 * POST - 接收腾讯会议事件回调
 * 
 * Header:
 * - timestamp, nonce, signature（用于签名校验）
 * 
 * Body (JSON):
 * - data: base64 编码（可能 AES 加密）的事件数据
 * 
 * 处理流程：
 * 1. 校验签名
 * 2. 解密 data
 * 3. 处理业务逻辑（如 STS-Token）
 * 4. 返回 "successfully received callback"
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    const token = getWebhookToken();

    // 从 Header 读取签名参数
    const timestamp = request.headers.get('timestamp') || '';
    const nonce = request.headers.get('nonce') || '';
    const signature = request.headers.get('signature') || '';

    // 如果有 Token 配置且 Header 带签名，则校验签名
    if (token && signature) {
      if (!verifySignature(token, timestamp, nonce, body, signature)) {
        console.error('[TencentMeeting] Webhook POST 签名验证失败');
        return NextResponse.json(
          { error: 'Signature verification failed' },
          { status: 403 }
        );
      }
    }

    // 解析 Body（可能是纯 JSON 或加密 data 格式）
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // 如果有 data 字段（加密事件格式），先解密
    if (parsedBody.data) {
      try {
        const decryptedData = decryptPayload(parsedBody.data);
        const eventData = JSON.parse(decryptedData);
        console.log(
          '[TencentMeeting] Webhook 收到加密事件:',
          eventData.event || 'unknown'
        );
        parsedBody = eventData;
      } catch (decryptErr) {
        console.error('[TencentMeeting] Webhook 解密失败:', decryptErr);
        // 解密失败但继续处理，因为可能是未加密的普通 JSON
      }
    }

    // 处理 STS-Token 生成事件
    const eventName = parsedBody.event || parsedBody.event_type || '';
    console.log('[TencentMeeting] Webhook 事件:', eventName, JSON.stringify(parsedBody).substring(0, 300));

    // STS-Token 事件处理
    if (eventName === 'sts_token_generated') {
      const payload = parsedBody.payload || {};
      const stsToken = payload.sts_token || parsedBody.sts_token;
      if (stsToken) {
        const validHours = payload.valid_time || 6;
        setStsToken(stsToken, validHours * 3600 * 1000);
        console.log('[TencentMeeting] STS-Token 已从 Webhook 缓存，有效期:', validHours, '小时');
      }
    }

    // 兼容旧格式：直接检查 sts_token 字段
    if (parsedBody.sts_token) {
      setStsToken(parsedBody.sts_token, 6 * 3600 * 1000);
      console.log('[TencentMeeting] STS-Token 已从 Webhook 缓存（兼容模式）');
    }

    // 必须返回 "successfully received callback"（无引号）
    return new NextResponse('successfully received callback', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('[TencentMeeting] Webhook 处理错误:', err);
    return new NextResponse('successfully received callback', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}