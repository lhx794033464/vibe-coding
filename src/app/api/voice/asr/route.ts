import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 语音识别API
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { audioUrl, base64Data, uid } = body;

    if (!audioUrl && !base64Data) {
      return NextResponse.json({ error: '缺少音频数据' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new ASRClient(config, customHeaders);

    const result = await client.recognize({
      uid: uid || 'voice-assistant',
      url: audioUrl,
      base64Data: base64Data,
    });

    return NextResponse.json({ 
      text: result.text,
      duration: result.duration,
    });
  } catch (error) {
    console.error('语音识别失败:', error);
    return NextResponse.json({ error: '语音识别失败' }, { status: 500 });
  }
}
