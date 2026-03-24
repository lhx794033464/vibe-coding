import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';

// 状态标签映射
const STATUS_LABELS: Record<string, string> = {
  not_online: '未上线',
  online_not_accepted: '已上线未验收',
  accepted: '已验收',
  not_going_online: '不上线',
  delayed_online: '延期上线',
  partially_online: '部分上线',
};

// 版本标签映射
const VERSION_LABELS: Record<string, string> = {
  standard: '标准版',
  professional: '专业版',
  flagship: '旗舰版',
};

// 获取用户业务数据
async function getUserBusinessData(token: string, userId: string) {
  const client = getSupabaseClient(token);
  
  try {
    // 获取所有客户
    const { data: customers } = await client
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    // 获取最近的跟进记录
    const { data: recentFollowUps } = await client
      .from('follow_up_records')
      .select('id, customer_id, content, follow_up_at')
      .order('follow_up_at', { ascending: false })
      .limit(10);

    // 获取待办事项
    const { data: todos } = await client
      .from('todos')
      .select('*')
      .eq('completed', false)
      .order('due_date', { ascending: true })
      .limit(10);

    // 创建客户ID到名称的映射
    const customerNameMap: Record<string, string> = {};
    customers?.forEach(c => {
      customerNameMap[c.id] = c.name;
    });

    // 计算统计数据
    const totalCustomers = customers?.length || 0;
    const onlineStatuses = ['accepted', 'online_not_accepted', 'partially_online'];
    const onlineCustomers = customers?.filter(c => onlineStatuses.includes(c.status)).length || 0;
    const acceptedCustomers = customers?.filter(c => c.status === 'accepted').length || 0;
    const onlineRate = totalCustomers > 0 ? (onlineCustomers / totalCustomers * 100).toFixed(1) : '0';
    const acceptanceRate = totalCustomers > 0 ? (acceptedCustomers / totalCustomers * 100).toFixed(1) : '0';

    // 状态分布
    const statusDistribution: Record<string, number> = {
      not_online: 0,
      online_not_accepted: 0,
      accepted: 0,
      not_going_online: 0,
      delayed_online: 0,
      partially_online: 0,
    };
    customers?.forEach(c => {
      if (statusDistribution.hasOwnProperty(c.status)) {
        statusDistribution[c.status]++;
      }
    });

    // 按状态分类客户
    const customersByStatus = {
      notOnline: customers?.filter(c => c.status === 'not_online').slice(0, 5).map(c => ({
        name: c.name,
        days: c.implementation_days,
        version: c.version ? VERSION_LABELS[c.version] : null,
      })) || [],
      onlineNotAccepted: customers?.filter(c => c.status === 'online_not_accepted').slice(0, 5).map(c => ({
        name: c.name,
        days: c.implementation_days,
      })) || [],
      accepted: customers?.filter(c => c.status === 'accepted').slice(0, 5).map(c => ({
        name: c.name,
        days: c.implementation_days,
      })) || [],
      delayedOnline: customers?.filter(c => c.status === 'delayed_online').slice(0, 5).map(c => ({
        name: c.name,
        days: c.implementation_days,
      })) || [],
    };

    // 最近跟进
    const recentFollowUpsList = recentFollowUps?.map(f => ({
      customerName: customerNameMap[f.customer_id] || '未知客户',
      content: f.content,
      date: f.follow_up_at,
    })) || [];

    // 待办事项
    const todoList = todos?.map(t => ({
      content: t.content,
      dueDate: t.due_date,
      priority: t.priority,
      customerName: t.customer_id ? customerNameMap[t.customer_id] : null,
    })) || [];

    return {
      totalCustomers,
      onlineCustomers,
      acceptedCustomers,
      onlineRate,
      acceptanceRate,
      statusDistribution,
      customersByStatus,
      recentFollowUps: recentFollowUpsList,
      todos: todoList,
    };
  } catch (error) {
    console.error('获取业务数据失败:', error);
    return null;
  }
}

// 执行联网搜索（渐进式搜索策略）
async function performSearch(query: string, customHeaders: Record<string, string>) {
  try {
    const { SearchClient } = await import('coze-coding-dev-sdk');
    const config = new Config();
    const client = new SearchClient(config, customHeaders);
    
    // 先尝试在金蝶相关网站搜索
    let response = await client.advancedSearch(query, {
      searchType: 'web',
      count: 5,
      needSummary: true,
      needContent: false,
      sites: 'kingdee.com,kisyun.com,cs.ecs.kingdee.com,club.kingdee.com,vip.kingdee.com',
    });

    // 如果没有结果，尝试更广泛的搜索（知名技术社区）
    if (!response.web_items || response.web_items.length === 0) {
      response = await client.advancedSearch(query, {
        searchType: 'web',
        count: 5,
        needSummary: true,
        needContent: false,
        sites: 'zhihu.com,cnblogs.com,juejin.cn,csdn.net',
      });
    }

    // 如果还是没有结果，进行通用搜索
    if (!response.web_items || response.web_items.length === 0) {
      response = await client.webSearch(query, 5, true);
    }

    return {
      summary: response.summary || '',
      results: response.web_items?.map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        siteName: item.site_name,
      })) || [],
    };
  } catch (error) {
    console.error('联网搜索失败:', error);
    return null;
  }
}

// 判断是否需要联网搜索
function needsWebSearch(message: string): boolean {
  const keywords = [
    '金蝶', '云星辰', '星辰', 'KIS云', 'KIS',
    '怎么', '如何', '方法', '步骤', '教程',
    '操作', '设置', '配置', '功能', '模块',
    '问题', '错误', '报错', '解决', '修复',
    '新功能', '更新', '版本', '升级',
    '财务', '进销存', '生产', '报销', '纳税', '开票',
    '凭证', '科目', '报表', '账套', '初始化',
    'API', '接口', '集成', '对接',
  ];
  
  const lowerMessage = message.toLowerCase();
  return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

// 生成搜索查询词
function generateSearchQuery(message: string): string {
  // 提取关键信息生成搜索词
  const prefix = '金蝶云星辰';
  
  // 如果已经包含金蝶相关词，直接使用原消息
  if (message.includes('金蝶') || message.includes('云星辰') || message.includes('星辰')) {
    return message;
  }
  
  // 否则添加前缀
  return `${prefix} ${message}`;
}

export async function POST(request: NextRequest) {
  try {
    const { messages, enableSearch } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: '消息格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取用户token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    
    let businessDataText = '';
    let searchResultText = '';
    
    if (token) {
      try {
        const client = getSupabaseClient(token);
        const { data: { user } } = await client.auth.getUser(token);
        
        if (user) {
          const businessData = await getUserBusinessData(token, user.id);
          
          if (businessData) {
            const now = new Date();
            const todayStr = now.toLocaleDateString('zh-CN', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              weekday: 'long'
            });

            businessDataText = `
【当前时间和日期】
今天是 ${todayStr}

【客户数据概览】
- 客户总数：${businessData.totalCustomers} 家
- 已上线客户：${businessData.onlineCustomers} 家（上线率 ${businessData.onlineRate}%）
- 已验收客户：${businessData.acceptedCustomers} 家（验收率 ${businessData.acceptanceRate}%）

【客户状态分布】
- 未上线：${businessData.statusDistribution.not_online} 家
- 已上线未验收：${businessData.statusDistribution.online_not_accepted} 家
- 已验收：${businessData.statusDistribution.accepted} 家
- 延期上线：${businessData.statusDistribution.delayed_online} 家
- 部分上线：${businessData.statusDistribution.partially_online} 家
- 不上线：${businessData.statusDistribution.not_going_online} 家

【未上线客户】（最多显示5家）
${businessData.customersByStatus.notOnline.map(c => 
  `- ${c.name}${c.version ? `（${c.version}）` : ''}，实施人天：${c.days || '未设置'}`
).join('\n') || '- 暂无'}

【已上线未验收客户】（最多显示5家）
${businessData.customersByStatus.onlineNotAccepted.map(c => 
  `- ${c.name}，实施人天：${c.days || '未设置'}`
).join('\n') || '- 暂无'}

【延期上线客户】（最多显示5家）
${businessData.customersByStatus.delayedOnline.map(c => 
  `- ${c.name}，实施人天：${c.days || '未设置'}`
).join('\n') || '- 暂无'}

【最近跟进记录】（最多显示5条）
${businessData.recentFollowUps.slice(0, 5).map(f => 
  `- ${f.customerName}：${f.content.substring(0, 50)}${f.content.length > 50 ? '...' : ''}`
).join('\n') || '- 暂无'}

【待办事项】（最多显示5条）
${businessData.todos.slice(0, 5).map(t => 
  `- ${t.content}${t.customerName ? `（${t.customerName}）` : ''}，截止：${t.dueDate || '无截止日期'}`
).join('\n') || '- 暂无'}
`;
          }
        }
      } catch (e) {
        console.error('获取用户数据失败:', e);
      }
    }

    // 获取最后一条用户消息
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    
    // 判断是否需要联网搜索
    if (lastUserMessage && (enableSearch || needsWebSearch(lastUserMessage.content))) {
      const searchQuery = generateSearchQuery(lastUserMessage.content);
      const searchResult = await performSearch(searchQuery, customHeaders);
      
      if (searchResult && searchResult.results.length > 0) {
        searchResultText = `
【联网搜索结果：${searchQuery}】

${searchResult.summary ? `摘要：${searchResult.summary}\n` : ''}
相关链接：
${searchResult.results.map((r, i) => 
  `${i + 1}. ${r.title}
   来源：${r.siteName || '未知'}
   摘要：${r.snippet?.substring(0, 100) || '无'}${r.snippet && r.snippet.length > 100 ? '...' : ''}`
).join('\n')}
`;
      }
    }

    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 专业系统提示语 - 金蝶云星辰交付助手
    const systemMessage = {
      role: 'system' as const,
      content: `你是"智能助手"，一位专业的金蝶云星辰实施顾问交付助手。你由金蝶云星辰实施顾问团队打造，专门服务于金蝶云星辰的实施顾问们。

## 你的身份与定位
- 你是金蝶云星辰实施顾问的智能助手和贴心伙伴
- 你精通金蝶云星辰的产品功能、实施方法论和行业最佳实践
- 你能够帮助顾问解决实施过程中的技术问题、管理问题和沟通问题
- 你也是顾问的日常工作助手，帮助管理工作任务和客户关系

## 你的核心能力

### 1. 产品知识专家
- 精通金蝶云星辰各版本（标准版、专业版、旗舰版）的功能差异
- 熟悉各模块：财务、进销存、生产、报销、纳税、开票、订货、零售、委外等
- 了解产品更新动态和新功能发布
- 能够解答产品操作、配置、流程设计等问题

### 2. 实施方法论顾问
- 掌握项目实施的标准流程和最佳实践
- 能够提供项目排期、里程碑设置、风险控制等建议
- 熟悉数据迁移、系统初始化、用户培训等关键环节
- 能够针对不同行业提供定制化实施方案

### 3. 问题解决专家
- 善于分析问题根因，提供系统化的解决方案
- 能够指导用户排查常见错误和异常情况
- 了解金蝶官方技术支持渠道和资源
- 能够判断问题优先级，建议处理顺序

### 4. 工作管理助手
- 帮助顾问管理客户跟进、待办事项、项目进度
- 提醒重要节点和即将到期的任务
- 分析客户状态，建议重点关注对象
- 协助整理工作总结和汇报材料

## 回答风格指南
1. **专业准确**：提供的信息必须准确可靠，不确定时要明确说明
2. **简洁高效**：回答直击要点，避免冗长，使用结构化格式（列表、分点）
3. **贴心温暖**：语气友好，像一位经验丰富的同事在帮忙
4. **实用导向**：给出可操作的建议，而非空洞的理论
5. **主动关怀**：适时提醒注意事项和潜在风险

## 特殊情况处理
- 如果问题超出你的知识范围，诚实地说明，并建议查询官方文档或联系技术支持
- 如果需要最新信息（如新版本功能），告诉用户你可能需要联网搜索获取最新答案
- 对于紧急问题，建议优先联系金蝶官方技术支持

${businessDataText ? `## 当前用户业务数据
${businessDataText}
` : ''}
${searchResultText ? `## 联网搜索结果
${searchResultText}

请结合以上搜索结果回答用户问题，如果搜索结果有帮助，可以引用相关内容。
` : ''}
## 回答要求
1. 优先使用"智能助手"自称
2. 回答与金蝶云星辰相关问题时，尽可能详细和专业
3. 对于工作管理类问题，参考用户的业务数据给出个性化建议
4. 如果用户提到压力或疲劳，给予真诚的鼓励和关怀
5. 适当使用表情符号增加亲和力，但不要过度`,
    };

    const fullMessages = [systemMessage, ...messages];

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const llmStream = client.stream(fullMessages, {
            model: 'deepseek-v3-2-251201',
            temperature: 0.7,
          });

          for await (const chunk of llmStream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (error) {
          console.error('LLM流式输出错误:', error);
          controller.enqueue(encoder.encode('抱歉，我遇到了一些问题，请稍后再试。如果问题持续，可以联系金蝶官方技术支持。'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('对话API错误:', error);
    return new Response(JSON.stringify({ error: '服务器错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
