import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// 获取KBC截图的签名URL
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: '缺少文件key' }, { status: 400 });
    }

    const url = await storage.generatePresignedUrl({
      key,
      expireTime: 3600, // 1小时有效
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error('获取KBC截图URL失败:', error);
    return NextResponse.json({ error: '获取KBC截图URL失败' }, { status: 500 });
  }
}
