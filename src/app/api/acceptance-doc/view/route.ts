import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { dbGetCustomerById } from '@/services/dbService';
import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: process.env.COZE_BUCKET_ACCESS_KEY || '',
  secretKey: process.env.COZE_BUCKET_SECRET_KEY || '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');

    if (!customerId) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    // 验证客户权限
    const customer = await dbGetCustomerById(customerId);
    if (!customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    if (!isAdmin && (customer as any).user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
    }

    const docKey = (customer as any).acceptance_doc_key;
    if (!docKey) {
      return NextResponse.json({ error: '未上传验收单', has_doc: false }, { status: 404 });
    }

    // 生成签名 URL
    const signedUrl = await storage.generatePresignedUrl({
      key: docKey,
      expireTime: 3600, // 1小时有效
    });

    return NextResponse.json({
      has_doc: true,
      url: signedUrl,
      file_key: docKey,
    });
  } catch (error) {
    console.error('获取验收单失败:', error);
    return NextResponse.json({ error: '获取验收单失败' }, { status: 500 });
  }
}
