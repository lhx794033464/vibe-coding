import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers, dbGetSchedules, dbCreateSchedule, dbCreateImplementationLog } from '@/services/dbService';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 语音操作解析API
export async function POST(request: NextRequest) {
  console.log('=== 语音操作API开始 ===');
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const body = await request.json();
    const { text } = body;
    console.log('接收到的文本:', text);

    if (!text) {
      return NextResponse.json({ error: '缺少文本内容' }, { status: 400 });
    }

    // 获取用户可见的客户列表
    const customers = await dbGetCustomers({ userId: userInfo?.id, isAdmin });
    const customerList = customers.map((c: any) => c.name);
    const customerListStr = customerList.length > 0 ? customerList.join('、') : '暂无客户';

    // 获取当前日期信息
    const now = new Date();
    const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    const tomorrowDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate() + 1).padStart(2, '0')}`;

    // 使用LLM解析意图
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const systemPrompt = `你是小蝶的语音意图解析模块。你需要分析用户的语音指令，识别用户想要执行的操作，并返回JSON格式的结果。

## 当前日期信息（重要！）
今天是 ${todayDate}，星期${dayOfWeek}。
明天是 ${tomorrowDate}。
当用户说"今天"、"明天"、"后天"等相对日期时，请根据当前日期计算出具体日期。

## 用户的客户列表（重要！）
当用户提到客户/公司名称时，必须从以下客户列表中选择最匹配的一个：
${customerListStr}

## 支持的操作类型：
1. create_schedule - 创建日程排期
   参数：customer_name（必须从客户列表中选择）, date（日期，格式yyyy-MM-dd）, notes（可选，备注）

2. create_log - 创建实施日志
   参数：customer_name（必须从客户列表中选择）, consumed_days（消耗人天，数字）, content（实施纪要）

3. query_customer - 查询客户
   参数：customer_name（可选，从客户列表中选择）

4. query_schedule - 查询日程
   参数：date（可选，日期格式yyyy-MM-dd）

5. general - 普通对话
   参数：response（回复内容）

## 重要规则：
- 如果语音中包含日期（今天、明天、后天、下周一等），提取为date参数
- 如果语音中包含公司名，匹配到客户列表后放入customer_name参数

## 日期解析规则：
- "今天" → 当天日期
- "明天" → 第二天
- "后天" → 第三天
- "下周一/周二..." → 下周对应日期
- "几号" → 对应月份的日期

## 返回格式（纯JSON，不要其他文字）：
{"action": "操作类型", "params": {具体参数}, "response": "给用户的简短确认信息"}

## 示例：
用户："明天去华瑞科技做调研"
返回：{"action": "create_schedule", "params": {"customer_name": "华瑞科技", "date": "${tomorrowDate}", "notes": "调研"}, "response": "已为您创建日程：明天调研（华瑞科技）"}

用户："今天给华瑞科技记录2天人天"
返回：{"action": "create_log", "params": {"customer_name": "华瑞科技", "consumed_days": "2", "content": "实施工作"}, "response": "已记录实施日志：华瑞科技，消耗2天"}

用户："查看客户列表"
返回：{"action": "query_customer", "params": {}, "response": "正在为您查询客户列表..."}

用户："今天有什么日程？"
返回：{"action": "query_schedule", "params": {"date": "${todayDate}"}, "response": "正在为您查询今日日程..."}`;

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

    let intent;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        intent = JSON.parse(jsonMatch[0]);
      } else {
        intent = { action: 'general', params: {}, response: responseText };
      }
    } catch {
      intent = { action: 'general', params: {}, response: responseText };
    }

    if (!intent.params) intent.params = {};

    let result: { success: boolean; data?: unknown; message: string } = {
      success: false,
      message: intent.response || '操作失败'
    };

    switch (intent.action) {
      case 'create_schedule': {
        const { customer_name, date, notes = '' } = intent.params || {};

        if (!customer_name) {
          result = { success: false, message: '请指定客户名称' };
          break;
        }

        let matchedCustomer = customers.find((c: any) => c.name === customer_name);
        if (!matchedCustomer) {
          matchedCustomer = customers.find((c: any) =>
            c.name.includes(customer_name) || customer_name.includes(c.name)
          );
        }

        if (!matchedCustomer) {
          result = { success: false, message: `未找到客户：${customer_name}。可用客户：${customerListStr}` };
          break;
        }

        const schedule = await dbCreateSchedule({
          customer_id: matchedCustomer.id,
          schedule_date: date ? `${date}T00:00:00` : new Date().toISOString(),
          notes,
          user_id: userInfo?.id || null,
        });

        result = {
          success: true,
          data: schedule,
          message: `已创建日程：${matchedCustomer.name}${date ? `（${date}）` : ''}`
        };
        break;
      }

      case 'create_log': {
        const { customer_name, consumed_days, content: logContent } = intent.params || {};

        if (!customer_name || !consumed_days || !logContent) {
          result = { success: false, message: '请提供客户名称、消耗人天和实施纪要' };
          break;
        }

        let matchedCustomer = customers.find((c: any) => c.name === customer_name);
        if (!matchedCustomer) {
          matchedCustomer = customers.find((c: any) =>
            c.name.includes(customer_name) || customer_name.includes(c.name)
          );
        }

        if (!matchedCustomer) {
          result = { success: false, message: `未找到客户：${customer_name}。可用客户：${customerListStr}` };
          break;
        }

        const log = await dbCreateImplementationLog({
          customer_id: matchedCustomer.id,
          log_date: new Date().toISOString().split('T')[0],
          consumed_days: String(consumed_days),
          content: logContent,
          user_id: userInfo?.id || null,
        });

        result = {
          success: true,
          data: log,
          message: `已记录实施日志：${matchedCustomer.name}，消耗${consumed_days}天，${logContent}`
        };
        break;
      }

      case 'query_customer': {
        const { customer_name } = intent.params || {};
        let queryCustomers = customers;

        if (customer_name) {
          queryCustomers = customers.filter((c: any) =>
            c.name.toLowerCase().includes(customer_name.toLowerCase())
          );
        }

        const customerListResult = queryCustomers.map((c: any) => c.name).join('、') || '暂无客户';
        result = {
          success: true,
          data: queryCustomers,
          message: customer_name ? `找到客户：${customerListResult}` : `客户列表：${customerListResult}`
        };
        break;
      }

      case 'query_schedule': {
        const { date: queryDate } = intent.params || {};
        const targetDate = queryDate || todayDate;

        const allSchedules = await dbGetSchedules({ userId: userInfo?.id, isAdmin });
        const daySchedules = allSchedules.filter((s: any) => {
          const dateStr = s.schedule_date || s.start_time;
          if (!dateStr) return false;
          return dateStr.startsWith(targetDate);
        });

        if (daySchedules.length === 0) {
          result = { success: true, data: [], message: `${targetDate}没有日程安排` };
        } else {
          const customerMap: Record<string, string> = {};
          customers.forEach((c: any) => {
            customerMap[c.id] = c.name;
          });

          const scheduleList = daySchedules.map((s: any) => {
            const customerName = s.customer_id ? customerMap[s.customer_id] : null;
            return `${customerName || '未知客户'}${s.notes ? `（${s.notes}）` : ''}`;
          }).join('、');

          result = {
            success: true,
            data: daySchedules,
            message: `${targetDate}的日程（${daySchedules.length}项）：${scheduleList}`
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
