import { NextRequest } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { 
  customersStorage, 
  todosStorage, 
  schedulesStorage, 
  followUpsStorage 
} from '@/services/localStorage';

export const runtime = 'nodejs';

// Coze Agent API Endpoint
const COZE_AGENT_URL = process.env.COZE_AGENT_URL || 'https://9xfg5j4czg.coze.site/stream_run';
const COZE_API_TOKEN = process.env.COZE_API_KEY || ''; // 使用 token 作为认证

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

// 获取用户业务数据（本地存储模式）
async function getUserBusinessData(userId: string) {
  try {
    // 获取所有客户
    const customers = customersStorage.getAll();

    // 获取最近的跟进记录
    const allFollowUps = followUpsStorage.getAll();
    const recentFollowUps = allFollowUps
      .sort((a: any, b: any) => new Date(b.follow_up_at).getTime() - new Date(a.follow_up_at).getTime())
      .slice(0, 10);

    // 获取今天的日期（北京时间 UTC+8）
    const now = new Date();
    const beijingFormatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const beijingParts = beijingFormatter.formatToParts(now);
    const yearPart = beijingParts.find(p => p.type === 'year')?.value || '';
    const monthPart = beijingParts.find(p => p.type === 'month')?.value || '';
    const dayPart = beijingParts.find(p => p.type === 'day')?.value || '';
    const todayStr = `${yearPart}-${monthPart}-${dayPart}`;

    console.log('当前北京时间日期:', todayStr, '原始UTC时间:', now.toISOString());

    // 辅助函数：从日期时间字符串中提取日期部分
    const getDatePart = (dateStr: string | null): string => {
      if (!dateStr) return '';
      const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : dateStr.substring(0, 10);
    };

    // 获取待办事项
    const allTodos = todosStorage.getAll().filter((t: any) => !t.completed);

    console.log('待办原始查询结果:', {
      userId,
      allTodosCount: allTodos?.length || 0,
    });

    // 分类待办：今天、已过期、未来
    const todayTodos = allTodos?.filter((t: any) => {
      const datePart = getDatePart(t.due_date);
      return datePart === todayStr;
    }) || [];
    const overdueTodos = allTodos?.filter((t: any) => {
      const datePart = getDatePart(t.due_date);
      return datePart && datePart < todayStr;
    }) || [];
    const futureTodos = allTodos?.filter((t: any) => {
      const datePart = getDatePart(t.due_date);
      return datePart && datePart > todayStr;
    }).slice(0, 5) || [];

    // 获取日程排期
    const todayBeijingStart = new Date(`${todayStr}T00:00:00+08:00`);
    const todayBeijingEnd = new Date(`${todayStr}T23:59:59+08:00`);
    
    const nextWeekDate = new Date(todayBeijingStart);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeekStr = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(nextWeekDate).reduce((acc: any, part) => {
      if (part.type === 'year') acc.year = part.value;
      if (part.type === 'month') acc.month = part.value;
      if (part.type === 'day') acc.day = part.value;
      return acc;
    }, { year: '', month: '', day: '' });
    const nextWeekDateStr = `${nextWeekStr.year}-${nextWeekStr.month}-${nextWeekStr.day}`;
    const nextWeekBeijingEnd = new Date(`${nextWeekDateStr}T23:59:59+08:00`);

    const allSchedules = schedulesStorage.getAll();
    const schedules = allSchedules.filter((s: any) => {
      const scheduleDate = new Date(s.schedule_date);
      return scheduleDate >= todayBeijingStart && scheduleDate <= nextWeekBeijingEnd;
    }).sort((a: any, b: any) => new Date(a.schedule_date).getTime() - new Date(b.schedule_date).getTime());

    // 分类日程
    const todaySchedules = schedules?.filter((s: any) => {
      const scheduleDate = getDatePart(s.schedule_date);
      return scheduleDate === todayStr;
    }) || [];
    const futureSchedules = schedules?.filter((s: any) => {
      const scheduleDate = getDatePart(s.schedule_date);
      return scheduleDate && scheduleDate > todayStr;
    }) || [];

    // 创建客户ID到名称的映射
    const customerNameMap: Record<string, string> = {};
    customers?.forEach((c: any) => {
      customerNameMap[c.id] = c.name;
    });

    // 计算统计数据
    const totalCustomers = customers?.length || 0;
    const onlineStatuses = ['accepted', 'online_not_accepted', 'partially_online'];
    const onlineCustomers = customers?.filter((c: any) => onlineStatuses.includes(c.status)).length || 0;
    const acceptedCustomers = customers?.filter((c: any) => c.status === 'accepted').length || 0;
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
    customers?.forEach((c: any) => {
      if (statusDistribution.hasOwnProperty(c.status)) {
        statusDistribution[c.status]++;
      }
    });

    // 按状态分类客户
    const customersByStatus = {
      notOnline: customers?.filter((c: any) => c.status === 'not_online').slice(0, 5).map((c: any) => ({
        name: c.name,
        days: c.implementation_days,
        version: c.version ? VERSION_LABELS[c.version] : null,
      })) || [],
      onlineNotAccepted: customers?.filter((c: any) => c.status === 'online_not_accepted').slice(0, 5).map((c: any) => ({
        name: c.name,
        days: c.implementation_days,
      })) || [],
      accepted: customers?.filter((c: any) => c.status === 'accepted').slice(0, 5).map((c: any) => ({
        name: c.name,
        days: c.implementation_days,
      })) || [],
      delayedOnline: customers?.filter((c: any) => c.status === 'delayed_online').slice(0, 5).map((c: any) => ({
        name: c.name,
        days: c.implementation_days,
      })) || [],
    };

    // 最近跟进
    const recentFollowUpsList = recentFollowUps?.map((f: any) => ({
      customerName: customerNameMap[f.customer_id] || '未知客户',
      content: f.content,
      date: f.follow_up_at,
    })) || [];

    // 待办事项
    const todoData = {
      today: todayTodos.map((t: any) => ({
        id: t.id,
        content: t.content,
        dueDate: t.due_date,
        priority: t.priority,
        customerName: t.customer_id ? customerNameMap[t.customer_id] : null,
      })),
      overdue: overdueTodos.map((t: any) => ({
        id: t.id,
        content: t.content,
        dueDate: t.due_date,
        priority: t.priority,
        customerName: t.customer_id ? customerNameMap[t.customer_id] : null,
        overdueDays: Math.floor((now.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      future: futureTodos.map((t: any) => ({
        id: t.id,
        content: t.content,
        dueDate: t.due_date,
        priority: t.priority,
        customerName: t.customer_id ? customerNameMap[t.customer_id] : null,
      })),
    };

    // 日程排期
    const scheduleData = {
      today: todaySchedules.map((s: any) => ({
        id: s.id,
        customerName: s.customer_id ? customerNameMap[s.customer_id] : '未知客户',
        notes: s.notes,
      })),
      future: futureSchedules.map((s: any) => ({
        id: s.id,
        customerName: s.customer_id ? customerNameMap[s.customer_id] : '未知客户',
        scheduleDate: s.schedule_date,
        notes: s.notes,
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
      schedules: scheduleData,
      todayDate: todayStr,
    };
  } catch (error) {
    console.error('获取业务数据失败:', error);
    return null;
  }
}

// 执行联网搜索（简化版，直接返回 null，后续可接入搜索 API）
async function performSearch(query: string, customHeaders: Record<string, string>, searchType?: 'weather' | 'news' | 'finance' | 'kingdee' | 'general') {
  // 暂时禁用联网搜索，可通过 Coze 智能体的内置搜索能力实现
  console.log('联网搜索请求:', query, '类型:', searchType);
  return null;
}

// 判断是否需要联网搜索
function needsWebSearch(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  const systemKeywords = [
    '客户', '跟进', '待办', '任务', '日程', '排期',
    '提成', '业绩', '人天', '实施', '交付',
    '验收', '上线', '项目', '进度',
    '我的', '帮我', '创建', '添加', '删除', '修改', '更新',
    '提醒', '统计', '数据', '报表', '看板',
  ];
  
  if (systemKeywords.some(keyword => lowerMessage.includes(keyword))) {
    const forceSearchKeywords = [
      '天气', '气温', '温度', '股票', '股价', '基金', '汇率',
      '新闻', '最新消息', '今天', '明天', '节假日',
    ];
    if (!forceSearchKeywords.some(k => lowerMessage.includes(k))) {
      return false;
    }
  }
  
  const nonWorkKeywords = [
    '天气', '气温', '温度', '下雨', '晴天', '阴天', '雪', '风',
    '新闻', '最新消息', '热点', '头条', '时事',
    '股价', '股票', '行情', '基金', '汇率', '黄金价格', '比特币',
    '电影', '上映', '比赛', '比分', '赛程', '明星', '综艺',
    '节假日', '放假', '调休', '吃什么', '怎么做菜', '菜谱',
    '旅游', '景点', '酒店', '机票',
    '政策', '法规', '新规', '规定', '法律',
    '是什么', '什么是', '为什么', '怎么来的', '历史',
  ];
  
  if (nonWorkKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return true;
  }
  
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
  
  if (['天气', '气温', '温度', '下雨', '晴天', '阴天', '雪'].some(k => lowerMessage.includes(k))) {
    return 'weather';
  }
  
  if (['新闻', '最新消息', '最近发生'].some(k => lowerMessage.includes(k))) {
    return 'news';
  }
  
  if (['股价', '股票', '基金', '汇率', '黄金'].some(k => lowerMessage.includes(k))) {
    return 'finance';
  }
  
  if (['金蝶', '云星辰', 'KIS', '星辰'].some(k => lowerMessage.includes(k))) {
    return 'kingdee';
  }
  
  return 'general';
}

// 生成搜索查询词
function generateSearchQuery(message: string): string {
  const searchType = getSearchType(message);
  
  if (searchType === 'weather') {
    const cityMatch = message.match(/(.{2,4})(天气|气温|温度)/);
    if (cityMatch) {
      return `${cityMatch[1]}天气 今天`;
    }
    return message;
  }
  
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
    const { messages, enableSearch, userId } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: '消息格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    
    let businessDataText = '';
    let searchResultText = '';
    
    // 获取业务数据（本地存储模式）
    if (userId) {
      try {
        const businessData = await getUserBusinessData(userId);
        
        console.log('Chat API - 业务数据获取结果:', {
          hasBusinessData: !!businessData,
          todayTodosCount: businessData?.todos?.today?.length || 0,
          schedulesCount: businessData?.schedules?.today?.length || 0,
        });
        
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
${businessData.customersByStatus.notOnline.map((c: any) => 
  `- ${c.name}${c.version ? `（${c.version}）` : ''}，实施人天：${c.days || '未设置'}`
).join('\n') || '- 暂无'}

【已上线未验收客户】（最多显示5家）
${businessData.customersByStatus.onlineNotAccepted.map((c: any) => 
  `- ${c.name}，实施人天：${c.days || '未设置'}`
).join('\n') || '- 暂无'}

【延期上线客户】（最多显示5家）
${businessData.customersByStatus.delayedOnline.map((c: any) => 
  `- ${c.name}，实施人天：${c.days || '未设置'}`
).join('\n') || '- 暂无'}

【最近跟进记录】（最多显示5条）
${businessData.recentFollowUps.slice(0, 5).map((f: any) => 
  `- ${f.customerName}：${f.content.substring(0, 50)}${f.content.length > 50 ? '...' : ''}`
).join('\n') || '- 暂无'}

【待办事项】
📌 今日待办（${businessData.todos.today.length}项）：
${businessData.todos.today.length > 0 
  ? businessData.todos.today.map((t: any) => 
      `- ${t.content}${t.customerName ? `（${t.customerName}）` : ''}${t.priority === 'high' ? ' ⚠️重要' : ''}`
    ).join('\n')
  : '- 暂无今日待办'}

⚠️ 已过期待办（${businessData.todos.overdue.length}项）：
${businessData.todos.overdue.length > 0 
  ? businessData.todos.overdue.slice(0, 5).map((t: any) => 
      `- ${t.content}${t.customerName ? `（${t.customerName}）` : ''}，过期${t.overdueDays}天${t.priority === 'high' ? ' ⚠️重要' : ''}`
    ).join('\n')
  : '- 无过期待办'}

📅 未来待办（${businessData.todos.future.length}项）：
${businessData.todos.future.length > 0 
  ? businessData.todos.future.map((t: any) => 
      `- ${t.content}${t.customerName ? `（${t.customerName}）` : ''}，截止：${t.dueDate || '无截止日期'}`
    ).join('\n')
  : '- 暂无未来待办'}

【日程排期】
🗓️ 今日日程（${businessData.schedules.today.length}项）：
${businessData.schedules.today.length > 0 
  ? businessData.schedules.today.map((s: any) => 
      `- ${s.customerName}${s.notes ? `：${s.notes}` : ''}`
    ).join('\n')
  : '- 暂无今日日程'}

📅 未来7天日程（${businessData.schedules.future.length}项）：
${businessData.schedules.future.length > 0 
  ? businessData.schedules.future.map((s: any) => 
      `- ${s.customerName}，日期：${s.scheduleDate.split('T')[0]}${s.notes ? `，备注：${s.notes}` : ''}`
    ).join('\n')
  : '- 暂无未来日程'}
`;
        }
      } catch (e) {
        console.error('获取用户数据失败:', e);
      }
    }

    // 获取最后一条用户消息
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    
    // 判断是否需要联网搜索（暂时禁用，可通过 Coze 智能体内置搜索能力实现）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _lastUserMessage = lastUserMessage;
    // 联网搜索功能暂时注释掉，后续可重新接入
    // if (lastUserMessage && (enableSearch || needsWebSearch(lastUserMessage.content))) {
    //   const searchType = getSearchType(lastUserMessage.content);
    //   const searchQuery = generateSearchQuery(lastUserMessage.content);
    //   const searchResult = await performSearch(searchQuery, customHeaders, searchType);
    //   
    //   if (searchResult && searchResult.results && searchResult.results.length > 0) {
    //     searchResultText = `
    // 【联网搜索结果：${searchQuery}】
    // 
    // ${searchResult.summary ? `摘要：${searchResult.summary}\n` : ''}
    // 相关链接：
    // ${searchResult.results.map((r: any, i: number) => 
    //   `${i + 1}. ${r.title}
    //    来源：${r.siteName || '未知'}
    //    摘要：${r.snippet?.substring(0, 100) || '无'}${r.snippet && r.snippet.length > 100 ? '...' : ''}`
    // ).join('\n')}
    // `;
    //   }
    // }

    // 专业系统提示语 - 小蝶
    const systemContent = `你是"小蝶"，一位金蝶云星辰交付顾问和日常安排助手。

## 你的身份与定位

你叫"小蝶"，是金蝶云星辰交付集成平台的智能助手。你的主要任务是帮助交付顾问管理客户、跟进项目进度、查询业务数据、安排日程，以及解答金蝶云星辰产品相关问题。

${businessDataText ? `## 当前用户业务数据
${businessDataText}
` : ''}
${searchResultText ? `## 联网搜索结果
${searchResultText}

请基于以上搜索结果回答用户问题。
` : ''}
## 重要指令
1. **始终基于上面提供的【当前用户业务数据】回答用户问题**，如果用户询问客户数量、待办事项、日程安排等，直接根据业务数据中的具体数字和内容回答。
2. 如果用户询问待办或日程，直接根据业务数据中的数量和内容回答，不要编造数据。
3. 不要参考历史对话中的旧数据，始终以最新提供的业务数据为准。
4. 如果用户要求创建、修改、删除数据，告知用户暂不支持此功能，建议前往相应页面操作。
5. 联网搜索结果仅供参考，如果不相关可以忽略。

## 自称要求
1. 使用"小蝶"自称，不要称呼自己为"AI助手"或"人工智能"。
2. 回答时保持亲切友好的语气，像一位经验丰富的交付顾问同事。
3. 适当使用表情符号增加亲和力，但不要过度使用。
4. 回答要简洁明了，突出重点。`;

    // 构建消息数组
    const fullMessages = [
      { role: 'system', content: systemContent },
      ...messages
    ];
    
    console.log('Chat API - 请求信息:', {
      messagesCount: messages.length,
      lastUserMessage: messages.length > 0 ? messages[messages.length - 1]?.content?.substring(0, 50) : 'none',
      businessDataTextLength: businessDataText.length,
    });

    // 调用 Coze Agent API
    const response = await fetch(COZE_AGENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${COZE_API_TOKEN}`,
        ...customHeaders,
      },
      body: JSON.stringify({
        messages: fullMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Coze Agent API 错误:', response.status, errorText);
      return new Response(JSON.stringify({ error: '智能助手服务暂时不可用' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body?.getReader();
          if (!reader) {
            controller.enqueue(encoder.encode('抱歉，无法获取响应内容。'));
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // 解析 SSE 格式的数据（Coze Agent 格式）
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留未完成的行
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              
              // 跳过 event 行，处理 data 行
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                try {
                  const parsed = JSON.parse(data);
                  
                  // Coze Agent 响应格式
                  if (parsed.type === 'answer' && parsed.content?.answer) {
                    controller.enqueue(encoder.encode(parsed.content.answer));
                  } else if (parsed.type === 'message_end') {
                    // 消息结束
                    controller.close();
                    return;
                  }
                } catch {
                  // 如果不是 JSON，跳过
                }
              }
            }
          }
          
          // 处理缓冲区中剩余的内容
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.trim().startsWith('data: ')) {
                const data = line.trim().slice(6);
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'answer' && parsed.content?.answer) {
                    controller.enqueue(encoder.encode(parsed.content.answer));
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }
          }
          
          controller.close();
        } catch (error) {
          console.error('流式输出错误:', error);
          controller.enqueue(encoder.encode('抱歉，我遇到了一些问题，请稍后再试。'));
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
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
