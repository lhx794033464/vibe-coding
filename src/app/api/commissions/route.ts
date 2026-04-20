import { NextRequest, NextResponse } from 'next/server';
import { customersStorage, commissionsStorage } from '@/lib/serverStorage';
import { MODULE_CONFIG, COMMISSION_CONFIG, ProductModule } from '@/types';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { getVisibleCustomerIds, filterByCustomerAccess, getCurrentUserInfo, isAdmin } from '@/lib/serverAuth';

/**
 * 计算单个客户的提成
 */
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
  
  // 实施费成交价 > 50%
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
  } 
  // 实施费成交价 ≤ 50%
  else {
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

/**
 * 获取提成列表 - 本地存储模式
 * GET /api/commissions
 */
export async function GET(request: NextRequest) {
  try {
    // 获取月份参数
    const searchParams = request.nextUrl.searchParams;
    const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM');
    const monthStart = startOfMonth(new Date(monthParam + '-01'));
    const monthEnd = endOfMonth(monthStart);

    // 获取所有客户
    const allCustomers = customersStorage.getAll();

    // 获取当月验收完成的客户
    const acceptedCustomers = allCustomers.filter((c: any) => {
      if (c.status !== 'accepted') return false;
      const updatedAt = new Date(c.updated_at);
      return updatedAt >= monthStart && updatedAt <= monthEnd;
    });

    // 获取设置下次计提月份为当前月份的客户
    const scheduledCustomers = allCustomers.filter((c: any) => 
      c.status === 'accepted' && c.next_commission_month === monthParam
    );

    // 合并客户列表（去重）
    const customerMap = new Map();
    [...acceptedCustomers, ...scheduledCustomers].forEach((c: any) => {
      if (!customerMap.has(c.id)) {
        customerMap.set(c.id, c);
      }
    });
    const customers = Array.from(customerMap.values());

    // 数据权限过滤
    const visibleCustomerIds = await getVisibleCustomerIds(request);
    const filteredCustomers = visibleCustomerIds === null
      ? customers
      : customers.filter((c: any) => visibleCustomerIds.includes(c.id));

    // 获取已有的提成记录
    const commissions = commissionsStorage.getAll();
    const filteredCommissions = filterByCustomerAccess(commissions, visibleCustomerIds);
    const commissionMap = new Map(filteredCommissions.map((c: any) => [c.customer_id, c]));

    // 计算每个客户的提成
    const results = filteredCustomers.map((customer: any) => {
      const implementationFee = parseFloat(customer.implementation_fee || '0');
      const implementationDays = parseFloat(customer.implementation_days || '0');
      // 兼容数组和字符串格式的modules
      const rawModules = customer.modules;
      const modules: ProductModule[] = Array.isArray(rawModules) ? rawModules : (typeof rawModules === 'string' && rawModules.length > 0 ? [rawModules] : []);

      const commission = calculateCommission(implementationFee, implementationDays, modules);

      // 检查是否已有提成记录
      const existingRecord = commissionMap.get(customer.id);

      // 计算人天信息
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
        paidCommission: 0, // TODO: 从提成记录中累计
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

    // 统计
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

/**
 * 确认提成 - 本地存储模式
 * POST /api/commissions
 */
export async function POST(request: NextRequest) {
  try {
    // 数据隔离：验证权限
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const body = await request.json();
    const { customer_id, commission_month, status } = body;

    if (!customer_id || !commission_month) {
      return NextResponse.json(
        { error: '客户ID和提成月份不能为空' },
        { status: 400 }
      );
    }

    // 非管理员只能操作自己负责的客户
    if (!isAdmin) {
      const customer = customersStorage.getById(customer_id);
      if (!customer || (customer as any).delivery_consultant !== userInfo?.username) {
        return NextResponse.json({ error: '无权操作此客户' }, { status: 403 });
      }
    }

    // 查找或创建提成记录
    const commissions = commissionsStorage.getAll();
    const existing = commissions.find((c: any) => 
      c.customer_id === customer_id && c.commission_month === commission_month
    );

    if (existing && existing.id) {
      // 更新状态
      commissionsStorage.update(existing.id as string, { status: status || 'confirmed' });
    } else {
      // 创建新记录
      commissionsStorage.create({
        customer_id,
        commission_month,
        status: status || 'confirmed',
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('确认提成失败:', error);
    return NextResponse.json({ error: '确认提成失败' }, { status: 500 });
  }
}

/**
 * 删除提成记录 - 本地存储模式
 * DELETE /api/commissions?record_id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const recordId = request.nextUrl.searchParams.get('record_id');
    if (!recordId) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    // 数据隔离：验证权限
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';
    const record = commissionsStorage.getById(recordId);
    if (!record) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }
    if (!isAdmin) {
      const customer = customersStorage.getById((record as any).customer_id);
      if (!customer || (customer as any).delivery_consultant !== userInfo?.username) {
        return NextResponse.json({ error: '无权操作此记录' }, { status: 403 });
      }
    }

    const success = commissionsStorage.delete(recordId);
    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除提成记录失败:', error);
    return NextResponse.json({ error: '删除提成记录失败' }, { status: 500 });
  }
}
