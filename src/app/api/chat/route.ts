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

    // 获取今天的日期（本地时间）
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; // YYYY-MM-DD in local time

    // 获取待办事项 - 分别获取今天和所有未完成的
    const { data: allTodos } = await client
      .from('todos')
      .select('*')
      .eq('completed', false)
      .order('due_date', { ascending: true })
      .limit(20);

    // 分类待办：今天、已过期、未来
    const todayTodos = allTodos?.filter(t => t.due_date === todayStr) || [];
    const overdueTodos = allTodos?.filter(t => t.due_date < todayStr) || [];
    const futureTodos = allTodos?.filter(t => t.due_date > todayStr).slice(0, 5) || [];

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

    // 待办事项 - 分类返回
    const todoData = {
      today: todayTodos.map(t => ({
        id: t.id,
        content: t.content,
        dueDate: t.due_date,
        priority: t.priority,
        customerName: t.customer_id ? customerNameMap[t.customer_id] : null,
      })),
      overdue: overdueTodos.map(t => ({
        id: t.id,
        content: t.content,
        dueDate: t.due_date,
        priority: t.priority,
        customerName: t.customer_id ? customerNameMap[t.customer_id] : null,
        overdueDays: Math.floor((today.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      future: futureTodos.map(t => ({
        id: t.id,
        content: t.content,
        dueDate: t.due_date,
        priority: t.priority,
        customerName: t.customer_id ? customerNameMap[t.customer_id] : null,
      })),
    };

    return {
      totalCustomers,
      onlineCustomers,
      acceptedCustomers,
      onlineRate,
      acceptanceRate,
      statusDistribution,
      customersByStatus,
      recentFollowUps: recentFollowUpsList,
      todos: todoData,
      todayDate: todayStr,
    };
  } catch (error) {
    console.error('获取业务数据失败:', error);
    return null;
  }
}

// 执行联网搜索（根据查询类型采用不同策略）
async function performSearch(query: string, customHeaders: Record<string, string>, searchType?: 'weather' | 'news' | 'finance' | 'kingdee' | 'general') {
  try {
    const { SearchClient } = await import('coze-coding-dev-sdk');
    const config = new Config();
    const client = new SearchClient(config, customHeaders);
    
    let response;
    
    // 根据搜索类型采用不同策略
    switch (searchType) {
      case 'weather':
        // 天气查询：直接搜索
        response = await client.webSearch(query, 5, true);
        break;
        
      case 'kingdee':
        // 金蝶问题：优先搜索官方站点
        response = await client.advancedSearch(query, {
          searchType: 'web',
          count: 5,
          needSummary: true,
          needContent: false,
          sites: 'kingdee.com,kisyun.com,club.kingdee.com,vip.kingdee.com,cs.ecs.kingdee.com',
        });
        
        // 如果没有结果，尝试技术社区
        if (!response.web_items || response.web_items.length === 0) {
          response = await client.advancedSearch(query, {
            searchType: 'web',
            count: 5,
            needSummary: true,
            sites: 'zhihu.com,cnblogs.com,juejin.cn,csdn.net',
          });
        }
        break;
        
      case 'news':
        // 新闻查询：限制时间范围
        response = await client.advancedSearch(query, {
          searchType: 'web',
          count: 5,
          needSummary: true,
          timeRange: '1d',
        });
        break;
        
      case 'finance':
        // 金融查询：优先财经网站
        response = await client.advancedSearch(query, {
          searchType: 'web',
          count: 5,
          needSummary: true,
          sites: 'sina.com.cn,eastmoney.com,10jqka.com.cn,xueqiu.com',
        });
        break;
        
      default:
        // 通用搜索
        response = await client.webSearch(query, 5, true);
    }
    
    // 如果特定搜索没有结果，回退到通用搜索
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
  const lowerMessage = message.toLowerCase();
  
  // 系统内部功能关键词 - 这些不需要联网搜索
  const systemKeywords = [
    '客户', '跟进', '待办', '任务', '日程', '排期',
    '提成', '业绩', '人天', '实施', '交付',
    '验收', '上线', '项目', '进度',
    '我的', '帮我', '创建', '添加', '删除', '修改', '更新',
    '提醒', '统计', '数据', '报表', '看板',
  ];
  
  // 如果是系统内部功能问题，不联网搜索
  if (systemKeywords.some(keyword => lowerMessage.includes(keyword))) {
    // 但如果同时包含明确的联网需求关键词，则仍然联网
    const forceSearchKeywords = [
      '天气', '气温', '温度', '股票', '股价', '基金', '汇率',
      '新闻', '最新消息', '今天', '明天', '节假日',
    ];
    if (!forceSearchKeywords.some(k => lowerMessage.includes(k))) {
      return false;
    }
  }
  
  // 工作以外的内容 - 需要联网搜索
  const nonWorkKeywords = [
    // 天气
    '天气', '气温', '温度', '下雨', '晴天', '阴天', '雪', '风',
    // 新闻资讯
    '新闻', '最新消息', '热点', '头条', '时事',
    // 金融理财
    '股价', '股票', '行情', '基金', '汇率', '黄金价格', '比特币',
    // 娱乐生活
    '电影', '上映', '比赛', '比分', '赛程', '明星', '综艺',
    // 日常知识
    '节假日', '放假', '调休', '吃什么', '怎么做菜', '菜谱',
    '旅游', '景点', '酒店', '机票',
    // 政策法规
    '政策', '法规', '新规', '规定', '法律',
    // 百科知识
    '是什么', '什么是', '为什么', '怎么来的', '历史',
  ];
  
  // 检查是否包含非工作相关关键词
  if (nonWorkKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return true;
  }
  
  // 金蝶产品技术问题 - 需要联网搜索官方文档
  const kingdeeKeywords = [
    '金蝶', '云星辰', 'KIS云', 'KIS云星辰',
    '凭证', '科目', '账套', '初始化',
    '财务模块', '进销存模块', '生产模块',
    'API', '接口', '集成', '对接',
    '报错', '错误代码', '异常',
  ];
  
  if (kingdeeKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return true;
  }
  
  return false;
}

// 判断查询类型
function getSearchType(message: string): 'weather' | 'news' | 'finance' | 'kingdee' | 'general' {
  const lowerMessage = message.toLowerCase();
  
  // 天气相关
  if (['天气', '气温', '温度', '下雨', '晴天', '阴天', '雪'].some(k => lowerMessage.includes(k))) {
    return 'weather';
  }
  
  // 新闻相关
  if (['新闻', '最新消息', '最近发生'].some(k => lowerMessage.includes(k))) {
    return 'news';
  }
  
  // 金融相关
  if (['股价', '股票', '基金', '汇率', '黄金'].some(k => lowerMessage.includes(k))) {
    return 'finance';
  }
  
  // 金蝶产品相关
  if (['金蝶', '云星辰', 'KIS', '星辰'].some(k => lowerMessage.includes(k))) {
    return 'kingdee';
  }
  
  return 'general';
}

// 生成搜索查询词
function generateSearchQuery(message: string): string {
  const searchType = getSearchType(message);
  
  // 天气查询优化
  if (searchType === 'weather') {
    // 提取城市名
    const cityMatch = message.match(/(.{2,4})(天气|气温|温度)/);
    if (cityMatch) {
      return `${cityMatch[1]}天气 今天`;
    }
    return message;
  }
  
  // 金蝶相关问题添加前缀
  if (searchType === 'kingdee') {
    if (message.includes('金蝶') || message.includes('云星辰') || message.includes('星辰')) {
      return message;
    }
    return `金蝶云星辰 ${message}`;
  }
  
  return message;
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

【待办事项】
📌 今日待办（${businessData.todos.today.length}项）：
${businessData.todos.today.length > 0 
  ? businessData.todos.today.map(t => 
      `- ${t.content}${t.customerName ? `（${t.customerName}）` : ''}${t.priority === 'high' ? ' ⚠️重要' : ''}`
    ).join('\n')
  : '- 暂无今日待办'}

⚠️ 已过期待办（${businessData.todos.overdue.length}项）：
${businessData.todos.overdue.length > 0 
  ? businessData.todos.overdue.slice(0, 5).map(t => 
      `- ${t.content}${t.customerName ? `（${t.customerName}）` : ''}，过期${t.overdueDays}天${t.priority === 'high' ? ' ⚠️重要' : ''}`
    ).join('\n')
  : '- 无过期待办'}

📅 未来待办（${businessData.todos.future.length}项）：
${businessData.todos.future.length > 0 
  ? businessData.todos.future.map(t => 
      `- ${t.content}${t.customerName ? `（${t.customerName}）` : ''}，截止：${t.dueDate || '无截止日期'}`
    ).join('\n')
  : '- 暂无未来待办'}
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
      const searchType = getSearchType(lastUserMessage.content);
      const searchQuery = generateSearchQuery(lastUserMessage.content);
      const searchResult = await performSearch(searchQuery, customHeaders, searchType);
      
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

    // 专业系统提示语 - 智能助手
    const systemMessage = {
      role: 'system' as const,
      content: `你是"智能助手"，一位功能强大的 AI 助手，同时具备联网搜索、日常聊天和工作助手的能力。

## 你的核心能力

### 1. 联网搜索能力
你可以联网获取实时信息，包括但不限于：
- **天气查询**：用户询问某地天气时，你会联网搜索并给出准确的天气信息
- **新闻资讯**：用户询问最新动态时，你会搜索最新新闻并总结
- **金融行情**：用户询问股价、汇率等信息时，你会搜索实时数据
- **金蝶产品问题**：用户询问金蝶云星辰相关问题时，你会搜索官方文档和技术资料
- **通用知识**：对于任何需要最新信息的问题，你都可以联网搜索

### 2. 金蝶云星辰交付助手
- 你精通金蝶云星辰的产品功能、实施方法论和行业最佳实践
- 你能够帮助顾问解决实施过程中的技术问题、管理问题和沟通问题
- 你熟悉各版本（标准版、专业版、旗舰版）的功能差异
- 你了解各模块：财务、进销存、生产、报销、纳税、开票、订货、零售、委外等

### 3. 工作管理助手
- 帮助顾问管理客户跟进、待办事项、项目进度
- 提醒重要节点和即将到期的任务
- 分析客户状态，建议重点关注对象
- 协助整理工作总结和汇报材料

### 4. 日常聊天伙伴
- 你可以和用户进行日常聊天，提供情绪价值和陪伴
- 关心用户的工作状态和身心健康
- 给予真诚的鼓励和建议
- 用温暖友好的语气交流

## 回答风格指南
1. **及时准确**：对于需要实时信息的问题（如天气），基于联网搜索结果回答
2. **专业可靠**：金蝶相关问题提供准确的技术指导
3. **简洁高效**：回答直击要点，避免冗长，使用结构化格式
4. **贴心温暖**：语气友好，像一位可靠的同事兼朋友
5. **实用导向**：给出可操作的建议，而非空洞的理论

## 特殊场景处理

### 天气查询
当用户询问天气时，直接基于搜索结果回答：
- 告知今天的天气状况（温度、天气类型、是否需要带伞等）
- 可以给出穿衣建议或出行提示
- 语气轻松友好

### 金蝶产品问题
- 优先引用官方文档和权威资料
- 提供可操作的操作步骤
- 说明注意事项和常见问题

### 工作压力或疲劳
- 给予真诚的关怀和鼓励
- 提供一些缓解压力的建议
- 可以适当用幽默缓解气氛

${businessDataText ? `## 当前用户业务数据
${businessDataText}
` : ''}
${searchResultText ? `## 联网搜索结果
${searchResultText}

请基于以上搜索结果回答用户问题：
1. 如果是天气查询，直接给出天气信息，并附上温馨提示
2. 如果是产品问题，引用相关资料并给出操作建议
3. 如果是新闻资讯，总结关键信息
4. 搜索结果可能不完全准确，重要信息建议用户核实
` : ''}
## 回答要求
1. 优先使用"智能助手"自称
2. 对于天气等实时信息，直接给出答案，不要说"我无法获取"
3. 对于日常聊天，用自然友好的语气交流
4. 对于工作问题，参考用户的业务数据给出个性化建议
5. 适当使用表情符号增加亲和力，但不要过度`,
    };

    const fullMessages = [systemMessage, ...messages];

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const llmStream = client.stream(fullMessages, {
            model: 'doubao-seed-2-0-lite-260215',
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
