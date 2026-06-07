import crypto from 'crypto';

/**
 * 腾讯会议 REST API 服务
 * 文档: https://cloud.tencent.com/document/product/1095/42414
 */

const BASE_URL = 'https://api.meeting.qq.com';
const APP_ID = process.env.TENCENT_MEETING_APP_ID || '';
const SECRET_ID = process.env.TENCENT_MEETING_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_MEETING_SECRET_KEY || '';
const SDK_ID = process.env.TENCENT_MEETING_SDK_ID || '';
const OPERATOR_ID = process.env.TENCENT_MEETING_OPERATOR_ID || '';

/** 检查是否已配置腾讯会议 API 凭证 */
export function isTencentMeetingConfigured(): boolean {
  return !!(APP_ID && SECRET_ID && SECRET_KEY && OPERATOR_ID);
}

/** 获取配置状态（隐藏敏感信息） */
export function getTencentMeetingConfigStatus() {
  return {
    configured: isTencentMeetingConfigured(),
    appId: APP_ID ? `${APP_ID.slice(0, 4)}***` : '未配置',
    secretId: SECRET_ID ? `${SECRET_ID.slice(0, 8)}***` : '未配置',
    operatorId: OPERATOR_ID ? `${OPERATOR_ID.slice(0, 4)}***` : '未配置',
    sdkId: SDK_ID ? `${SDK_ID.slice(0, 4)}***` : '未配置',
  };
}

/**
 * 生成 HMAC-SHA256 签名
 * 签名串格式: HTTPMethod + "\n" + HeaderString + "\n" + URI + "\n" + Body
 * HeaderString: X-TC-Key={secretId}&X-TC-Nonce={nonce}&X-TC-Timestamp={timestamp}
 */
function generateSignature(
  httpMethod: string,
  headerNonce: string,
  headerTimestamp: string,
  requestUri: string,
  requestBody: string
): string {
  const headerString = `X-TC-Key=${SECRET_ID}&X-TC-Nonce=${headerNonce}&X-TC-Timestamp=${headerTimestamp}`;
  const stringToSign = `${httpMethod}\n${headerString}\n${requestUri}\n${requestBody}`;

  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(stringToSign);
  const hexHash = hmac.digest('hex');
  return Buffer.from(hexHash).toString('base64');
}

/** 构建请求头 */
function buildHeaders(httpMethod: string, requestUri: string, requestBody: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = (Math.floor(Math.random() * 100000) + 1).toString();
  const signature = generateSignature(httpMethod, nonce, timestamp, requestUri, requestBody);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-TC-Key': SECRET_ID,
    'X-TC-Timestamp': timestamp,
    'X-TC-Nonce': nonce,
    'X-TC-Signature': signature,
    'AppId': APP_ID,
    'X-TC-Registered': '1',
  };

  if (SDK_ID) {
    headers['SdkId'] = SDK_ID;
  }

  return headers;
}

/** 发起 GET 请求 */
async function apiGet(uri: string): Promise<unknown> {
  const headers = buildHeaders('GET', uri, '');
  const url = `${BASE_URL}${uri}`;

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`腾讯会议API错误 [${response.status}]: ${errorText}`);
  }

  return response.json();
}

/** 录制文件信息 */
interface RecordFile {
  record_file_id: string;
  record_start_time: number;
  record_end_time: number;
  record_size: number;
  sharing_state: number;
  sharing_url?: string;
}

/** 录制会议信息 */
interface RecordMeeting {
  meeting_record_id: string;
  meeting_id: string;
  meeting_code: string;
  subject: string;
  state: number;
  record_type: number;
  record_files: RecordFile[];
}

/** 纪要对象 */
interface MinutesFile {
  download_address: string;
  file_type: string;
}

/** 录制详情 */
interface RecordingDetail {
  meeting_id: string;
  meeting_code: string;
  record_file_id: string;
  meeting_record_id: string;
  view_address: string;
  ai_minutes: MinutesFile[];
  ai_topic_minutes: MinutesFile[];
  ai_speaker_minutes: MinutesFile[];
  ai_ds_minutes: MinutesFile[];
  meeting_summary: { download_address: string; file_type: string }[];
  ai_meeting_transcripts: { download_address: string; file_type: string }[];
}

/**
 * 查询会议录制列表
 * 文档: https://cloud.tencent.com/document/product/1095/51189
 */
async function queryRecordings(
  meetingCode?: string,
  startTime?: number,
  endTime?: number
): Promise<RecordMeeting[]> {
  const now = Math.floor(Date.now() / 1000);
  const start = startTime || now - 31 * 24 * 3600; // 默认近31天
  const end = endTime || now;

  // 直接拼接查询参数（避免 URLSearchParams 编码导致签名不一致）
  let uri = `/v1/records?operator_id=${OPERATOR_ID}&operator_id_type=1&start_time=${start}&end_time=${end}&page_size=20&page=1`;
  if (meetingCode) {
    uri += `&meeting_code=${meetingCode}`;
  }
  const result = await apiGet(uri) as {
    total_count: number;
    record_meetings: RecordMeeting[];
  };

  return result.record_meetings || [];
}

/**
 * 查询单个录制详情（含转写、纪要）
 * 文档: https://cloud.tencent.com/document/product/1095/51180
 */
async function queryRecordingDetail(recordFileId: string): Promise<RecordingDetail> {
  // 直接拼接查询参数（避免 URLSearchParams 编码导致签名不一致）
  const uri = `/v1/addresses/${recordFileId}?operator_id=${OPERATOR_ID}&operator_id_type=1`;
  return apiGet(uri) as Promise<RecordingDetail>;
}

/** 下载纪要文件内容 */
async function downloadMinutesContent(downloadUrl: string): Promise<string> {
  const response = await fetch(downloadUrl, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`下载纪要文件失败: ${response.status}`);
  }

  return response.text();
}

/**
 * 尝试通过跟随重定向解析 CRM 分享链接
 * CRM 链接格式: https://meeting.tencent.com/crm/XXXXX
 * 会重定向到包含会议信息的页面
 */
async function resolveCrmShareLink(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const finalUrl = response.url || response.headers.get('location') || '';
    // 从重定向后的 URL 中尝试提取会议号
    if (finalUrl && finalUrl !== url) {
      const code = parseMeetingCode(finalUrl);
      if (code) return code;
    }
  } catch {
    // HEAD 请求可能不支持，尝试 GET
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const finalUrl = response.url || '';
    if (finalUrl && finalUrl !== url) {
      const code = parseMeetingCode(finalUrl);
      if (code) return code;
    }
    // 尝试从页面内容中提取会议号
    const html = await response.text();
    // 常见模式: meetingCode / meeting_code / meetingId 等
    const codeMatch = html.match(/["']meeting_code["']\s*[:=]\s*["']?(\d{9,11})["']?/);
    if (codeMatch) return codeMatch[1];
    const idMatch = html.match(/["']meetingId["']\s*[:=]\s*["']?(\d{9,11})["']?/);
    if (idMatch) return idMatch[1];
  } catch {
    // 忽略
  }

  return null;
}

/**
 * 从腾讯会议 URL 中提取会议号
 * 支持格式:
 * - 纯数字会议号: 423111111
 * - 邀请链接: https://meeting.tencent.com/dm/l/XXXXXXX
 * - 回放链接: https://meeting.tencent.com/v2/cloud-record/share?id=SHARE_ID
 * - CRM分享链接: https://meeting.tencent.com/crm/XXXXX
 */
export function parseMeetingCode(url: string): string | null {
  // 纯数字（9位会议号）
  if (/^\d{9,11}$/.test(url.trim())) {
    return url.trim();
  }

  try {
    const parsed = new URL(url);

    // 邀请链接: /dm/l/XXXXXXX
    const dmMatch = parsed.pathname.match(/\/dm\/[a-z]\/(\d+)/);
    if (dmMatch) {
      return dmMatch[1];
    }

    // 通用路径提取数字
    const pathMatch = parsed.pathname.match(/(\d{9,11})/);
    if (pathMatch) {
      return pathMatch[1];
    }

    // 查询参数中的 meeting_code
    const codeParam = parsed.searchParams.get('meeting_code');
    if (codeParam) {
      return codeParam;
    }
  } catch {
    // 不是有效 URL，尝试直接提取数字
    const numMatch = url.match(/(\d{9,11})/);
    if (numMatch) {
      return numMatch[1];
    }
  }

  return null;
}

/**
 * 判断是否为 CRM 分享链接
 */
function isCrmShareLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith('/crm/');
  } catch {
    return false;
  }
}

/**
 * 提取会议纪要 - 主入口函数
 * 流程: URL/会议号 → 查询录制列表 → 获取录制详情 → 下载纪要内容
 */
export async function extractMinutes(meetingUrlOrCode: string): Promise<{
  success: boolean;
  minutes: string;
  meetingInfo?: {
    subject: string;
    meetingCode: string;
    meetingId: string;
    startTime: string;
  };
  error?: string;
}> {
  if (!isTencentMeetingConfigured()) {
    return {
      success: false,
      minutes: '',
      error: '腾讯会议 API 未配置。请在环境变量中设置 TENCENT_MEETING_APP_ID、TENCENT_MEETING_SECRET_ID、TENCENT_MEETING_SECRET_KEY、TENCENT_MEETING_OPERATOR_ID',
    };
  }

  // 1. 解析会议号
  let meetingCode = parseMeetingCode(meetingUrlOrCode);

  // 2. 如果无法解析，尝试通过 CRM 分享链接解析
  if (!meetingCode && isCrmShareLink(meetingUrlOrCode)) {
    meetingCode = await resolveCrmShareLink(meetingUrlOrCode);
  }

  // 3. 如果仍然无法解析，查询最近录制列表尝试匹配
  if (!meetingCode) {
    try {
      const recentRecordings = await queryRecordings();
      if (recentRecordings.length > 0) {
        // 取最近一条录制，返回提示让用户确认
        const latest = recentRecordings[0];
        return {
          success: false,
          minutes: '',
          error: `无法从链接中解析会议号，请直接输入9位会议号。最近录制：${latest.subject || '未知会议'}（会议号: ${latest.meeting_code}）`,
          meetingInfo: {
            subject: latest.subject || '未知会议',
            meetingCode: latest.meeting_code,
            meetingId: latest.meeting_id,
            startTime: latest.record_files?.[0]?.record_start_time
              ? new Date(latest.record_files[0].record_start_time).toLocaleString('zh-CN')
              : '未知',
          },
        };
      }
    } catch {
      // 忽略
    }

    return {
      success: false,
      minutes: '',
      error: '无法从输入中解析出腾讯会议号。请输入9-11位数字的会议号，或使用标准会议链接（如邀请链接）',
    };
  }

  try {
    // 2. 查询录制列表
    const recordings = await queryRecordings(meetingCode);

    if (!recordings || recordings.length === 0) {
      return {
        success: false,
        minutes: '',
        error: `未找到会议号 ${meetingCode} 的录制记录。请确认：1) 会议已结束并生成了云录制 2) 您是会议创建者或企业管理员`,
      };
    }

    // 取最新的一条录制
    const latestRecording = recordings[0];
    const meetingInfo = {
      subject: latestRecording.subject || '未知会议',
      meetingCode: latestRecording.meeting_code,
      meetingId: latestRecording.meeting_id,
      startTime: latestRecording.record_files?.[0]?.record_start_time
        ? new Date(latestRecording.record_files[0].record_start_time).toLocaleString('zh-CN')
        : '未知',
    };

    // 3. 检查录制状态（3=转码完成）
    if (latestRecording.state !== 3) {
      const stateMap: Record<number, string> = { 1: '录制中', 2: '转码中', 3: '转码完成' };
      return {
        success: false,
        minutes: '',
        meetingInfo,
        error: `录制状态为"${stateMap[latestRecording.state] || '未知'}"，暂无法获取纪要。请等待转码完成后再试`,
      };
    }

    // 4. 获取录制详情
    const recordFileId = latestRecording.record_files?.[0]?.record_file_id;
    if (!recordFileId) {
      return {
        success: false,
        minutes: '',
        meetingInfo,
        error: '录制文件 ID 不存在',
      };
    }

    const detail = await queryRecordingDetail(String(recordFileId));

    // 5. 优先级下载纪要: DeepSeek纪要 > 主题纪要 > 章节纪要 > 发言人纪要 > 转写
    const minutesSources = [
      { label: 'DeepSeek纪要', files: detail.ai_ds_minutes },
      { label: '主题纪要', files: detail.ai_topic_minutes },
      { label: '章节纪要', files: detail.ai_minutes },
      { label: '发言人纪要', files: detail.ai_speaker_minutes },
    ];

    for (const source of minutesSources) {
      if (source.files && source.files.length > 0) {
        // 优先 txt 格式（纯文本），其次 htm/html
        const txtFile = source.files.find(f => f.file_type === 'txt');
        const htmFile = source.files.find(f => f.file_type === 'htm' || f.file_type === 'html');
        const docxFile = source.files.find(f => f.file_type === 'docx');
        const targetFile = txtFile || htmFile || docxFile || source.files[0];

        if (targetFile?.download_address) {
          try {
            const content = await downloadMinutesContent(targetFile.download_address);
            if (content && content.trim().length > 0) {
              // 如果是 HTML 格式，提取纯文本
              let text = content;
              if (targetFile.file_type === 'htm' || targetFile.file_type === 'html') {
                text = content
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                  .replace(/<br\s*\/?>/gi, '\n')
                  .replace(/<\/p>/gi, '\n')
                  .replace(/<\/div>/gi, '\n')
                  .replace(/<\/li>/gi, '\n')
                  .replace(/<[^>]+>/g, '')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim();
              }

              return {
                success: true,
                minutes: text,
                meetingInfo,
              };
            }
          } catch (downloadErr) {
            console.error(`[TencentMeeting] 下载${source.label}失败:`, downloadErr);
            // 继续尝试下一个来源
          }
        }
      }
    }

    // 6. 尝试转写文件
    if (detail.ai_meeting_transcripts && detail.ai_meeting_transcripts.length > 0) {
      const transcript = detail.ai_meeting_transcripts.find(f => f.file_type === 'txt') || detail.ai_meeting_transcripts[0];
      if (transcript?.download_address) {
        try {
          const content = await downloadMinutesContent(transcript.download_address);
          if (content && content.trim().length > 0) {
            return {
              success: true,
              minutes: `【会议转写记录】\n\n${content.trim()}`,
              meetingInfo,
            };
          }
        } catch {
          // 忽略
        }
      }
    }

    // 7. 尝试旧版转写
    if (detail.meeting_summary && detail.meeting_summary.length > 0) {
      const summary = detail.meeting_summary.find(f => f.file_type === 'txt') || detail.meeting_summary[0];
      if (summary?.download_address) {
        try {
          const content = await downloadMinutesContent(summary.download_address);
          if (content && content.trim().length > 0) {
            return {
              success: true,
              minutes: content.trim(),
              meetingInfo,
            };
          }
        } catch {
          // 忽略
        }
      }
    }

    return {
      success: false,
      minutes: '',
      meetingInfo,
      error: '该录制暂无 AI 纪要内容。请确认会议已开启"智能纪要"功能，且录制已完成转码',
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[TencentMeeting] 提取纪要失败:', errorMessage);

    // 提供更友好的错误提示
    let friendlyError = `提取纪要失败: ${errorMessage}`;
    if (errorMessage.includes('200003') || errorMessage.includes('签名验证错误')) {
      friendlyError = '腾讯会议 API 签名验证失败，请检查 API 凭证配置是否正确。建议使用9位会议号直接查询';
    } else if (errorMessage.includes('190303') || errorMessage.includes('鉴权失败')) {
      friendlyError = '腾讯会议 API 鉴权失败，请检查 AppId/SecretId/SecretKey 配置';
    } else if (errorMessage.includes('51180') || errorMessage.includes('STS-Token')) {
      friendlyError = '查询录制详情需要 STS-Token，请在腾讯会议企管后台配置事件订阅后重试';
    }

    return {
      success: false,
      minutes: '',
      error: friendlyError,
    };
  }
}
