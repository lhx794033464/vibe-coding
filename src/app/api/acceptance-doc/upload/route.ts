import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { dbGetCustomerById } from '@/services/dbService';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const customerId = formData.get('customer_id') as string | null;

    if (!file || !customerId) {
      return NextResponse.json({ error: '缺少文件或客户ID' }, { status: 400 });
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: '仅支持上传图片(JPG/PNG/GIF/WebP)或PDF文件' }, { status: 400 });
    }

    // 验证文件大小（最大20MB）
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '文件大小不能超过20MB' }, { status: 400 });
    }

    // 验证客户权限
    const customer = await dbGetCustomerById(customerId);
    if (!customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    if (!isAdmin && (customer as any).user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
    }

    // 上传文件到对象存储
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'pdf';
    const fileName = `acceptance-docs/${customerId}/${Date.now()}.${ext}`;

    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    // 如果之前有验收单，删除旧文件
    const oldDocKey = (customer as any).acceptance_doc_key;
    if (oldDocKey) {
      try {
        await storage.deleteFile({ fileKey: oldDocKey });
      } catch (deleteErr) {
        console.error('[acceptance-doc] 删除旧验收单失败:', deleteErr);
      }
    }

    // 更新数据库，存储 key
    const supabase = getSupabaseClient();
    await supabase
      .from('customers')
      .update({ acceptance_doc_key: fileKey })
      .eq('id', customerId);

    return NextResponse.json({
      success: true,
      message: '验收单上传成功',
      file_key: fileKey,
    });
  } catch (error) {
    console.error('上传验收单失败:', error);
    return NextResponse.json({ error: '上传验收单失败' }, { status: 500 });
  }
}
