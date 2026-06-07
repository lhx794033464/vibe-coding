import crypto from 'crypto';

const BASE_URL = 'https://api.meeting.qq.com';

function getCredentials() {
  const appId = process.env.TENCENT_MEETING_APP_ID;
  const secretId = process.env.TENCENT_MEETING_SECRET_ID;
  const secretKey = process.env.TENCENT_MEETING_SECRET_KEY;

  if (!appId || !secretId || !secretKey) {
    throw new Error('腾讯会议 API 凭证未配置，请在环境变量中设置 TENCENT_MEETING_APP_ID、TENCENT_MEETING_SECRET_ID、TENCENT_MEETING_SECRET_KEY');
  }

  return { appId, secretId, secretKey };
}

function generateSignature(
  secretKey: string,
  method: string,
  uri: string,
  queryString: string,
  body: string,
  timestamp: number,
  nonce: number
): string {
  const rawString = `${method}\napi.meeting.qq.com\n${uri}\n${queryString}\n${body}`;
  return crypto
    .createHmac('sha256', secretKey)
    .update(rawString)
    .digest()
    .toString('base64');
}

function getHeaders(method: string, uri: string, body: object = {}) {
  const { appId, secretId, secretKey } = getCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 100000) + 1;
  const bodyStr = JSON.stringify(body);
  const signature = generateSignature(secretKey, method, uri, '', bodyStr, timestamp, nonce);

  return {
    'X-TC-Key': secretId,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Nonce': String(nonce),
    'X-TC-Signature': signature,
    'AppId': appId,
    'Content-Type': 'application/json',
  };
}

/**
 * 解析回放链接中的 meeting_id
 * 支持格式：
 * - https://meeting.tencent.com/replay/xxx?meeting_id=yyy
 * - https://meeting.tencent.com/user-center/shared-record-detail?id=xxx&meeting_id=yyy
 * - 直接传入 meeting_id
 */
export function parseMeetingId(input: string): string {
  if (!input) throw new Error('请输入会议回放链接或会议 ID');

  // 尝试从 URL 中提取 meeting_id 参数
  try {
    if (input.startsWith('http')) {
      const url = new URL(input);
      const meetingId = url.searchParams.get('meeting_id');
      if (meetingId) return meetingId;

      // 从路径中提取（如 /replay/xxx 格式中 xxx 可能是 meeting_id）
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2 && pathParts[0] === 'replay') {
        return pathParts[1].split('?')[0];
      }
      if (pathParts.length >= 3 && pathParts[1] === 'shared-record-detail') {
        return pathParts[2].split('?')[0];
      }
    }
  } catch {
    // 不是 URL，当做纯 meeting_id 处理
  }

  // 当作纯 meeting_id
  if (input.length >= 6) return input;

  throw new Error('无法解析会议 ID，请提供有效的腾讯会议回放链接或会议 ID');
}

/**
 * 获取会议的录制列表
 */
export async function getMeetingRecordings(meetingId: string) {
  const uri = `/v1/meetings/${meetingId}/recordings`;
  const headers = getHeaders('GET', uri);
  const url = `${BASE_URL}${uri}?userid=me`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`获取录制列表失败 (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * 获取录制文件的智能纪要
 */
export async function getRecordingMinutes(recordFileId: string, operatorId: string = 'me') {
  const uri = `/v1/smart/minutes/${recordFileId}`;
  const queryString = `operator_id=${operatorId}&operator_id_type=1&minute_type=2&text_type=2`;
  const { secretKey, appId, secretId } = getCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 100000) + 1;
  const signature = generateSignature(secretKey, 'GET', uri, queryString, '', timestamp, nonce);

  const headers = {
    'X-TC-Key': secretId,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Nonce': String(nonce),
    'X-TC-Signature': signature,
    'AppId': appId,
    'Content-Type': 'application/json',
  };

  const url = `${BASE_URL}${uri}?${queryString}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`获取智能纪要失败 (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * 获取录制转写详情（段落级文字转写）
 */
export async function getRecordingTranscript(
  meetingId: string,
  recordFileId: string,
) {
  const uri = `/v1/records/transcripts/details`;
  const queryString = `meeting_id=${meetingId}&record_file_id=${recordFileId}&operator_id=me&operator_id_type=1`;
  const { secretKey, appId, secretId } = getCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 100000) + 1;
  const signature = generateSignature(secretKey, 'GET', uri, queryString, '', timestamp, nonce);

  const headers = {
    'X-TC-Key': secretId,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Nonce': String(nonce),
    'X-TC-Signature': signature,
    'AppId': appId,
    'Content-Type': 'application/json',
  };

  const url = `${BASE_URL}${uri}?${queryString}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`获取转写详情失败 (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * 查询会议详情
 */
export async function getMeetingInfo(meetingId: string) {
  const uri = `/v1/meetings/${meetingId}`;
  const headers = getHeaders('GET', uri);
  const url = `${BASE_URL}${uri}?userid=me`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`查询会议详情失败 (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * 一键提取会议纪要：输入回放链接/会议ID -> 获取录制列表 -> 获取转写+纪要
 */
export async function extractMeetingMinutes(input: string) {
  const meetingId = parseMeetingId(input);

  // 1. 查会议详情（验证会议存在）
  const meetingInfo = await getMeetingInfo(meetingId);

  // 2. 获取录制列表
  const recordings = await getMeetingRecordings(meetingId);

  // 3. 获取第一个录制的转写和智能纪要
  const recordFiles = recordings?.record_files || [];
  if (recordFiles.length === 0) {
    return {
      meetingId,
      meetingInfo: meetingInfo?.meeting_info || {},
      recordings: [],
      transcript: null,
      minutes: null,
      message: '该会议暂无录制文件',
    };
  }

  const firstRecord = recordFiles[0];
  let transcript = null;
  let minutes = null;

  try {
    transcript = await getRecordingTranscript(meetingId, firstRecord.record_file_id);
  } catch (e) {
    console.error('[TencentMeeting] 获取转写失败', e);
  }

  try {
    minutes = await getRecordingMinutes(firstRecord.record_file_id);
  } catch (e) {
    console.error('[TencentMeeting] 获取智能纪要失败', e);
  }

  return {
    meetingId,
    meetingInfo: meetingInfo?.meeting_info || {},
    recordings: recordFiles,
    transcript,
    minutes,
  };
}