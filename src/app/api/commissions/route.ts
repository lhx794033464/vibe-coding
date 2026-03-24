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
    const { data: acceptedCustomers, error: customerError } = await client
      .from('customers')
      .select('*')
      .eq('status', 'accepted')
      .gte('updated_at', monthStart.toISOString())
      .lte('updated_at', monthEnd.toISOString())
      .order('updated_at', { ascending: false });

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 });
    }

    // 获取设置下次计提月份为当前月份的客户
    const { data: scheduledCustomers, error: scheduledError } = await client
      .from('customers')
      .select('*')
      .eq('status', 'accepted')
      .eq('next_commission_month', monthParam);

    if (scheduledError) {
      return NextResponse.json({ error: scheduledError.message }, { status: 500 });
    }

    // 合并客户列表（去重）
    const customerMap = new Map();
    [...(acceptedCustomers || []), ...(scheduledCustomers || [])].forEach(c => {
      if (!customerMap.has(c.id)) {
        customerMap.set(c.id, c);
      }
    });
    const customers = Array.from(customerMap.values());

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
    }) || [];

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
    const { customer_id, remark, finance_days, other_days } = body;

    if (!customer_id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }
    
    const financeDaysNum = parseFloat(finance_days) || 0;
    const otherDaysNum = parseFloat(other_days) || 0;
    if (financeDaysNum <= 0 && otherDaysNum <= 0) {
      return NextResponse.json({ error: '请输入至少一个模块的人天' }, { status: 400 });
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
    
    // 计算提成类型和应提总额
    const calculation = calculateCommission(implementationFee, implementationDays, modules);
    const totalInputDays = financeDaysNum + otherDaysNum;
    
    // 根据提成类型计算本次提成金额
    let calculatedAmount: number;
    if (calculation.commissionType === 'percentage') {
      // 按比例计算：金额 = 实施费 × 提成比例 × (计提人天 / 总人天)
      const rate = calculation.commissionRate || 0;
      const ratio = totalInputDays / implementationDays;
      calculatedAmount = implementationFee * rate * ratio;
    } else {
      // 按天计算：财务100元/天，其他200元/天
      calculatedAmount = financeDaysNum * COMMISSION_CONFIG.FINANCE_DAILY_COMMISSION + 
                         otherDaysNum * COMMISSION_CONFIG.OTHER_MODULE_DAILY_COMMISSION;
    }

    // 获取已提金额
    const { data: existingRecords } = await client
      .from('commission_records')
      .select('amount')
      .eq('customer_id', customer_id);

    const paidCommission = existingRecords?.reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0;
    const remainingCommission = calculation.totalCommission - paidCommission;

    // 检查人天是否超过总实施人天
    if (totalInputDays > implementationDays) {
      return NextResponse.json({ 
        error: `计提人天之和(${totalInputDays}天)不能大于总实施人天(${implementationDays}天)` 
      }, { status: 400 });
    }
    
    // 检查计算金额是否超过剩余提成
    if (calculatedAmount > remainingCommission) {
      return NextResponse.json({ 
        error: `本次提成金额 ¥${calculatedAmount.toFixed(2)} 超过剩余提成 ¥${remainingCommission.toFixed(2)}` 
      }, { status: 400 });
    }

    // 创建提成记录
    const { data, error } = await client
      .from('commission_records')
      .insert({
        customer_id,
        amount: calculatedAmount.toFixed(2),
        total_commission: calculation.totalCommission,
        paid_commission: paidCommission + calculatedAmount,
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

    // 如果已全部计提，清空下次计提月份
    const newPaidCommission = paidCommission + calculatedAmount;
    const newRemainingCommission = calculation.totalCommission - newPaidCommission;
    
    if (newRemainingCommission <= 0) {
      await client
        .from('customers')
        .update({ next_commission_month: null })
        .eq('id', customer_id);
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('创建提成记录失败:', error);
    return NextResponse.json({ error: '创建提成记录失败' }, { status: 500 });
  }
}

/**
 * 删除提成记录
 * DELETE /api/commissions?record_id=xxx
 */
export async function DELETE(request: NextRequest) {
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

    const recordId = request.nextUrl.searchParams.get('record_id');
    if (!recordId) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    // 获取记录信息，验证归属
    const { data: record, error: fetchError } = await client
      .from('commission_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (fetchError || !record) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    // 验证记录归属当前用户
    if (record.user_id !== user.id) {
      return NextResponse.json({ error: '无权删除此记录' }, { status: 403 });
    }

    // 删除记录
    const { error: deleteError } = await client
      .from('commission_records')
      .delete()
      .eq('id', recordId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除提成记录失败:', error);
    return NextResponse.json({ error: '删除提成记录失败' }, { status: 500 });
  }
}
