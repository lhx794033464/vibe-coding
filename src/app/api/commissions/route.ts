import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { MODULE_CONFIG, COMMISSION_CONFIG, ProductModule } from '@/types';
import { startOfMonth, endOfMonth, format } from 'date-fns';

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
 * 获取提成列表
 * GET /api/commissions
 * 
 * Query params:
 * - month: 月份 (格式: yyyy-MM，默认当月)
 */
export async function GET(request: NextRequest) {
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

    // 获取月份参数
    const searchParams = request.nextUrl.searchParams;
    const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM');
    const monthStart = startOfMonth(new Date(monthParam + '-01'));
    const monthEnd = endOfMonth(monthStart);

    // 获取当月验收完成的客户
    const { data: customers, error: customerError } = await client
      .from('customers')
      .select('*')
      .eq('status', 'accepted')
      .gte('updated_at', monthStart.toISOString())
      .lte('updated_at', monthEnd.toISOString())
      .order('updated_at', { ascending: false });

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 });
    }

    // 获取已有的提成记录
    const customerIds = customers?.map(c => c.id) || [];
    const { data: commissionRecords } = await client
      .from('commission_records')
      .select('*')
      .in('customer_id', customerIds);

    // 按客户ID分组提成记录
    const commissionByCustomer: Record<string, { total: number; records: NonNullable<typeof commissionRecords> }> = {};
    commissionRecords?.forEach(record => {
      if (!commissionByCustomer[record.customer_id]) {
        commissionByCustomer[record.customer_id] = { total: 0, records: [] };
      }
      commissionByCustomer[record.customer_id].total += parseFloat(record.amount);
      commissionByCustomer[record.customer_id].records.push(record);
    });

    // 计算每个客户的提成信息
    const commissionData = customers?.map(customer => {
      const implementationFee = customer.implementation_fee || 0;
      const implementationDays = parseFloat(customer.implementation_days || '0');
      const modules = (customer.modules as ProductModule[]) || [];
      
      const calculation = calculateCommission(implementationFee, implementationDays, modules);
      const paidCommission = commissionByCustomer[customer.id]?.total || 0;
      const remainingCommission = calculation.totalCommission - paidCommission;

      return {
        customerId: customer.id,
        customerName: customer.name,
        implementationFee,
        implementationDays,
        modules,
        modulesLabel: modules.map(m => MODULE_CONFIG[m]?.label).join('、'),
        standardFee: calculation.standardFee,
        feeRatio: calculation.feeRatio,
        commissionType: calculation.commissionType,
        commissionRate: calculation.commissionRate,
        totalCommission: calculation.totalCommission,
        paidCommission,
        remainingCommission,
        isFullyPaid: remainingCommission <= 0,
        records: commissionByCustomer[customer.id]?.records || [],
        acceptedAt: customer.updated_at,
      };
    }).filter(c => !c.isFullyPaid) || []; // 过滤掉已全部计提的

    return NextResponse.json({ 
      data: commissionData,
      month: monthParam,
    });
  } catch (error) {
    console.error('获取提成列表失败:', error);
    return NextResponse.json({ error: '获取提成列表失败' }, { status: 500 });
  }
}

/**
 * 创建提成记录
 * POST /api/commissions
 * 
 * Body:
 * - customer_id: 客户ID
 * - amount: 本次提成金额
 * - remark: 备注
 */
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
    const { customer_id, amount, remark, finance_days, other_days } = body;

    if (!customer_id || !amount) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 获取客户信息计算应提总额
    const { data: customer, error: customerError } = await client
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    const implementationFee = customer.implementation_fee || 0;
    const implementationDays = parseFloat(customer.implementation_days || '0');
    const modules = (customer.modules as ProductModule[]) || [];
    
    // 计算应提总额
    let calculation = calculateCommission(implementationFee, implementationDays, modules);
    
    // 如果提供了人天参数且提成类型为按天计算，则重新计算
    if (calculation.commissionType === 'daily' && (finance_days !== undefined || other_days !== undefined)) {
      const financeDaysNum = parseFloat(finance_days) || 0;
      const otherDaysNum = parseFloat(other_days) || 0;
      const totalCommission = financeDaysNum * COMMISSION_CONFIG.FINANCE_DAILY_COMMISSION + 
                              otherDaysNum * COMMISSION_CONFIG.OTHER_MODULE_DAILY_COMMISSION;
      calculation = {
        ...calculation,
        totalCommission,
      };
    }

    // 获取已提金额
    const { data: existingRecords } = await client
      .from('commission_records')
      .select('amount')
      .eq('customer_id', customer_id);

    const paidCommission = existingRecords?.reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0;
    const remainingCommission = calculation.totalCommission - paidCommission;

    // 检查是否超过剩余提成
    if (parseFloat(amount) > remainingCommission) {
      return NextResponse.json({ 
        error: `本次提成金额不能超过剩余提成 ${remainingCommission.toFixed(2)} 元` 
      }, { status: 400 });
    }

    // 创建提成记录
    const { data, error } = await client
      .from('commission_records')
      .insert({
        customer_id,
        amount,
        total_commission: calculation.totalCommission,
        paid_commission: paidCommission + parseFloat(amount),
        finance_days: finance_days !== undefined ? finance_days : null,
        other_days: other_days !== undefined ? other_days : null,
        remark: remark || null,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建提成记录失败:', error);
    return NextResponse.json({ error: '创建提成记录失败' }, { status: 500 });
  }
}
