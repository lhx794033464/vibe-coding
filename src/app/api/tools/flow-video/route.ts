import { NextRequest, NextResponse } from 'next/server';
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { prompt, duration = 5, ratio = '16:9' } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程描述' },
        { status: 400 }
      );
    }

    // 初始化视频生成客户端
    const config = new Config();
    const client = new VideoGenerationClient(config);

    // 构建视频生成提示词 - 侧重视觉动画效果，避免文字渲染
    const videoPrompt = `Professional business process animation: flowing particles and light streams connecting different stages, smooth transitions between workflow steps, modern corporate style with blue and white color scheme, clean geometric shapes representing process nodes, dynamic data flow visualization, cinematic camera movement, elegant motion graphics, no text or labels, abstract representation of business workflow.`;

    console.log('开始生成业务流程视频...');
    console.log('提示词:', videoPrompt);
    const startTime = Date.now();

    const content = [{ type: 'text' as const, text: videoPrompt }];
    
    const response = await client.videoGeneration(content, {
      model: 'doubao-seedance-2-0-pro-251015',
      duration: duration,
      ratio: ratio as '16:9' | '9:16' | '1:1',
      resolution: '720p',
      generateAudio: false,
    });

    const genDuration = Date.now() - startTime;
    console.log('视频生成完成，耗时:', genDuration, 'ms');

    if (!response.videoUrl) {
      return NextResponse.json(
        { error: '视频生成失败，请重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      videoUrl: response.videoUrl,
      duration: genDuration,
      taskInfo: {
        id: response.response.id,
        status: response.response.status,
        seed: response.response.seed,
      }
    });

  } catch (error) {
    console.error('生成视频错误:', error);
    return NextResponse.json(
      { 
        error: '视频生成失败',
        detail: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}
