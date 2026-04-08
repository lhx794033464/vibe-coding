import { NextRequest, NextResponse } from 'next/server';
import { 
  customersStorage, 
  followUpsStorage, 
  implementationLogsStorage, 
  commissionsStorage, 
  schedulesStorage, 
  todosStorage 
} from '@/lib/serverStorage';

// 数据迁移接口 - 从客户端localStorage迁移到服务器端存储
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      customers = [], 
      followUps = [], 
      implementationLogs = [], 
      commissions = [], 
      schedules = [], 
      todos = [] 
    } = body;

    const results = {
      customers: 0,
      followUps: 0,
      implementationLogs: 0,
      commissions: 0,
      schedules: 0,
      todos: 0,
    };

    // 迁移客户数据
    if (customers && customers.length > 0) {
      for (const customer of customers) {
        // 检查是否已存在
        const existing = customersStorage.getById(customer.id);
        if (!existing) {
          // 移除自动生成的字段，让存储重新生成
          const { id, created_at, updated_at, ...data } = customer;
          customersStorage.create(data);
          results.customers++;
        }
      }
    }

    // 迁移跟进记录
    if (followUps && followUps.length > 0) {
      for (const item of followUps) {
        const existing = followUpsStorage.getById(item.id);
        if (!existing) {
          const { id, created_at, updated_at, ...data } = item;
          followUpsStorage.create(data);
          results.followUps++;
        }
      }
    }

    // 迁移实施日志
    if (implementationLogs && implementationLogs.length > 0) {
      for (const item of implementationLogs) {
        const existing = implementationLogsStorage.getById(item.id);
        if (!existing) {
          const { id, created_at, updated_at, ...data } = item;
          implementationLogsStorage.create(data);
          results.implementationLogs++;
        }
      }
    }

    // 迁移提成记录
    if (commissions && commissions.length > 0) {
      for (const item of commissions) {
        const existing = commissionsStorage.getById(item.id);
        if (!existing) {
          const { id, created_at, updated_at, ...data } = item;
          commissionsStorage.create(data);
          results.commissions++;
        }
      }
    }

    // 迁移日程
    if (schedules && schedules.length > 0) {
      for (const item of schedules) {
        const existing = schedulesStorage.getById(item.id);
        if (!existing) {
          const { id, created_at, updated_at, ...data } = item;
          schedulesStorage.create(data);
          results.schedules++;
        }
      }
    }

    // 迁移待办事项
    if (todos && todos.length > 0) {
      for (const item of todos) {
        const existing = todosStorage.getById(item.id);
        if (!existing) {
          const { id, created_at, updated_at, ...data } = item;
          todosStorage.create(data);
          results.todos++;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: '数据迁移完成', 
      results 
    });

  } catch (error) {
    console.error('数据迁移失败:', error);
    return NextResponse.json({ error: '数据迁移失败' }, { status: 500 });
  }
}

// 获取迁移状态
export async function GET() {
  try {
    const stats = {
      customers: customersStorage.count(),
      followUps: followUpsStorage.count(),
      implementationLogs: implementationLogsStorage.count(),
      commissions: commissionsStorage.count(),
      schedules: schedulesStorage.count(),
      todos: todosStorage.count(),
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('获取迁移状态失败:', error);
    return NextResponse.json({ error: '获取迁移状态失败' }, { status: 500 });
  }
}
