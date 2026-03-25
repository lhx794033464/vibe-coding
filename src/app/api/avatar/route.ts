import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 初始化对象存储
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 获取用户头像
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseClient(token);

    // 获取当前用户
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    // 直接查询 user_profiles 表
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 是 "没有找到数据" 的错误，可以忽略
      console.error('查询用户配置失败:', error);
      return NextResponse.json({ avatarUrl: null });
    }

    // 如果有头像key，生成签名URL
    let avatarUrl = null;
    if (profile?.avatar_url) {
      try {
        avatarUrl = await storage.generatePresignedUrl({
          key: profile.avatar_url,
          expireTime: 86400, // 1天有效期
        });
      } catch {
        console.error('生成签名URL失败');
        avatarUrl = null;
      }
    }

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    console.error('获取头像失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 上传头像
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseClient(token);

    // 获取当前用户
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    // 解析multipart/form-data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '未找到文件' }, { status: 400 });
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: '仅支持 JPG、PNG、GIF、WebP 格式' }, { status: 400 });
    }

    // 验证文件大小 (最大 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: '文件大小不能超过 2MB' }, { status: 400 });
    }

    // 读取文件内容
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 生成文件名
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `avatars/${user.id}_${Date.now()}.${ext}`;

    // 上传到对象存储
    const fileKey = await storage.uploadFile({
      fileContent: fileBuffer,
      fileName,
      contentType: file.type,
    });

    // 使用 upsert 更新或插入用户配置
    const { error: upsertError } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        avatar_url: fileKey,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('保存用户配置失败:', upsertError);
      return NextResponse.json({ error: '保存失败' }, { status: 500 });
    }

    // 生成签名URL返回
    const avatarUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400,
    });

    return NextResponse.json({ avatarUrl, avatarKey: fileKey });
  } catch (error) {
    console.error('上传头像失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
