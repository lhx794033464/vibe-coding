import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// 提交流程申请
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const formData = await request.formData();
    const type = formData.get('type') as string;
    const customerId = formData.get('customer_id') as string | null;
    const expectedDate = formData.get('expected_date') as string | null;
    const notes = formData.get('notes') as string | null;
    const file = formData.get('file') as File | null;

    if (!type) {
      return NextResponse.json({ error: '缺少申请类型' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    let kbcScreenshotKey: string | null = null;

    // 群聊解散需要上传KBC截图
    if (type === 'group_dismissal') {
      if (!file || !customerId) {
        return NextResponse.json({ error: '缺少KBC截图或客户ID' }, { status: 400 });
      }

      // 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json({ error: '仅支持上传图片(JPG/PNG/GIF/WebP)' }, { status: 400 });
      }

      // 验证文件大小
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: '文件大小不能超过20MB' }, { status: 400 });
      }

      // 检查是否已有待审批的申请
      const { data: existingApp } = await supabase
        .from('process_applications')
        .select('id')
        .eq('customer_id', customerId)
        .eq('type', 'group_dismissal')
        .eq('status', 'pending')
        .maybeSingle();

      if (existingApp) {
        return NextResponse.json({ error: '该客户已有待审批的解散申请' }, { status: 400 });
      }

      // 上传文件到对象存储
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split('.').pop() || 'png';
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 10);
      kbcScreenshotKey = `kbc-screenshots/${customerId}/${timestamp}_${randomStr}.${ext}`;

      const fileKey = await storage.uploadFile({
        fileContent: buffer,
        fileName: `kbc-screenshots/${customerId}/${timestamp}_${randomStr}.${ext}`,
        contentType: file.type,
      });
      kbcScreenshotKey = fileKey;
    }

    // 排期协调需要客户和期望日期
    if (type === 'schedule_coordination' && !customerId) {
      return NextResponse.json({ error: '排期协调需要选择客户' }, { status: 400 });
    }

    // 插入申请记录
    const { data, error } = await supabase
      .from('process_applications')
      .insert({
        type,
        applicant_id: userInfo.id,
        customer_id: customerId || null,
        kbc_screenshot_key: kbcScreenshotKey,
        expected_date: expectedDate || null,
        notes: notes || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[Process] Insert error:', error);
      return NextResponse.json({ error: '提交申请失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Process] Submit error:', error);
    return NextResponse.json({ error: '提交申请失败' }, { status: 500 });
  }
}

// 查询流程申请列表
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const supabase = getSupabaseClient();
    let query = supabase
      .from('process_applications')
      .select(`
        *,
        customers:customer_id (id, name),
        applicant:applicant_id (id, username)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (type) {
      query = query.eq('type', type);
    }

    // 管理员看所有，普通用户看自己的
    if (userInfo.role !== 'admin') {
      query = query.eq('applicant_id', userInfo.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Process] Query error:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    // 格式化返回数据
    const formatted = (data || []).map((item: Record<string, unknown>) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      customerName: (item.customers as Record<string, string>)?.name || null,
      applicantName: (item.applicant as Record<string, string>)?.username || '未知',
      kbcScreenshotKey: item.kbc_screenshot_key,
      expectedDate: item.expected_date,
      notes: item.notes,
      rejectReason: item.reject_reason,
      reviewerId: item.reviewer_id,
      reviewedAt: item.reviewed_at,
      createdAt: item.created_at,
    }));

    return NextResponse.json({ data: formatted });
  } catch (error) {
    console.error('[Process] List error:', error);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}
