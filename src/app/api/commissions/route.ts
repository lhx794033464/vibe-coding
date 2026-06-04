import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers, dbGetCommissionRecords, dbCreateCommissionRecord, dbUpdateCommissionRecord, dbDeleteCommissionRecord } from '@/services/dbService';
import { COMMISSION_CONFIG } from '@/types';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { getCurrentUserInfo } from '@/lib/serverAuth';

function calculateCommission(
  implementationFee: number,
  implementationDays: number,
  modules: string[],
): {
  commissionType: 'percentage' | 'daily';
  totalCommission: number;
  commissionRate?: number;
  standardFee: number;
  feeRatio: number;
} {
  const standardFee = implementationDays * COMMISSION_CONFIG.STANDARD_DAILY_RATE;
  const feeRatio = standardFee > 0 ? implementationFee / standardFee : 0;

  if (feeRatio > 0.5) {
    const moduleCount = modules.length;
    const isSingleModule = moduleCount === 1;
    const commissionRate = isSingleModule
      ? COMMISSION_CONFIG.SINGLE_MODULE_RATE
      : COMMISSION_CONFIG.MULTI_MODULE_RATE;

    return {
      commissionType: 'percentage',
      totalCommission: implementationFee * commissionRate,
      commissionRate,
      standardFee,
      feeRatio,
    };
  } else {
    let totalCommission = 0;
    for (const module of modules) {
      if (module === 'finance') {
        totalCommission += implementationDays * COMMISSION_CONFIG.FINANCE_DAILY_COMMISSION;
      } else {
        totalCommission += implementationDays * COMMISSION_CONFIG.OTHER_MODULE_DAILY_COMMISSION;
      }
    }
    return {
      commissionType: 'daily',
      totalCommission,
      standardFee,
      feeRatio,
    };
  }
}

// 获取提成列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM');
    const monthStart = startOfMonth(new Date(monthParam + '-01'));
    const monthEnd = endOfMonth(monthStart);

    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    // 获取所有客户（根据权限过滤）
    const allCustomers = await dbGetCustomers({ userId: userInfo?.id, username: userInfo?.username, isAdmin });

    // 当月验收完成的客户（仅应用内确认的验收）
    const acceptedCustomers = allCustomers.filter((c: any) => {
      if (c.acceptance_status !== 'accepted') return false;
      if (c.acceptance_source !== 'app') return false;
      const updatedAt = new Date(c.updated_at);
      return updatedAt >= monthStart && updatedAt <= monthEnd;
    });

    // 设置下次计提月份为当前月份的客户（仅应用内确认的验收）
    const scheduledCustomers = allCustomers.filter((c: any) =>
      c.acceptance_status === 'accepted' && c.acceptance_source === 'app' && c.next_commission_month === monthParam
    );

    // 合并去重
    const customerMap = new Map();
    [...acceptedCustomers, ...scheduledCustomers].forEach((c: any) => {
      if (!customerMap.has(c.id)) {
        customerMap.set(c.id, c);
      }
    });
    const customers = Array.from(customerMap.values());

    // 获取提成记录（根据权限过滤），按 customer_id 分组
    const allRecords = await dbGetCommissionRecords({ userId: userInfo?.id, isAdmin });
    const recordsByCustomer = new Map<string, any[]>();
    for (const r of allRecords) {
      const list = recordsByCustomer.get(r.customer_id) || [];
      list.push(r);
      recordsByCustomer.set(r.customer_id, list);
    }

    // 计算提成
    const results = customers.map((customer: any) => {
      const implementationFee = parseFloat(customer.implementation_fee || '0');
      const implementationDays = parseFloat(customer.implementation_days || '0');
      const rawModules = customer.modules;
      const modules: string[] = Array.isArray(rawModules) ? rawModules : (typeof rawModules === 'string' && rawModules.length > 0 ? [rawModules] : []);

      const commission = calculateCommission(implementationFee, implementationDays, modules);

      // 从提成记录计算已提金额和人天
      const records = recordsByCustomer.get(customer.id) || [];
      const paidCommission = records.reduce((sum: number, r: any) => sum + parseFloat(r.amount || '0'), 0);
      const paidFinanceDays = records.reduce((sum: number, r: any) => sum + parseFloat(r.finance_days || '0'), 0);
      const paidOtherDays = records.reduce((sum: number, r: any) => sum + parseFloat(r.other_days || '0'), 0);

      // 计算可提人天上限：有模块信息时按模块数×人天，无模块时按总人天
      let totalMaxDays: number;
      let financeMaxDays = 0;
      let otherMaxDays = 0;
      if (modules.length === 0 && implementationDays > 0) {
        // 无模块信息时，总人天即为可提上限
        totalMaxDays = implementationDays;
      } else {
        financeMaxDays = modules.includes('finance') ? implementationDays : 0;
        const otherModuleCount = modules.filter((m: string) => m !== 'finance').length;
        otherMaxDays = otherModuleCount * implementationDays;
        totalMaxDays = financeMaxDays + otherMaxDays;
      }
      const paidDays = paidFinanceDays + paidOtherDays;
      const remainingDays = Math.max(0, totalMaxDays - paidDays);
      const remainingCommission = Math.max(0, commission.totalCommission - paidCommission);

      return {
        customerId: customer.id,
        customerName: customer.name,
        commissionStatus: customer.commission_status || '未计提',
        implementationFee,
        implementationDays,
        modules,
        modulesLabel: modules.map((m: string) => m === 'finance' ? '财务' : m).join('+'),
        standardFee: commission.standardFee,
        feeRatio: commission.feeRatio,
        commissionType: commission.commissionType,
        commissionRate: commission.commissionRate,
        totalCommission: commission.totalCommission,
        paidCommission,
        remainingCommission,
        isFullyPaid: paidCommission >= commission.totalCommission,
        records: records.map((r: any) => ({
          id: r.id,
          amount: r.amount,
          remark: r.remark,
          created_at: r.created_at,
          commission_month: r.commission_month,
        })),
        acceptedAt: customer.updated_at || customer.accepted_at || '',
        financeMaxDays,
        otherMaxDays,
        totalMaxDays,
        paidFinanceDays,
        paidOtherDays,
        paidDays,
        remainingDays,
      };
    });

    // 显示所有有提成余额或未完全计提的客户
    const visibleResults = results.filter((r: any) =>
      r.commissionStatus !== '已计提' || r.remainingCommission > 0
    );

    const totalCommission = visibleResults.reduce((sum: number, r: any) => sum + r.totalCommission, 0);
    const totalPaid = visibleResults.reduce((sum: number, r: any) => sum + r.paidCommission, 0);

    return NextResponse.json({
      data: visibleResults,
      summary: {
        totalCustomers: visibleResults.length,
        totalCommission: Math.round(totalCommission * 100) / 100,
        confirmedCommission: Math.round(totalPaid * 100) / 100,
        pendingCommission: Math.round((totalCommission - totalPaid) * 100) / 100,
      },
    });
  } catch (error) {
    console.error('获取提成列表失败:', error);
    return NextResponse.json({ error: '获取提成列表失败' }, { status: 500 });
  }
}

// 确认提成
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const body = await request.json();
    const { customer_id, commission_month, status, amount, remark, finance_days, other_days } = body;

    if (!customer_id || !commission_month) {
      return NextResponse.json({ error: '客户ID和提成月份不能为空' }, { status: 400 });
    }

    // 验证权限
    if (!isAdmin) {
      const customer = await dbGetCustomers({ userId: userInfo?.id, username: userInfo?.username, isAdmin: false });
      const found = customer.find((c: any) => c.id === customer_id);
      if (!found) {
        return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
      }
    }

    // 获取客户信息以计算提成总额
    const customers = await dbGetCustomers({ userId: userInfo?.id, username: userInfo?.username, isAdmin });
    const customer = customers.find((c: any) => c.id === customer_id);
    const implementationFee = customer?.implementation_fee || 0;
    const implementationDays = customer?.implementation_days || 1;
    const modules = customer?.modules || [];
    const moduleCount = Array.isArray(modules) ? modules.length : 0;

    // 计算提成总额
    let totalCommission = 0;
    if (implementationFee > 500) {
      // 实施费>500：按比例
      const rate = moduleCount >= 3 ? 0.5 : moduleCount >= 2 ? 0.4 : 0.3;
      totalCommission = implementationFee * rate;
    } else {
      // 实施费≤500：按人天
      totalCommission = implementationDays * 100;
    }

    // 每次计提都创建新记录（支持同一客户多次计提，累加而非覆盖）
    await dbCreateCommissionRecord({
      customer_id,
      commission_month,
      status: status || 'confirmed',
      user_id: userInfo?.id || null,
      amount,
      total_commission: totalCommission,
      paid_commission: 0,
      remark,
      finance_days,
      other_days,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('确认提成失败:', error);
    const msg = error instanceof Error ? error.message : '确认提成失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// 修改提成记录
export async function PUT(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { record_id, amount, remark, finance_days, other_days, commission_month } = body;

    if (!record_id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (amount !== undefined) updates.amount = amount;
    if (remark !== undefined) updates.remark = remark;
    if (finance_days !== undefined) updates.finance_days = finance_days;
    if (other_days !== undefined) updates.other_days = other_days;
    if (commission_month !== undefined) updates.commission_month = commission_month;

    const result = await dbUpdateCommissionRecord(record_id, updates);
    if (!result) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('修改提成记录失败:', error);
    const msg = error instanceof Error ? error.message : '修改提成记录失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// 删除提成记录
export async function DELETE(request: NextRequest) {
  try {
    const recordId = request.nextUrl.searchParams.get('record_id');
    if (!recordId) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const records = await dbGetCommissionRecords({ userId: userInfo?.id, isAdmin });
    const record = records.find((r: any) => r.id === recordId);
    if (!record) {
      return NextResponse.json({ error: '记录不存在或无权操作' }, { status: 404 });
    }

    await dbDeleteCommissionRecord(recordId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除提成记录失败:', error);
    return NextResponse.json({ error: '删除提成记录失败' }, { status: 500 });
  }
}
