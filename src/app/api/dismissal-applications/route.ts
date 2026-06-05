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

// 提交解散申请
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const customerId = formData.get('customer_id') as string | null;

    if (!file || !customerId) {
      return NextResponse.json({ error: '缺少KBC截图或客户ID' }, { status: 400 });
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: '仅支持上传图片(JPG/PNG/GIF/WebP)' }, { status: 400 });
    }

    // 验证文件大小（最大20MB）
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '文件大小不能超过20MB' }, { status: 400 });
    }

    // 检查是否已有待审批的申请
    const supabase = getSupabaseClient();
    const { data: existingApp } = await supabase
      .from('dismissal_applications')
      .select('id')
      .eq('customer_id', customerId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingApp) {
      return NextResponse.json({ error: '该客户已有待审批的解散申请' }, { status: 400 });
    }

    // 上传KBC截图到对象存储
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `kbc-screenshots/${customerId}/${Date.now()}.${ext}`;

    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    // 创建解散申请
    const { data, error } = await supabase
      .from('dismissal_applications')
      .insert({
        customer_id: customerId,
        applicant_id: userInfo.id,
        kbc_screenshot_key: fileKey,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('创建解散申请失败:', error);
      return NextResponse.json({ error: '创建解散申请失败' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('提交解散申请失败:', error);
    return NextResponse.json({ error: '提交解散申请失败' }, { status: 500 });
  }
}

// 获取解散申请列表
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('dismissal_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    // 非管理员只能看自己的申请
    if (userInfo.role !== 'admin') {
      query = query.eq('applicant_id', userInfo.id);
    }

    const { data: applications, error } = await query;

    if (error) {
      console.error('获取解散申请列表失败:', error);
      return NextResponse.json({ error: '获取解散申请列表失败' }, { status: 500 });
    }

    if (!applications || applications.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 批量获取关联数据
    const customerIds = [...new Set(applications.map((a: any) => a.customer_id))];
    const applicantIds = [...new Set(applications.map((a: any) => a.applicant_id))];
    const reviewerIds = [...new Set(applications.filter((a: any) => a.reviewer_id).map((a: any) => a.reviewer_id))];

    const [customersResult, applicantsResult, reviewersResult] = await Promise.all([
      supabase.from('customers').select('id, name, delivery_consultant, delivery_deadline, dismissed').in('id', customerIds),
      supabase.from('users').select('id, username, role').in('id', applicantIds),
      reviewerIds.length > 0
        ? supabase.from('users').select('id, username').in('id', reviewerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const customerMap = new Map((customersResult.data || []).map((c: any) => [c.id, c]));
    const applicantMap = new Map((applicantsResult.data || []).map((u: any) => [u.id, u]));
    const reviewerMap = new Map((reviewersResult.data || []).map((u: any) => [u.id, u]));

    const enrichedApplications = applications.map((app: any) => ({
      ...app,
      customer: customerMap.get(app.customer_id) || null,
      applicant: applicantMap.get(app.applicant_id) || null,
      reviewer: reviewerMap.get(app.reviewer_id) || null,
    }));

    return NextResponse.json({ data: enrichedApplications });
  } catch (error) {
    console.error('获取解散申请列表失败:', error);
    return NextResponse.json({ error: '获取解散申请列表失败' }, { status: 500 });
  }
}
