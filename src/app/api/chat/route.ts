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

// 模块标签映射
const MODULE_LABELS: Record<string, string> = {
  finance: '财务',
  inventory: '进销存',
  production: '生产',
  reimbursement: '报销',
  tax: '纳税',
  invoicing: '开票',
  ordering: '订货',
  retail: '零售',
  outsourcing: '委外',
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

    // 获取最近的跟进记录（不使用关联查询）
    const { data: recentFollowUps } = await client
      .from('follow_up_records')
      .select('id, customer_id, content, follow_up_at')
      .order('follow_up_at', { ascending: false })
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

    return {
      totalCustomers,
      onlineCustomers,
      acceptedCustomers,
      onlineRate,
      acceptanceRate,
      statusDistribution,
      customersByStatus,
      recentFollowUps: recentFollowUpsList,
    };
  } catch (error) {
    console.error('获取业务数据失败:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: '消息格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取用户token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    let businessDataText = '';
    
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
`;
          }
        }
      } catch (e) {
        console.error('获取用户数据失败:', e);
      }
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 系统提示语
    const systemMessage = {
      role: 'system' as const,
      content: `你是交付管理系统的AI助手，一个友好、专业的办公助手。
你的角色是帮助用户解答工作中的问题，提供专业建议，或者进行轻松的对话。

${businessDataText ? `【当前用户的业务数据】
${businessDataText}
` : ''}
请遵循以下原则：
1. 回答简洁明了，避免冗长
2. 语气友好温暖，像一个贴心的同事
3. 对于专业问题，给出有价值的建议
4. 可以适当使用表情符号增加亲和力
5. 如果用户提到工作压力或疲劳，给予鼓励和关怀
6. 当用户询问客户情况时，根据上面的业务数据进行分析和回答
7. 如果数据中没有相关信息，请如实告知用户
8. 可以根据数据给出专业的建议，比如提醒用户关注未上线客户等`,
    };

    const fullMessages = [systemMessage, ...messages];

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const llmStream = client.stream(fullMessages, {
            model: 'doubao-seed-1-6-lite-251015',
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
          controller.enqueue(encoder.encode('抱歉，我遇到了一些问题，请稍后再试。'));
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
