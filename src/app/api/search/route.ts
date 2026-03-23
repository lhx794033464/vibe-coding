import { NextRequest, NextResponse } from 'next/server';
import { SearchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';

/**
 * 联网搜索API
 * 支持金蝶云星辰相关知识搜索
 */
export async function POST(request: NextRequest) {
  try {
    const { query, count = 5 } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: '搜索关键词不能为空' },
        { status: 400 }
      );
    }

    // 提取请求头并转发
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new SearchClient(config, customHeaders);

    // 先尝试在金蝶相关网站搜索
    let response = await client.advancedSearch(query, {
      searchType: 'web',
      count: Math.min(count, 10),
      needSummary: true,
      needContent: false,
      sites: 'kingdee.com,kisyun.com,cs.ecs.kingdee.com,club.kingdee.com',
    });

    // 如果没有结果，尝试更广泛的搜索（知名技术社区）
    if (!response.web_items || response.web_items.length === 0) {
      response = await client.advancedSearch(query, {
        searchType: 'web',
        count: Math.min(count, 10),
        needSummary: true,
        needContent: false,
        sites: 'zhihu.com,cnblogs.com,juejin.cn,csdn.net',
      });
    }

    // 如果还是没有结果，进行通用搜索
    if (!response.web_items || response.web_items.length === 0) {
      response = await client.webSearch(query, Math.min(count, 10), true);
    }

    // 格式化搜索结果
    const results = response.web_items?.map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      siteName: item.site_name,
      publishTime: item.publish_time,
    })) || [];

    return NextResponse.json({
      success: true,
      summary: response.summary || '',
      results,
    });
  } catch (error) {
    console.error('搜索API错误:', error);
    return NextResponse.json(
      { error: '搜索失败，请稍后重试' },
      { status: 500 }
    );
  }
}
