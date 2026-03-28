import { NextRequest, NextResponse } from 'next/server';
import { getFlowChartStats, recordFlowChartGenerated, resetFlowChartStats } from '@/services/globalStats';

/**
 * 获取流程图生成统计
 * GET /api/tools/flow-chart/stats
 */
export async function GET(_request: NextRequest) {
  try {
    const stats = getFlowChartStats();
    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('获取流程图统计失败:', error);
    return NextResponse.json(
      { error: '获取统计失败' },
      { status: 500 }
    );
  }
}

/**
 * 记录流程图生成（内部调用）
 * POST /api/tools/flow-chart/stats
 * 
 * Body:
 * - action: 'record' | 'reset'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'record') {
      const stats = recordFlowChartGenerated();
      return NextResponse.json({
        success: true,
        data: stats,
      });
    }

    if (action === 'reset') {
      const stats = resetFlowChartStats();
      return NextResponse.json({
        success: true,
        data: stats,
      });
    }

    return NextResponse.json(
      { error: '无效的操作类型' },
      { status: 400 }
    );
  } catch (error) {
    console.error('更新流程图统计失败:', error);
    return NextResponse.json(
      { error: '更新统计失败' },
      { status: 500 }
    );
  }
}
