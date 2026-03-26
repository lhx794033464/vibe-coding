import { NextRequest, NextResponse } from 'next/server';
import { ImageGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';

/**
 * 图像生成 API
 * 使用豆包2.0pro模型生成高质量图片
 */
export async function POST(request: NextRequest) {
  try {
    const { prompt, size = '2K' } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的图像描述' },
        { status: 400 }
      );
    }

    // 提取请求头并转发
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    
    // 指定使用豆包2.0pro模型
    const headersWithModel = {
      ...customHeaders,
      'x-model': 'doubao-2.0-pro',
    };

    const config = new Config();
    const client = new ImageGenerationClient(config, headersWithModel);

    const response = await client.generate({
      prompt,
      size: size as '2K' | '4K',
    });

    const helper = client.getResponseHelper(response);

    if (helper.success) {
      return NextResponse.json({
        success: true,
        imageUrls: helper.imageUrls,
      });
    } else {
      return NextResponse.json(
        { error: helper.errorMessages.join(', ') || '图像生成失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('图像生成错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
