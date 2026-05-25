import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers, dbGetCommissionRecords, dbCreateCommissionRecord, dbUpdateCommissionRecord, dbDeleteCommissionRecord } from '@/services/dbService';
import { MODULE_CONFIG, COMMISSION_CONFIG, ProductModule } from '@/types';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { getCurrentUserInfo } from '@/lib/serverAuth';

function calculateCommission(
  implementationFee: number,
  implementationDays: number,
  modules: ProductModule[],
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
    const allCustomers = await dbGetCustomers({ userId: userInfo?.id, isAdmin });

    // 当月验收完成的客户
    const acceptedCustomers = allCustomers.filter((c: any) => {
      if (c.status !== 'accepted') return false;
      const updatedAt = new Date(c.updated_at);
      return updatedAt >= monthStart && updatedAt <= monthEnd;
    });

    // 设置下次计提月份为当前月份的客户
    const scheduledCustomers = allCustomers.filter((c: any) =>
      c.status === 'accepted' && c.next_commission_month === monthParam
    );

    // 合并去重
    const customerMap = new Map();
    [...acceptedCustomers, ...scheduledCustomers].forEach((c: any) => {
      if (!customerMap.has(c.id)) {
        customerMap.set(c.id, c);
      }
    });
    const customers = Array.from(customerMap.values());

    // 获取提成记录（根据权限过滤）
    const commissions = await dbGetCommissionRecords({ userId: userInfo?.id, isAdmin });
    const commissionMap = new Map(commissions.map((c: any) => [c.customer_id, c]));

    // 计算提成
    const results = customers.map((customer: any) => {
      const implementationFee = parseFloat(customer.implementation_fee || '0');
      const implementationDays = parseFloat(customer.implementation_days || '0');
      const rawModules = customer.modules;
      const modules: ProductModule[] = Array.isArray(rawModules) ? rawModules : (typeof rawModules === 'string' && rawModules.length > 0 ? [rawModules] : []);

      const commission = calculateCommission(implementationFee, implementationDays, modules);
      const existingRecord = commissionMap.get(customer.id);

      const financeMaxDays = modules.includes('finance')
        ? implementationDays * COMMISSION_CONFIG.FINANCE_DAILY_COMMISSION / COMMISSION_CONFIG.FINANCE_DAILY_COMMISSION
        : 0;
      const otherModuleCount = modules.filter((m: string) => m !== 'finance').length;
      const otherMaxDays = otherModuleCount * implementationDays;

      return {
        customerId: customer.id,
        customerName: customer.name,
        implementationFee,
        implementationDays,
        modules,
        modulesLabel: modules.map((m: ProductModule) => MODULE_CONFIG[m]?.label || m).join('+'),
        standardFee: commission.standardFee,
        feeRatio: commission.feeRatio,
        commissionType: commission.commissionType,
        commissionRate: commission.commissionRate,
        totalCommission: commission.totalCommission,
        paidCommission: 0,
        remainingCommission: commission.totalCommission,
        isFullyPaid: false,
        records: [],
        acceptedAt: customer.updated_at || customer.accepted_at || '',
        financeMaxDays,
        otherMaxDays,
        totalMaxDays: financeMaxDays + otherMaxDays,
        paidFinanceDays: 0,
        paidOtherDays: 0,
        paidDays: 0,
        remainingDays: implementationDays,
      };
    });

    const totalCommission = results.reduce((sum: number, r: any) => sum + r.totalCommission, 0);
    const confirmedCommission = results
      .filter((r: any) => r.status === 'confirmed')
      .reduce((sum: number, r: any) => sum + r.totalCommission, 0);

    return NextResponse.json({
      data: results,
      summary: {
        totalCustomers: results.length,
        totalCommission: Math.round(totalCommission * 100) / 100,
        confirmedCommission: Math.round(confirmedCommission * 100) / 100,
        pendingCommission: Math.round((totalCommission - confirmedCommission) * 100) / 100,
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
      const customer = await dbGetCustomers({ userId: userInfo?.id, isAdmin: false });
      const found = customer.find((c: any) => c.id === customer_id);
      if (!found) {
        return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
      }
    }

    // 查找或创建提成记录
    const existingRecords = await dbGetCommissionRecords({ customerId: customer_id, userId: userInfo?.id, isAdmin });
    const existing = existingRecords.find((c: any) =>
      c.customer_id === customer_id && c.commission_month === commission_month
    );

    if (existing && existing.id) {
      await dbUpdateCommissionRecord(existing.id, { status: status || 'confirmed', amount, remark, finance_days, other_days });
    } else {
      await dbCreateCommissionRecord({
        customer_id,
        commission_month,
        status: status || 'confirmed',
        user_id: userInfo?.id || null,
        amount,
        remark,
        finance_days,
        other_days,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('确认提成失败:', error);
    return NextResponse.json({ error: '确认提成失败' }, { status: 500 });
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
