import { NextRequest, NextResponse } from 'next/server';
import { TTSClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 语音合成API
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { text, uid, speaker } = body;

    if (!text) {
      return NextResponse.json({ error: '缺少文本内容' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new TTSClient(config, customHeaders);

    const response = await client.synthesize({
      uid: uid || 'voice-assistant',
      text,
      speaker: speaker || 'zh_female_xiaohe_uranus_bigtts',
      audioFormat: 'mp3',
      sampleRate: 24000,
    });

    return NextResponse.json({ 
      audioUri: response.audioUri,
      audioSize: response.audioSize,
    });
  } catch (error) {
    console.error('语音合成失败:', error);
    return NextResponse.json({ error: '语音合成失败' }, { status: 500 });
  }
}
