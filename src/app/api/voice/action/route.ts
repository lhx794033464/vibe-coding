import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 语音操作解析API
export async function POST(request: NextRequest) {
  console.log('=== 语音操作API开始 ===');
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      console.log('错误：未授权');
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    
    if (authError || !user) {
      console.log('错误：用户验证失败', authError);
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }
    console.log('用户验证成功:', user.id);

    const body = await request.json();
    const { text } = body;
    console.log('接收到的文本:', text);

    if (!text) {
      return NextResponse.json({ error: '缺少文本内容' }, { status: 400 });
    }

    // 先获取用户的所有客户列表，用于匹配
    const { data: customers } = await client
      .from('customers')
      .select('id, name')
      .order('name');
    
    const customerList = customers?.map(c => c.name) || [];
    const customerListStr = customerList.length > 0 ? customerList.join('、') : '暂无客户';

    // 使用LLM解析意图
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const systemPrompt = `你是一个智能助手的意图解析模块。你需要分析用户的语音指令，识别用户想要执行的操作，并返回JSON格式的结果。

## 用户的客户列表（重要！）
当用户提到客户/公司名称时，必须从以下客户列表中选择最匹配的一个：
${customerListStr}

## 支持的操作类型：
1. create_todo - 创建待办事项
   参数：
   - content（待办内容，仅提取动词/行为，不要包含公司名和日期）
   - customer_name（可选，必须从客户列表中选择）
   - date（可选，日期格式yyyy-MM-dd，从语音中解析相对日期如"今天"、"明天"、"后天"、"下周一"等）
   - priority（可选，high/medium/low，默认low）

2. create_schedule - 创建日程排期
   参数：customer_name（必须从客户列表中选择）, date（日期，格式yyyy-MM-dd）, notes（可选，备注）

3. create_log - 创建实施日志
   参数：customer_name（必须从客户列表中选择）, consumed_days（消耗人天，数字）, summary（实施纪要）

4. query_customer - 查询客户
   参数：customer_name（可选，从客户列表中选择）

5. query_todo - 查询待办
   参数：无

6. general - 普通对话
   参数：response（回复内容）

## 重要规则：
- 待办内容(content)只保留动作/行为，如"导账"、"跟进"、"培训"、"初始化"等
- 如果语音中包含日期（今天、明天、后天、下周一等），提取为date参数，不要放入content
- 如果语音中包含公司名，匹配到客户列表后放入customer_name参数，不要放入content

## 日期解析规则：
- "今天" → 当天日期
- "明天" → 第二天
- "后天" → 第三天
- "下周一/周二..." → 下周对应日期
- "几号" → 对应月份的日期

## 返回格式（纯JSON，不要其他文字）：
{"action": "操作类型", "params": {具体参数}, "response": "给用户的简短确认信息"}

## 示例：
用户："明天给华瑞科技导账"
返回：{"action": "create_todo", "params": {"content": "导账", "customer_name": "华瑞科技", "date": "2026-03-25"}, "response": "已为您创建待办：明天导账（华瑞科技）"}

用户："后天去培训"
返回：{"action": "create_todo", "params": {"content": "培训", "date": "2026-03-26"}, "response": "已为您创建待办：后天培训"}

用户："今天有什么待办？"
返回：{"action": "query_todo", "params": {}, "response": "正在为您查询今日待办..."}

用户："下周一给自贡中铁做初始化"
返回：{"action": "create_todo", "params": {"content": "初始化", "customer_name": "自贡中铁二局地产新城投资有限公司", "date": "2026-03-30"}, "response": "已为您创建待办：下周一初始化（自贡中铁二局地产新城投资有限公司）"}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    const llmResponse = await llmClient.invoke(messages, { 
      model: 'deepseek-v3-2-251201',
      temperature: 0.1 
    });

    const responseText = llmResponse.content || '';
    console.log('LLM响应:', responseText);
    
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

    console.log('解析的意图:', intent);
    console.log('意图action类型:', intent.action, '是否create_todo:', intent.action === 'create_todo');

    // 确保params存在
    if (!intent.params) {
      intent.params = {};
    }

    // 执行操作
    let result: { success: boolean; data?: unknown; message: string } = { 
      success: false, 
      message: intent.response || '操作失败' 
    };

    switch (intent.action) {
      case 'create_todo': {
        const { content, customer_name, date, priority = 'low' } = intent.params || {};
        
        if (!content) {
          result = { success: false, message: '请提供待办内容' };
          break;
        }
        
        // 如果有客户名称，查找客户ID
        let customerId = null;
        let matchedCustomerName = customer_name;
        
        if (customer_name) {
          // 先尝试精确匹配
          const exactMatch = customers?.find(c => c.name === customer_name);
          if (exactMatch) {
            customerId = exactMatch.id;
            matchedCustomerName = exactMatch.name;
          } else {
            // 再尝试模糊匹配
            const fuzzyMatch = customers?.find(c => 
              c.name.includes(customer_name) || customer_name.includes(c.name)
            );
            if (fuzzyMatch) {
              customerId = fuzzyMatch.id;
              matchedCustomerName = fuzzyMatch.name;
            }
          }
        }

        console.log('创建待办:', { content, customerId, matchedCustomerName, priority, date });

        // 计算截止日期
        let dueDate: string;
        if (date) {
          // 如果LLM解析出了日期，直接使用
          dueDate = `${date}T00:00:00`;
        } else {
          // 默认规则：当前时间在下午5点前用当天，否则用明天
          const now = new Date();
          const hour = now.getHours();
          const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          
          if (hour < 17) {
            dueDate = todayLocal.toISOString();
          } else {
            const tomorrow = new Date(todayLocal);
            tomorrow.setDate(tomorrow.getDate() + 1);
            dueDate = tomorrow.toISOString();
          }
        }

        const { data: todo, error } = await client
          .from('todos')
          .insert({
            content: content,
            customer_id: customerId,
            due_date: dueDate,
            priority: priority,
            user_id: user.id,
          })
          .select()
          .single();

        if (error) {
          console.error('创建待办失败:', error);
          result = { success: false, message: `创建待办失败：${error.message}` };
        } else {
          console.log('待办创建成功:', todo);
          result = { 
            success: true, 
            data: todo, 
            message: `已创建待办：${content}${matchedCustomerName ? `（关联客户：${matchedCustomerName}）` : ''}` 
          };
        }
        break;
      }

      case 'create_schedule': {
        const { customer_name, date, notes = '' } = intent.params || {};
        
        if (!customer_name) {
          result = { success: false, message: '请指定客户名称' };
          break;
        }

        // 查找客户（先精确匹配，再模糊匹配）
        let matchedCustomer = customers?.find(c => c.name === customer_name);
        if (!matchedCustomer) {
          matchedCustomer = customers?.find(c => 
            c.name.includes(customer_name) || customer_name.includes(c.name)
          );
        }

        if (!matchedCustomer) {
          result = { success: false, message: `未找到客户：${customer_name}。可用客户：${customerListStr}` };
          break;
        }

        const { data: schedule, error } = await client
          .from('schedules')
          .insert({
            customer_id: matchedCustomer.id,
            schedule_date: date ? `${date}T00:00:00` : new Date().toISOString(),
            notes: notes,
            user_id: user.id,
          })
          .select()
          .single();

        if (error) {
          console.error('创建日程失败:', error);
          result = { success: false, message: `创建日程失败：${error.message}` };
        } else {
          result = { 
            success: true, 
            data: schedule, 
            message: `已创建日程：${matchedCustomer.name}${date ? `（${date}）` : ''}` 
          };
        }
        break;
      }

      case 'create_log': {
        const { customer_name, consumed_days, summary } = intent.params || {};
        
        if (!customer_name || !consumed_days || !summary) {
          result = { success: false, message: '请提供客户名称、消耗人天和实施纪要' };
          break;
        }

        // 查找客户（先精确匹配，再模糊匹配）
        let matchedCustomer = customers?.find(c => c.name === customer_name);
        if (!matchedCustomer) {
          matchedCustomer = customers?.find(c => 
            c.name.includes(customer_name) || customer_name.includes(c.name)
          );
        }

        if (!matchedCustomer) {
          result = { success: false, message: `未找到客户：${customer_name}。可用客户：${customerListStr}` };
          break;
        }

        const { data: log, error } = await client
          .from('implementation_logs')
          .insert({
            customer_id: matchedCustomer.id,
            log_date: new Date().toISOString(),
            consumed_days: consumed_days,
            summary: summary,
            user_id: user.id,
          })
          .select()
          .single();

        if (error) {
          console.error('创建实施日志失败:', error);
          result = { success: false, message: `创建实施日志失败：${error.message}` };
        } else {
          result = { 
            success: true, 
            data: log, 
            message: `已记录实施日志：${matchedCustomer.name}，消耗${consumed_days}天，${summary}` 
          };
        }
        break;
      }

      case 'query_customer': {
        const { customer_name, status } = intent.params || {};
        
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

        const { data: queryCustomers, error } = await query;

        if (error) {
          result = { success: false, message: `查询失败：${error.message}` };
        } else {
          const customerListResult = queryCustomers?.map((c: { name: string }) => c.name).join('、') || '暂无客户';
          result = { 
            success: true, 
            data: queryCustomers, 
            message: customer_name ? `找到客户：${customerListResult}` : `客户列表：${customerListResult}` 
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
          const customerMap: Record<string, string> = {};
          
          if (customerIds.length > 0) {
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
