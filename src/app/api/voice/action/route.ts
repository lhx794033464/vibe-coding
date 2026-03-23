import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 语音操作解析API
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json({ error: '缺少文本内容' }, { status: 400 });
    }

    // 使用LLM解析意图
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const systemPrompt = `你是一个智能助手的意图解析模块。你需要分析用户的语音指令，识别用户想要执行的操作，并返回JSON格式的结果。

支持的操作类型：
1. create_todo - 创建待办事项
   参数：content（待办内容）, customer_name（可选，客户名称）, priority（可选，high/medium/low，默认low）

2. create_schedule - 创建日程排期
   参数：customer_name（客户名称）, date（日期，格式yyyy-MM-dd）, notes（可选，备注）

3. create_log - 创建实施日志
   参数：customer_name（客户名称）, consumed_days（消耗人天，数字）, summary（实施纪要）

4. query_customer - 查询客户
   参数：customer_name（客户名称，可选）, status（状态，可选）

5. query_todo - 查询待办
   参数：无

6. general - 普通对话
   参数：response（回复内容）

请根据用户输入返回JSON：
{
  "action": "操作类型",
  "params": { 具体参数 },
  "response": "给用户的简短确认信息"
}

示例：
用户："帮我创建一个待办，明天跟进金蝶客户"
返回：{"action": "create_todo", "params": {"content": "跟进金蝶客户", "customer_name": "金蝶"}, "response": "已为您创建待办：跟进金蝶客户"}

用户："帮我预约明天下午三点和张三开会"
返回：{"action": "create_schedule", "params": {"customer_name": "张三", "date": "2024-01-02", "notes": "会议"}, "response": "已为您预约明天与张三的会议"}

用户："给王五记录一条实施日志，消耗0.5天，做了凭证导入"
返回：{"action": "create_log", "params": {"customer_name": "王五", "consumed_days": 0.5, "summary": "凭证导入"}, "response": "已记录王五的实施日志：凭证导入，消耗0.5天"}

用户："今天有什么待办？"
返回：{"action": "query_todo", "params": {}, "response": "正在为您查询今日待办..."}

用户："查看客户金蝶的信息"
返回：{"action": "query_customer", "params": {"customer_name": "金蝶"}, "response": "正在查询金蝶的客户信息..."}

用户："你好"
返回：{"action": "general", "params": {}, "response": "你好！我是您的智能助手，可以帮您创建待办、预约会议、记录实施日志等。请问有什么可以帮您的？"}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    const llmResponse = await llmClient.invoke(messages, { 
      model: 'doubao-seed-1-6-lite-251015',
      temperature: 0.3 
    });

    const responseText = llmResponse.content || '';
    
    // 解析JSON
    let intent;
    try {
      // 尝试提取JSON部分
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        intent = JSON.parse(jsonMatch[0]);
      } else {
        intent = { action: 'general', params: {}, response: responseText };
      }
    } catch {
      intent = { action: 'general', params: {}, response: responseText };
    }

    // 执行操作
    let result: { success: boolean; data?: unknown; message: string } = { 
      success: false, 
      message: intent.response || '操作失败' 
    };

    switch (intent.action) {
      case 'create_todo': {
        const { content, customer_name, priority = 'low' } = intent.params;
        
        // 如果有客户名称，查找客户ID
        let customerId = null;
        if (customer_name) {
          const { data: customers } = await client
            .from('customers')
            .select('id')
            .ilike('name', `%${customer_name}%`)
            .limit(1);
          if (customers && customers.length > 0) {
            customerId = customers[0].id;
          }
        }

        const { data: todo, error } = await client
          .from('todos')
          .insert({
            content: content,
            customer_id: customerId,
            due_date: new Date().toISOString(),
            priority: priority,
            user_id: user.id,
          })
          .select()
          .single();

        if (error) {
          result = { success: false, message: `创建待办失败：${error.message}` };
        } else {
          result = { 
            success: true, 
            data: todo, 
            message: `已创建待办：${content}${customer_name ? `（关联客户：${customer_name}）` : ''}` 
          };
        }
        break;
      }

      case 'create_schedule': {
        const { customer_name, date, notes = '' } = intent.params;
        
        if (!customer_name) {
          result = { success: false, message: '请指定客户名称' };
          break;
        }

        // 查找客户
        const { data: customers } = await client
          .from('customers')
          .select('id, name')
          .ilike('name', `%${customer_name}%`)
          .limit(1);

        if (!customers || customers.length === 0) {
          result = { success: false, message: `未找到客户：${customer_name}` };
          break;
        }

        const { data: schedule, error } = await client
          .from('schedules')
          .insert({
            customer_id: customers[0].id,
            schedule_date: date ? `${date}T00:00:00` : new Date().toISOString(),
            notes: notes,
            user_id: user.id,
          })
          .select()
          .single();

        if (error) {
          result = { success: false, message: `创建日程失败：${error.message}` };
        } else {
          result = { 
            success: true, 
            data: schedule, 
            message: `已创建日程：${customers[0].name}${date ? `（${date}）` : ''}` 
          };
        }
        break;
      }

      case 'create_log': {
        const { customer_name, consumed_days, summary } = intent.params;
        
        if (!customer_name || !consumed_days || !summary) {
          result = { success: false, message: '请提供客户名称、消耗人天和实施纪要' };
          break;
        }

        // 查找客户
        const { data: customers } = await client
          .from('customers')
          .select('id, name')
          .ilike('name', `%${customer_name}%`)
          .limit(1);

        if (!customers || customers.length === 0) {
          result = { success: false, message: `未找到客户：${customer_name}` };
          break;
        }

        const { data: log, error } = await client
          .from('implementation_logs')
          .insert({
            customer_id: customers[0].id,
            log_date: new Date().toISOString(),
            consumed_days: consumed_days,
            summary: summary,
            user_id: user.id,
          })
          .select()
          .single();

        if (error) {
          result = { success: false, message: `创建实施日志失败：${error.message}` };
        } else {
          result = { 
            success: true, 
            data: log, 
            message: `已记录实施日志：${customers[0].name}，消耗${consumed_days}天，${summary}` 
          };
        }
        break;
      }

      case 'query_customer': {
        const { customer_name, status } = intent.params;
        
        let query = client
          .from('customers')
          .select('id, name, status')
          .order('created_at', { ascending: false })
          .limit(10);

        if (customer_name) {
          query = query.ilike('name', `%${customer_name}%`);
        }
        if (status) {
          query = query.eq('status', status);
        }

        const { data: customers, error } = await query;

        if (error) {
          result = { success: false, message: `查询失败：${error.message}` };
        } else {
          const customerList = customers?.map((c: { name: string }) => c.name).join('、') || '暂无客户';
          result = { 
            success: true, 
            data: customers, 
            message: customer_name ? `找到客户：${customerList}` : `客户列表：${customerList}` 
          };
        }
        break;
      }

      case 'query_todo': {
        const today = new Date().toISOString().split('T')[0];
        const { data: todos, error } = await client
          .from('todos')
          .select('id, content, priority, completed, customer_id')
          .eq('user_id', user.id)
          .eq('completed', false)
          .gte('due_date', `${today}T00:00:00`)
          .lte('due_date', `${today}T23:59:59`)
          .order('priority', { ascending: false });

        if (error) {
          result = { success: false, message: `查询失败：${error.message}` };
        } else if (!todos || todos.length === 0) {
          result = { success: true, data: [], message: '今天没有待办事项' };
        } else {
          // 获取关联客户名称
          const customerIds = todos.filter((t: { customer_id: string | null }) => t.customer_id).map((t: { customer_id: string }) => t.customer_id);
          let customerMap: Record<string, string> = {};
          
          if (customerIds.length > 0) {
            const { data: customers } = await client
              .from('customers')
              .select('id, name')
              .in('id', customerIds);
            
            customers?.forEach((c: { id: string; name: string }) => {
              customerMap[c.id] = c.name;
            });
          }

          const todoList = todos.map((t: { content: string; customer_id: string | null }) => {
            const customerName = t.customer_id ? customerMap[t.customer_id] : null;
            return `${t.content}${customerName ? `（${customerName}）` : ''}`;
          }).join('、');
          
          result = { 
            success: true, 
            data: todos, 
            message: `今日待办（${todos.length}项）：${todoList}` 
          };
        }
        break;
      }

      case 'general':
      default:
        result = { success: true, message: intent.response || '好的' };
        break;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('语音操作解析失败:', error);
    return NextResponse.json({ error: '语音操作解析失败' }, { status: 500 });
  }
}
