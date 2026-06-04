import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { COMMISSION_CONFIG } from '@/types';

// POST: 转提提成
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    // 验证管理员权限
    let isAdmin = userInfo.role === 'admin';
    if (!isAdmin) {
      try {
        const sbCheck = getSupabaseClient();
        const { data: dbUser } = await sbCheck
          .from('users')
          .select('role, is_active')
          .eq('id', userInfo.id)
          .single();
        if (dbUser && dbUser.role === 'admin' && dbUser.is_active) {
          isAdmin = true;
        }
      } catch {}
    }

    if (!isAdmin) {
      return NextResponse.json({ error: '仅管理员可操作转提' }, { status: 403 });
    }

    const body = await request.json();
    const { recordId, transferDays, transferFinanceDays, transferOtherDays, targetUserId, remark } = body;

    if (!recordId || !targetUserId) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const totalTransferDays = transferFinanceDays + transferOtherDays;
    if (totalTransferDays <= 0) {
      return NextResponse.json({ error: '转提人天数必须大于0' }, { status: 400 });
    }

    const sb = getSupabaseClient();

    // 1. 获取原始提成记录
    const { data: originalRecord, error: fetchError } = await sb
      .from('commission_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (fetchError || !originalRecord) {
      return NextResponse.json({ error: '未找到原始提成记录' }, { status: 404 });
    }

    const originalAmount = parseFloat(originalRecord.amount || '0');
    const originalFinanceDays = parseFloat(originalRecord.finance_days || '0');
    const originalOtherDays = parseFloat(originalRecord.other_days || '0');
    const originalTotalDays = originalFinanceDays + originalOtherDays;

    // 2. 验证转提人天不超过原始人天
    if (transferFinanceDays > originalFinanceDays) {
      return NextResponse.json({ error: `转提财务人天(${transferFinanceDays})超过原始财务人天(${originalFinanceDays})` }, { status: 400 });
    }
    if (transferOtherDays > originalOtherDays) {
      return NextResponse.json({ error: `转提其他人天(${transferOtherDays})超过原始其他人天(${originalOtherDays})` }, { status: 400 });
    }

    // 3. 计算转提金额
    // 基于原始记录的客户信息重新计算单天金额
    const { data: customer } = await sb
      .from('customers')
      .select('name, implementation_fee, implementation_days, modules')
      .eq('id', originalRecord.customer_id)
      .single();

    let transferAmount = 0;
    if (originalTotalDays > 0) {
      // 按原始金额的平均单价计算
      const dailyRate = originalAmount / originalTotalDays;
      transferAmount = dailyRate * totalTransferDays;
    }

    const remainingAmount = originalAmount - transferAmount;

    // 4. 获取目标顾问信息
    const { data: targetUser } = await sb
      .from('users')
      .select('id, username')
      .eq('id', targetUserId)
      .single();

    if (!targetUser) {
      return NextResponse.json({ error: '未找到目标顾问' }, { status: 404 });
    }

    // 5. 获取源顾问信息
    const { data: sourceUser } = await sb
      .from('users')
      .select('id, username')
      .eq('id', originalRecord.user_id)
      .single();

    const sourceUsername = sourceUser?.username || '未知';
    const customerName = customer?.name || '未知客户';

    // 6. 更新原始记录（减少人天和金额，但保留申报值不变）
    const newFinanceDays = originalFinanceDays - transferFinanceDays;
    const newOtherDays = originalOtherDays - transferOtherDays;
    const newTotalDays = newFinanceDays + newOtherDays;

    const updateData: Record<string, any> = {
      amount: Math.round(remainingAmount * 100) / 100,
      finance_days: newFinanceDays,
      other_days: newOtherDays,
      remark: `${originalRecord.remark || ''} [转出${totalTransferDays}天给${targetUser.username}]`.trim(),
      // reported_* 保持不变（原始申报值）
    };

    // 如果人天全部转出，删除记录
    if (newTotalDays <= 0) {
      const { error: deleteError } = await sb
        .from('commission_records')
        .delete()
        .eq('id', recordId);
      if (deleteError) {
        console.error('删除原始提成记录失败:', deleteError);
        return NextResponse.json({ error: '转提失败' }, { status: 500 });
      }
    } else {
      const { error: updateError } = await sb
        .from('commission_records')
        .update(updateData)
        .eq('id', recordId);
      if (updateError) {
        console.error('更新原始提成记录失败:', updateError);
        return NextResponse.json({ error: '转提失败' }, { status: 500 });
      }
    }

    // 7. 为目标顾问创建新的提成记录
    const transferRemark = `[从${sourceUsername}转提] ${remark || ''}`.trim();
    const { data: newRecord, error: insertError } = await sb
      .from('commission_records')
      .insert({
        customer_id: originalRecord.customer_id,
        amount: Math.round(transferAmount * 100) / 100,
        total_commission: originalRecord.total_commission,
        paid_commission: 0,
        remark: transferRemark,
        user_id: targetUserId,
        finance_days: transferFinanceDays,
        other_days: transferOtherDays,
        commission_month: originalRecord.commission_month || null,
        reported_finance_days: transferFinanceDays,
        reported_other_days: transferOtherDays,
        reported_amount: Math.round(transferAmount * 100) / 100,
      })
      .select()
      .single();

    if (insertError) {
      console.error('创建转提提成记录失败:', insertError);
      // 回滚：恢复原始记录
      if (newTotalDays <= 0) {
        await sb.from('commission_records').insert(originalRecord);
      } else {
        await sb.from('commission_records').update({
          amount: originalRecord.amount,
          finance_days: originalRecord.finance_days,
          other_days: originalRecord.other_days,
          remark: originalRecord.remark,
        }).eq('id', recordId);
      }
      return NextResponse.json({ error: '转提失败' }, { status: 500 });
    }

    // 8. 更新源顾问的 commission_reports.commission_details
    await updateReportDetails(sb, originalRecord.user_id, originalRecord.commission_month);

    // 9. 更新目标顾问的 commission_reports（如有已审批的申报，更新其 commission_details）
    await updateTargetReportDetails(sb, targetUserId, originalRecord.commission_month, {
      customerId: originalRecord.customer_id,
      customerName,
      sourceUsername,
      transferAmount: Math.round(transferAmount * 100) / 100,
      transferFinanceDays,
      transferOtherDays,
      transferRemark,
      newRecordId: newRecord?.id,
    });

    return NextResponse.json({
      success: true,
      message: `已将 ${sourceUsername} 的 ${totalTransferDays} 天提成（¥${Math.round(transferAmount * 100) / 100}）转提给 ${targetUser.username}`,
      details: {
        sourceUser: sourceUsername,
        targetUser: targetUser.username,
        transferDays: totalTransferDays,
        transferAmount: Math.round(transferAmount * 100) / 100,
        remainingDays: newTotalDays,
        remainingAmount: Math.round(remainingAmount * 100) / 100,
      },
    });
  } catch (error) {
    console.error('转提操作失败:', error);
    return NextResponse.json({ error: '转提操作失败' }, { status: 500 });
  }
}

// 更新源顾问的申报详情
async function updateReportDetails(sb: any, userId: string, month: string | null) {
  if (!month) return;

  const { data: reports } = await sb
    .from('commission_reports')
    .select('id, commission_details, status')
    .eq('user_id', userId)
    .eq('month', month);

  if (!reports || reports.length === 0) return;

  for (const report of reports) {
    if (report.status !== 'approved') continue;

    const details = report.commission_details || [];
    // 重新获取该顾问该月的所有提成记录
    const { data: records } = await sb
      .from('commission_records')
      .select('id, customer_id, amount, finance_days, other_days, remark, commission_month, created_at, reported_finance_days, reported_other_days, reported_amount')
      .eq('user_id', userId);

    if (!records) continue;

    // 更新 details 中的 paidCommission 和 records
    for (const detail of details) {
      const customerRecords = records.filter((r: any) => r.customer_id === detail.customerId);
      if (customerRecords.length > 0) {
        detail.paidCommission = customerRecords.reduce((s: number, r: any) => s + parseFloat(r.amount || '0'), 0);
        detail.paidDays = customerRecords.reduce((s: number, r: any) => s + parseFloat(r.finance_days || '0') + parseFloat(r.other_days || '0'), 0);
        detail.paidFinanceDays = customerRecords.reduce((s: number, r: any) => s + parseFloat(r.finance_days || '0'), 0);
        detail.paidOtherDays = customerRecords.reduce((s: number, r: any) => s + parseFloat(r.other_days || '0'), 0);
        // 申报值（原始值，转提后不变）
        detail.reportedFinanceDays = customerRecords.reduce((s: number, r: any) => s + parseFloat(r.reported_finance_days || r.finance_days || '0'), 0);
        detail.reportedOtherDays = customerRecords.reduce((s: number, r: any) => s + parseFloat(r.reported_other_days || r.other_days || '0'), 0);
        detail.reportedAmount = customerRecords.reduce((s: number, r: any) => s + parseFloat(r.reported_amount || r.amount || '0'), 0);
        detail.remainingCommission = Math.max(0, (detail.totalCommission || 0) - detail.paidCommission);
        detail.remainingDays = Math.max(0, (detail.totalMaxDays || 0) - detail.paidDays);
        detail.isFullyPaid = detail.paidCommission >= (detail.totalCommission || 0);
        detail.records = customerRecords.map((r: any) => ({
          id: r.id,
          amount: parseFloat(r.amount || '0'),
          commission_month: r.commission_month,
          created_at: r.created_at,
          remark: r.remark,
          finance_days: parseFloat(r.finance_days || '0'),
          other_days: parseFloat(r.other_days || '0'),
          reported_finance_days: parseFloat(r.reported_finance_days || '0'),
          reported_other_days: parseFloat(r.reported_other_days || '0'),
          reported_amount: parseFloat(r.reported_amount || '0'),
        }));
      }
    }

    // 更新申报的总额
    const totalCommission = details.reduce((s: number, d: any) => s + (d.totalCommission || 0), 0);
    const paidCommission = details.reduce((s: number, d: any) => s + (d.paidCommission || 0), 0);

    await sb
      .from('commission_reports')
      .update({
        commission_details: details,
        total_commission: totalCommission,
        paid_commission: paidCommission,
        remaining_commission: Math.max(0, totalCommission - paidCommission),
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);
  }
}

// 更新目标顾问的申报详情（添加转提记录）
async function updateTargetReportDetails(
  sb: any,
  targetUserId: string,
  month: string | null,
  transferInfo: {
    customerId: string;
    customerName: string;
    sourceUsername: string;
    transferAmount: number;
    transferFinanceDays: number;
    transferOtherDays: number;
    transferRemark: string;
    newRecordId?: string;
  }
) {
  if (!month) return;

  const { data: reports } = await sb
    .from('commission_reports')
    .select('id, commission_details, status')
    .eq('user_id', targetUserId)
    .eq('month', month);

  if (!reports || reports.length === 0) return;

  for (const report of reports) {
    if (report.status !== 'approved') continue;

    const details = report.commission_details || [];

    // 检查是否已有该客户的记录（可能之前就有转提）
    const existingDetail = details.find((d: any) => d.customerId === transferInfo.customerId);

    if (existingDetail) {
      // 更新已有记录
      existingDetail.paidCommission = (existingDetail.paidCommission || 0) + transferInfo.transferAmount;
      existingDetail.paidDays = (existingDetail.paidDays || 0) + transferInfo.transferFinanceDays + transferInfo.transferOtherDays;
      existingDetail.paidFinanceDays = (existingDetail.paidFinanceDays || 0) + transferInfo.transferFinanceDays;
      existingDetail.paidOtherDays = (existingDetail.paidOtherDays || 0) + transferInfo.transferOtherDays;
      existingDetail.remainingCommission = Math.max(0, (existingDetail.totalCommission || 0) - existingDetail.paidCommission);
      existingDetail.remainingDays = Math.max(0, (existingDetail.totalMaxDays || 0) - existingDetail.paidDays);
      existingDetail.isFullyPaid = existingDetail.paidCommission >= (existingDetail.totalCommission || 0);
      if (existingDetail.records && transferInfo.newRecordId) {
        existingDetail.records.push({
          id: transferInfo.newRecordId,
          amount: transferInfo.transferAmount,
          commission_month: month,
          created_at: new Date().toISOString(),
          remark: transferInfo.transferRemark,
          finance_days: transferInfo.transferFinanceDays,
          other_days: transferInfo.transferOtherDays,
          reported_finance_days: transferInfo.transferFinanceDays,
          reported_other_days: transferInfo.transferOtherDays,
          reported_amount: transferInfo.transferAmount,
        });
      }
    } else {
      // 新增一条详情
      details.push({
        customerId: transferInfo.customerId,
        customerName: `[从${transferInfo.sourceUsername}转提] ${transferInfo.customerName}`,
        implementationFee: 0,
        implementationDays: 0,
        modules: [],
        modulesLabel: '转提',
        standardFee: 0,
        feeRatio: 0,
        commissionType: 'daily',
        totalCommission: transferInfo.transferAmount,
        paidCommission: transferInfo.transferAmount,
        remainingCommission: 0,
        isFullyPaid: true,
        records: transferInfo.newRecordId ? [{
          id: transferInfo.newRecordId,
          amount: transferInfo.transferAmount,
          commission_month: month,
          created_at: new Date().toISOString(),
          remark: transferInfo.transferRemark,
          finance_days: transferInfo.transferFinanceDays,
          other_days: transferInfo.transferOtherDays,
          reported_finance_days: transferInfo.transferFinanceDays,
          reported_other_days: transferInfo.transferOtherDays,
          reported_amount: transferInfo.transferAmount,
        }] : [],
        acceptedAt: new Date().toISOString(),
        financeMaxDays: transferInfo.transferFinanceDays,
        otherMaxDays: transferInfo.transferOtherDays,
        totalMaxDays: transferInfo.transferFinanceDays + transferInfo.transferOtherDays,
        paidFinanceDays: transferInfo.transferFinanceDays,
        paidOtherDays: transferInfo.transferOtherDays,
        paidDays: transferInfo.transferFinanceDays + transferInfo.transferOtherDays,
        remainingDays: 0,
      });
    }

    // 更新申报总额
    const totalCommission = details.reduce((s: number, d: any) => s + (d.totalCommission || 0), 0);
    const paidCommission = details.reduce((s: number, d: any) => s + (d.paidCommission || 0), 0);

    await sb
      .from('commission_reports')
      .update({
        commission_details: details,
        total_commission: totalCommission,
        paid_commission: paidCommission,
        remaining_commission: Math.max(0, totalCommission - paidCommission),
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);
  }
}
