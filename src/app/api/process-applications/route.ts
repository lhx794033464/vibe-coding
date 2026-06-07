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
    const customerIdsJson = formData.get('customer_ids') as string | null;
    const expectedDate = formData.get('expected_date') as string | null;
    const notes = formData.get('notes') as string | null;

    // 支持多文件
    const files: File[] = [];
    let idx = 0;
    while (true) {
      const file = formData.get(`file_${idx}`) as File | null;
      if (!file) break;
      files.push(file);
      idx++;
    }

    if (!type) {
      return NextResponse.json({ error: '缺少申请类型' }, { status: 400 });
    }

    let customerIds: string[] = [];
    try {
      customerIds = customerIdsJson ? JSON.parse(customerIdsJson) : [];
    } catch {
      customerIds = customerIdsJson ? [customerIdsJson] : [];
    }

    const supabase = getSupabaseClient();
    let kbcScreenshotKeys: string[] = [];

    // 群聊解散需要上传KBC截图
    if (type === 'group_dismissal') {
      if (files.length === 0 || customerIds.length === 0) {
        return NextResponse.json({ error: '缺少KBC截图或客户' }, { status: 400 });
      }

      // 校验客户是否已解散
      const { data: dismissedCustomers } = await supabase
        .from('customers')
        .select('id, name')
        .in('id', customerIds)
        .eq('dismissed', true);

      if (dismissedCustomers && dismissedCustomers.length > 0) {
        const names = dismissedCustomers.map(c => c.name).join('、');
        return NextResponse.json({ error: `${names} 已解散，无需申请` }, { status: 400 });
      }

      // 验证文件并上传
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
          return NextResponse.json({ error: '仅支持上传图片(JPG/PNG/GIF/WebP)' }, { status: 400 });
        }
        if (file.size > 20 * 1024 * 1024) {
          return NextResponse.json({ error: '文件大小不能超过20MB' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split('.').pop() || 'png';
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 10);
        const fileName = `kbc-screenshots/${timestamp}_${randomStr}.${ext}`;

        const fileKey = await storage.uploadFile({
          fileContent: buffer,
          fileName,
          contentType: file.type,
        });
        kbcScreenshotKeys.push(fileKey);
      }

      // 检查是否已有待审批的申请（任一客户已有待审批则拒绝）
      for (const cid of customerIds) {
        const { data: existingApp } = await supabase
          .from('process_applications')
          .select('id')
          .contains('customer_id', [cid])
          .eq('type', 'group_dismissal')
          .eq('status', 'pending')
          .maybeSingle();

        if (existingApp) {
          return NextResponse.json({ error: `客户已有待审批的解散申请` }, { status: 400 });
        }
      }
    }

    // 排期协调需要客户
    if (type === 'schedule_coordination' && customerIds.length === 0) {
      return NextResponse.json({ error: '排期协调需要选择客户' }, { status: 400 });
    }

    // 插入申请记录
    const { data, error } = await supabase
      .from('process_applications')
      .insert({
        type,
        applicant_id: userInfo.id,
        customer_id: JSON.stringify(customerIds),
        kbc_screenshot_key: kbcScreenshotKeys.length > 0 ? JSON.stringify(kbcScreenshotKeys) : null,
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
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      const statusList = status.split(',');
      if (statusList.length > 1) {
        query = query.in('status', statusList);
      } else {
        query = query.eq('status', status);
      }
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

    // 收集所有客户ID
    const allCustomerIds: string[] = [];
    for (const item of (data || [])) {
      try {
        const ids: string[] = JSON.parse(item.customer_id || '[]');
        allCustomerIds.push(...ids);
      } catch {
        if (item.customer_id) allCustomerIds.push(item.customer_id);
      }
    }

    // 批量查询客户名称
    const uniqueCustomerIds = [...new Set(allCustomerIds)];
    let customerMap: Record<string, string> = {};
    if (uniqueCustomerIds.length > 0) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, name')
        .in('id', uniqueCustomerIds);
      if (customerData) {
        for (const c of customerData) {
          customerMap[c.id] = c.name;
        }
      }
    }

    // 批量查询申请人名称
    const applicantIds = [...new Set((data || []).map((item: Record<string, unknown>) => item.applicant_id as string).filter(Boolean))];
    let applicantMap: Record<string, string> = {};
    if (applicantIds.length > 0) {
      const { data: applicantData } = await supabase
        .from('users')
        .select('id, username')
        .in('id', applicantIds);
      if (applicantData) {
        for (const a of applicantData) {
          applicantMap[a.id] = a.username;
        }
      }
    }

    // 格式化返回数据
    const formatted = (data || []).map((item: Record<string, unknown>) => {
      let customerIds: string[] = [];
      try {
        customerIds = JSON.parse((item.customer_id as string) || '[]');
      } catch {
        if (item.customer_id) customerIds = [item.customer_id as string];
      }

      let screenshotKeys: string[] = [];
      try {
        screenshotKeys = JSON.parse((item.kbc_screenshot_key as string) || '[]');
      } catch {
        if (item.kbc_screenshot_key) screenshotKeys = [item.kbc_screenshot_key as string];
      }

      const customerNames = customerIds.map(id => customerMap[id]).filter(Boolean);

      return {
        id: item.id,
        type: item.type,
        status: item.status,
        applicant_id: item.applicant_id,
        customerIds,
        customerNames,
        applicant_name: applicantMap[item.applicant_id as string] || '未知',
        kbcScreenshotKeys: screenshotKeys,
        expected_date: item.expected_date,
        notes: item.notes,
        reject_reason: item.reject_reason,
        reviewer_id: item.reviewer_id,
        reviewed_at: item.reviewed_at,
        created_at: item.created_at,
      };
    });

    return NextResponse.json({ data: formatted });
  } catch (error) {
    console.error('[Process] List error:', error);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}
