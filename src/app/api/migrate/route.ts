import { NextRequest, NextResponse } from 'next/server';
import {
  dbGetCustomers,
  dbCreateCustomer,
  dbGetFollowUps,
  dbCreateFollowUp,
  dbGetImplementationLogs,
  dbCreateImplementationLog,
  dbGetCommissionRecords,
  dbCreateCommissionRecord,
  dbGetSchedules,
  dbCreateSchedule,
} from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 数据迁移接口 - 从客户端localStorage迁移到数据库
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);

    const body = await request.json();
    const {
      customers = [],
      followUps = [],
      implementationLogs = [],
      commissions = [],
      schedules = []
    } = body;

    const results = {
      customers: 0,
      followUps: 0,
      implementationLogs: 0,
      commissions: 0,
      schedules: 0,
    };

    // 迁移客户数据
    if (customers && customers.length > 0) {
      const existingCustomers = await dbGetCustomers({ userId: userInfo?.id, isAdmin: true });
      const existingIds = new Set(existingCustomers.map((c: any) => c.id));

      for (const customer of customers) {
        if (!existingIds.has(customer.id)) {
          const { id, created_at, updated_at, ...data } = customer;
          await dbCreateCustomer({ ...data, user_id: userInfo?.id || null });
          results.customers++;
        }
      }
    }

    // 迁移跟进记录
    if (followUps && followUps.length > 0) {
      for (const item of followUps) {
        const { id, created_at, updated_at, ...data } = item;
        try {
          await dbCreateFollowUp({ ...data, user_id: userInfo?.id || null });
          results.followUps++;
        } catch { /* skip duplicates */ }
      }
    }

    // 迁移实施日志
    if (implementationLogs && implementationLogs.length > 0) {
      for (const item of implementationLogs) {
        const { id, created_at, updated_at, ...data } = item;
        try {
          await dbCreateImplementationLog({ ...data, user_id: userInfo?.id || null });
          results.implementationLogs++;
        } catch { /* skip duplicates */ }
      }
    }

    // 迁移提成记录
    if (commissions && commissions.length > 0) {
      for (const item of commissions) {
        const { id, created_at, updated_at, ...data } = item;
        try {
          await dbCreateCommissionRecord({ ...data, user_id: userInfo?.id || null });
          results.commissions++;
        } catch { /* skip duplicates */ }
      }
    }

    // 迁移日程
    if (schedules && schedules.length > 0) {
      for (const item of schedules) {
        const { id, created_at, updated_at, ...data } = item;
        try {
          await dbCreateSchedule({ ...data, user_id: userInfo?.id || null });
          results.schedules++;
        } catch { /* skip duplicates */ }
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
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const customers = await dbGetCustomers({ userId: userInfo?.id, isAdmin });
    const followUps = await dbGetFollowUps({ userId: userInfo?.id, isAdmin });
    const implementationLogs = await dbGetImplementationLogs({ userId: userInfo?.id, isAdmin });
    const commissions = await dbGetCommissionRecords({ userId: userInfo?.id, isAdmin });
    const schedules = await dbGetSchedules({ userId: userInfo?.id, isAdmin });

    const stats = {
      customers: customers.length,
      followUps: followUps.length,
      implementationLogs: implementationLogs.length,
      commissions: commissions.length,
      schedules: schedules.length,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('获取迁移状态失败:', error);
    return NextResponse.json({ error: '获取迁移状态失败' }, { status: 500 });
  }
}
