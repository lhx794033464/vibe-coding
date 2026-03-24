'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, TrendingUp, Calendar, Loader2, ChevronLeft, ChevronRight, Trash2, Bell } from 'lucide-react';
import { CommissionCalculation, VERSION_CONFIG, ProductVersion } from '@/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export default function CommissionsPage() {
  const { session } = useAuth();
  const [commissions, setCommissions] = useState<CommissionCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  // 提成对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<CommissionCalculation | null>(null);
  const [commissionAmount, setCommissionAmount] = useState('');
  const [commissionRemark, setCommissionRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // 人天输入状态
  const [totalDaysInput, setTotalDaysInput] = useState(''); // 实施费>50%时使用
  const [financeDays, setFinanceDays] = useState(''); // 实施费≤50%时使用
  const [otherDays, setOtherDays] = useState(''); // 实施费≤50%时使用
  
  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<{ id: string; customerId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // 下次计提月份
  const [nextCommissionMonth, setNextCommissionMonth] = useState('');
  
  // 设置下次计提时间对话框状态
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [schedulingCommission, setSchedulingCommission] = useState<CommissionCalculation | null>(null);
  const [scheduleMonth, setScheduleMonth] = useState('');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    fetchCommissions();
  }, [session, currentMonth]);

  const fetchCommissions = async () => {
    if (!session?.access_token) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/commissions?month=${currentMonth}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setCommissions(data.data || []);
      }
    } catch (error) {
      console.error('获取提成列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCommissionDialog = (commission: CommissionCalculation) => {
    setSelectedCommission(commission);
    setCommissionAmount('');
    setCommissionRemark('');
    setTotalDaysInput('');
    setFinanceDays('');
    setOtherDays('');
    // 默认设置为下一个月份
    const nextMonth = new Date(currentMonth + '-01');
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setNextCommissionMonth(format(nextMonth, 'yyyy-MM'));
    setDialogOpen(true);
  };
  
  // 打开设置下次计提时间对话框
  const openScheduleDialog = (commission: CommissionCalculation) => {
    setSchedulingCommission(commission);
    // 默认设置为下一个月份
    const nextMonth = new Date(currentMonth + '-01');
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setScheduleMonth(format(nextMonth, 'yyyy-MM'));
    setScheduleDialogOpen(true);
  };
  
  // 设置下次计提时间
  const handleSetSchedule = async () => {
    if (!schedulingCommission || !scheduleMonth) return;
    
    setScheduling(true);
    try {
      const response = await fetch('/api/commissions/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          customer_id: schedulingCommission.customerId,
          next_commission_month: scheduleMonth,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setScheduleDialogOpen(false);
        fetchCommissions();
      } else {
        alert(data.error || '设置失败');
      }
    } catch (error) {
      console.error('设置下次计提时间失败:', error);
      alert('设置下次计提时间失败');
    } finally {
      setScheduling(false);
    }
  };

  const handleSubmitCommission = async () => {
    if (!selectedCommission || !commissionAmount) return;
    
    // 验证人天输入
    if (!validateDaysInput()) return;
    
    setSubmitting(true);
    try {
      // 构建备注信息
      let finalRemark = commissionRemark;
      let financeDaysParam: number | undefined;
      let otherDaysParam: number | undefined;
      
      if (selectedCommission.commissionType === 'percentage') {
        // 实施费>50%：输入总人天
        const totalDaysNum = parseFloat(totalDaysInput) || 0;
        financeDaysParam = totalDaysNum; // 存储总人天
        otherDaysParam = 0;
        const daysInfo = `计提${totalDaysNum}天`;
        finalRemark = commissionRemark ? `${commissionRemark} (${daysInfo})` : daysInfo;
      } else {
        // 实施费≤50%：区分财务和其他人天
        const financeDaysNum = parseFloat(financeDays) || 0;
        const otherDaysNum = parseFloat(otherDays) || 0;
        financeDaysParam = financeDaysNum;
        otherDaysParam = otherDaysNum;
        const daysInfo = `财务${financeDaysNum}天，其他${otherDaysNum}天`;
        finalRemark = commissionRemark ? `${commissionRemark} (${daysInfo})` : daysInfo;
      }
      
      const response = await fetch('/api/commissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          customer_id: selectedCommission.customerId,
          amount: parseFloat(commissionAmount),
          remark: finalRemark,
          finance_days: financeDaysParam,
          other_days: otherDaysParam,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setDialogOpen(false);
        
        // 先刷新列表获取最新数据
        await fetchCommissions();
        
        // 使用后端返回的数据判断是否还有剩余提成
        // 注意：remainingCommission 需要重新计算，因为后端可能更新了
        if (data.data && data.data.remainingCommission > 0) {
          setTimeout(() => {
            openScheduleDialog({
              ...selectedCommission,
              remainingCommission: data.data.remainingCommission,
            });
          }, 300);
        }
      } else {
        alert(data.error || '创建提成失败');
      }
    } catch (error) {
      console.error('创建提成失败:', error);
      alert('创建提成失败');
    } finally {
      setSubmitting(false);
    }
  };
  
  // 打开删除确认对话框
  const openDeleteDialog = (recordId: string, customerId: string) => {
    setRecordToDelete({ id: recordId, customerId });
    setDeleteDialogOpen(true);
  };
  
  // 删除提成记录
  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;
    
    setDeleting(true);
    try {
      const response = await fetch(`/api/commissions?record_id=${recordToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });

      const data = await response.json();
      if (response.ok) {
        setDeleteDialogOpen(false);
        setRecordToDelete(null);
        fetchCommissions();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除提成记录失败:', error);
      alert('删除提成记录失败');
    } finally {
      setDeleting(false);
    }
  };

  const goToPrevMonth = () => {
    const date = new Date(currentMonth + '-01');
    date.setMonth(date.getMonth() - 1);
    setCurrentMonth(format(date, 'yyyy-MM'));
  };
  
  // 计算剩余可提人天
  const getRemainingDays = () => {
    if (!selectedCommission) {
      return { total: 0, paidFinanceDays: 0, paidOtherDays: 0 };
    }
    
    // 使用后端返回的人天数据
    return {
      total: selectedCommission.remainingDays || 0,
      paidFinanceDays: selectedCommission.paidFinanceDays || 0,
      paidOtherDays: selectedCommission.paidOtherDays || 0,
      financeMax: selectedCommission.financeMaxDays || 0,
      otherMax: selectedCommission.otherMaxDays || 0,
    };
  };
  
  // 判断是否还有剩余可提（统一使用剩余提成金额判断）
  const hasRemainingCommission = (commission: CommissionCalculation) => {
    return commission.remainingCommission > 0.01; // 考虑浮点数精度
  };
  
  // 获取剩余可提人天（用于列表显示）
  const getListRemainingDays = (commission: CommissionCalculation) => {
    return commission.remainingDays || 0;
  };
  
  // 实施费>50%时，输入总人天计算提成
  const handleTotalDaysChange = (value: string) => {
    setTotalDaysInput(value);
    const daysNum = parseFloat(value) || 0;
    // 提成 = 总提成 × (输入人天 / 总实施人天)
    const ratio = selectedCommission ? daysNum / selectedCommission.implementationDays : 0;
    const amount = selectedCommission ? selectedCommission.totalCommission * ratio : 0;
    setCommissionAmount(amount.toFixed(2));
  };
  
  // 实施费≤50%时，输入财务人天计算提成
  const handleFinanceDaysChange = (value: string) => {
    setFinanceDays(value);
    const financeDaysNum = parseFloat(value) || 0;
    const otherDaysNum = parseFloat(otherDays) || 0;
    const total = financeDaysNum * 100 + otherDaysNum * 200;
    setCommissionAmount(total.toFixed(2));
  };
  
  // 实施费≤50%时，输入其他人天计算提成
  const handleOtherDaysChange = (value: string) => {
    setOtherDays(value);
    const financeDaysNum = parseFloat(financeDays) || 0;
    const otherDaysNum = parseFloat(value) || 0;
    const total = financeDaysNum * 100 + otherDaysNum * 200;
    setCommissionAmount(total.toFixed(2));
  };
  
  // 验证人天输入
  const validateDaysInput = () => {
    if (!selectedCommission) return false;
    
    const remainingDays = getRemainingDays();
    
    if (selectedCommission.commissionType === 'percentage') {
      // 实施费>50%：验证总人天
      const daysNum = parseFloat(totalDaysInput) || 0;
      if (daysNum <= 0) {
        alert('请输入计提人天');
        return false;
      }
      if (daysNum > remainingDays.total) {
        alert(`计提人天(${daysNum}天)不能大于剩余可提人天(${remainingDays.total.toFixed(1)}天)`);
        return false;
      }
    } else {
      // 实施费≤50%：验证财务和其他人天
      const financeDaysNum = parseFloat(financeDays) || 0;
      const otherDaysNum = parseFloat(otherDays) || 0;
      const totalInputDays = financeDaysNum + otherDaysNum;
      
      if (totalInputDays <= 0) {
        alert('请输入计提人天');
        return false;
      }
      
      // 验证财务人天不超过财务剩余可提
      const remainingFinanceDays = (remainingDays.financeMax || 0) - (remainingDays.paidFinanceDays || 0);
      if (financeDaysNum > remainingFinanceDays) {
        alert(`财务人天(${financeDaysNum}天)不能大于财务剩余可提人天(${remainingFinanceDays.toFixed(1)}天)`);
        return false;
      }
      
      // 验证其他人天不超过其他剩余可提
      const remainingOtherDays = (remainingDays.otherMax || 0) - (remainingDays.paidOtherDays || 0);
      if (otherDaysNum > remainingOtherDays) {
        alert(`其他人天(${otherDaysNum}天)不能大于其他剩余可提人天(${remainingOtherDays.toFixed(1)}天)`);
        return false;
      }
    }
    return true;
  };
  
  // 验证表单是否有效
  const isFormValid = () => {
    if (!selectedCommission) return false;
    
    const remainingDays = getRemainingDays();
    
    if (selectedCommission.commissionType === 'percentage') {
      // 实施费>50%：验证总人天
      const daysNum = parseFloat(totalDaysInput) || 0;
      return daysNum > 0 && daysNum <= remainingDays.total;
    } else {
      // 实施费≤50%：验证财务和其他人天
      const financeDaysNum = parseFloat(financeDays) || 0;
      const otherDaysNum = parseFloat(otherDays) || 0;
      
      const remainingFinanceDays = (remainingDays.financeMax || 0) - (remainingDays.paidFinanceDays || 0);
      const remainingOtherDays = (remainingDays.otherMax || 0) - (remainingDays.paidOtherDays || 0);
      
      // 至少有一个输入，且不超过各自剩余
      return (financeDaysNum > 0 || otherDaysNum > 0) &&
             financeDaysNum <= remainingFinanceDays &&
             otherDaysNum <= remainingOtherDays;
    }
  };

  const goToNextMonth = () => {
    const date = new Date(currentMonth + '-01');
    date.setMonth(date.getMonth() + 1);
    setCurrentMonth(format(date, 'yyyy-MM'));
  };

  // 计算总提成
  const totalCommission = commissions.reduce((sum, c) => sum + c.totalCommission, 0);
  const totalPaid = commissions.reduce((sum, c) => sum + c.paidCommission, 0);
  const totalRemaining = commissions.reduce((sum, c) => sum + c.remainingCommission, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">提成管理</h1>
            <p className="text-gray-500 mt-1">当月验收完成客户的提成计算</p>
          </div>
        </div>

      {/* 月份选择 */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={goToPrevMonth}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-lg font-semibold min-w-[150px] text-center">
          {format(new Date(currentMonth + '-01'), 'yyyy年M月', { locale: zhCN })}
        </div>
        <Button variant="outline" size="icon" onClick={goToNextMonth}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">应提总额</p>
                <p className="text-2xl font-bold text-gray-900">¥{totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">已提金额</p>
                <p className="text-2xl font-bold text-green-600">¥{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">待提金额</p>
                <p className="text-2xl font-bold text-orange-600">¥{totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 提成列表 */}
      <div className="space-y-4">
        {commissions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              本月暂无验收完成的客户
            </CardContent>
          </Card>
        ) : (
          commissions.map((commission) => (
            <Card key={commission.customerId}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* 客户名称和模块 */}
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">{commission.customerName}</h3>
                      {commission.modules.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {commission.modulesLabel}
                        </Badge>
                      )}
                    </div>
                    
                    {/* 提成详情 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">实施费</p>
                        <p className="font-medium">¥{commission.implementationFee.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">实施人天</p>
                        <p className="font-medium">{commission.implementationDays.toFixed(2)} 天</p>
                      </div>
                      <div>
                        <p className="text-gray-500">提成类型</p>
                        <p className="font-medium">
                          {commission.commissionType === 'percentage' 
                            ? `按比例 (${(commission.commissionRate! * 100).toFixed(0)}%)` 
                            : '按天计算'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">验收时间</p>
                        <p className="font-medium">{format(new Date(commission.acceptedAt), 'yyyy-MM-dd')}</p>
                      </div>
                    </div>

                    {/* 提成进度 */}
                    <div className="mt-3">
                      {commission.commissionType === 'daily' ? (
                        // 按天计算时显示人天进度
                        (() => {
                          // 使用后端返回的人天数据
                          const paidFinanceDays = commission.paidFinanceDays || 0;
                          const paidOtherDays = commission.paidOtherDays || 0;
                          const financeMaxDays = commission.financeMaxDays || 0;
                          const otherMaxDays = commission.otherMaxDays || 0;
                          const totalPaidDays = paidFinanceDays + paidOtherDays;
                          const totalMaxDays = commission.totalMaxDays || commission.implementationDays;
                          const progressPercent = totalMaxDays > 0 ? (totalPaidDays / totalMaxDays) * 100 : 0;
                          
                          return (
                            <>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-500">提成进度（人天）</span>
                                <span className="font-medium">
                                  {totalPaidDays.toFixed(1)}天 / {totalMaxDays.toFixed(1)}天
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-green-500 h-2 rounded-full transition-all"
                                  style={{ width: `${Math.min(progressPercent, 100)}%` }}
                                ></div>
                              </div>
                              <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>财务: {paidFinanceDays.toFixed(1)}天/{financeMaxDays.toFixed(1)}天</span>
                                <span>其他: {paidOtherDays.toFixed(1)}天/{otherMaxDays.toFixed(1)}天</span>
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        // 按比例计算时显示金额进度
                        <>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-500">提成进度</span>
                            <span className="font-medium">
                              ¥{commission.paidCommission.toFixed(2)} / ¥{commission.totalCommission.toFixed(2)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min((commission.paidCommission / commission.totalCommission) * 100, 100)}%` }}
                            ></div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 计提按钮 */}
                  <div className="ml-4 flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      {/* 设置下次计提时间 - 只有还有剩余时才显示 */}
                      {hasRemainingCommission(commission) && (
                        <Button
                          variant="outline"
                          size="icon"
                          title="设置下次计提时间"
                          onClick={() => openScheduleDialog(commission)}
                        >
                          <Bell className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        onClick={() => openCommissionDialog(commission)}
                        disabled={!hasRemainingCommission(commission)}
                      >
                        计提提成
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      {commission.commissionType === 'daily' ? (
                        // 按天计算显示剩余人天
                        (() => {
                          const remainingDays = getListRemainingDays(commission);
                          return `剩余: ${remainingDays.toFixed(1)}天`;
                        })()
                      ) : (
                        // 按比例计算显示剩余金额
                        `剩余: ¥${commission.remainingCommission.toFixed(2)}`
                      )}
                    </p>
                  </div>
                </div>

                {/* 已提记录 */}
                {commission.records && commission.records.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-500 mb-2">已提记录:</p>
                    <div className="space-y-1">
                      {commission.records.map((record: { id: string; amount: string; remark: string | null; created_at: string }) => (
                        <div key={record.id} className="flex items-center justify-between text-sm group">
                          <span className="text-gray-600">
                            {format(new Date(record.created_at), 'yyyy-MM-dd HH:mm')}
                            {record.remark && ` - ${record.remark}`}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-green-600">+¥{parseFloat(record.amount).toFixed(2)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => openDeleteDialog(record.id, commission.customerId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 提成对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>计提提成</DialogTitle>
            <DialogDescription>
              为客户 <span className="font-semibold">{selectedCommission?.customerName}</span> 计提提成
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 人天输入 */}
            {selectedCommission?.commissionType === 'percentage' ? (
              // 实施费>50%：输入总人天
              (() => {
                const remainingDays = getRemainingDays();
                const daysNum = parseFloat(totalDaysInput) || 0;
                const ratio = selectedCommission ? daysNum / selectedCommission.implementationDays : 0;
                const calculatedAmount = selectedCommission ? selectedCommission.totalCommission * ratio : 0;
                const totalDays = selectedCommission?.implementationDays || 0;
                
                return (
                  <div className="space-y-4">
                    {/* 提示信息 */}
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-sm text-purple-900 font-medium">按比例计算提成</p>
                      <p className="text-xs text-purple-700 mt-1">
                        提成比例: {(selectedCommission?.commissionRate! * 100).toFixed(0)}%
                        <span className="mx-2">|</span>
                        应提总额: ¥{selectedCommission?.totalCommission.toFixed(2)}
                      </p>
                    </div>
                    
                    {/* 人天信息 */}
                    <div className="text-sm text-gray-600">
                      总实施人天: <span className="font-medium">{totalDays.toFixed(1)}天</span>
                      <span className="mx-2">|</span>
                      剩余可提: <span className="font-medium text-orange-600">{remainingDays.total.toFixed(1)}天</span>
                    </div>
                    
                    {/* 总人天输入 */}
                    <div className="space-y-2">
                      <Label htmlFor="totalDays">计提人天</Label>
                      <Input
                        id="totalDays"
                        type="number"
                        min="0"
                        max={remainingDays.total}
                        step="0.5"
                        value={totalDaysInput}
                        onChange={(e) => handleTotalDaysChange(e.target.value)}
                        placeholder={`最多${remainingDays.total.toFixed(1)}天`}
                      />
                    </div>
                    
                    {/* 验证提示 */}
                    {daysNum > remainingDays.total && (
                      <p className="text-sm text-red-500">
                        计提人天({daysNum.toFixed(1)}天)不能大于剩余可提人天({remainingDays.total.toFixed(1)}天)
                      </p>
                    )}
                    
                    {/* 计算结果 */}
                    {daysNum > 0 && daysNum <= remainingDays.total && (
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600">计提人天</span>
                          <span className="font-medium">{daysNum.toFixed(1)}天</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                          <span>计算公式: ¥{selectedCommission?.totalCommission.toFixed(2)} × ({daysNum.toFixed(1)}/{totalDays.toFixed(1)})</span>
                        </div>
                        <div className="pt-2 border-t border-green-200">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-green-900">本次应提金额</span>
                            <span className="text-xl font-bold text-green-600">¥{calculatedAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 已提记录 */}
                    {selectedCommission.paidCommission > 0 && (
                      <div className="text-sm text-gray-500">
                        已提: ¥{selectedCommission.paidCommission.toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              // 实施费≤50%：区分财务和其他人天
              (() => {
                const remainingDays = getRemainingDays();
                const financeDaysNum = parseFloat(financeDays) || 0;
                const otherDaysNum = parseFloat(otherDays) || 0;
                const totalDays = financeDaysNum + otherDaysNum;
                const calculatedAmount = financeDaysNum * 100 + otherDaysNum * 200;
                
                return (
                  <div className="space-y-4">
                    {/* 提示信息 */}
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-900 font-medium">按天计算提成</p>
                      <p className="text-xs text-blue-700 mt-1">财务模块: 100元/天，其他模块: 200元/天</p>
                    </div>
                    
                    {/* 人天信息 */}
                    <div className="text-sm text-gray-600">
                      总实施人天: <span className="font-medium">{selectedCommission?.implementationDays.toFixed(1)}天</span>
                      <span className="mx-2">|</span>
                      剩余可提: <span className="font-medium text-orange-600">{remainingDays.total.toFixed(1)}天</span>
                    </div>
                    
                    {/* 人天输入 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="financeDays">财务模块人天</Label>
                        <Input
                          id="financeDays"
                          type="number"
                          min="0"
                          step="0.5"
                          value={financeDays}
                          onChange={(e) => handleFinanceDaysChange(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="otherDays">其他模块人天</Label>
                        <Input
                          id="otherDays"
                          type="number"
                          min="0"
                          step="0.5"
                          value={otherDays}
                          onChange={(e) => handleOtherDaysChange(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    
                    {/* 人天验证提示 */}
                    {totalDays > (selectedCommission?.implementationDays || 0) && (
                      <p className="text-sm text-red-500">
                        计提人天之和({totalDays.toFixed(1)}天)不能大于总实施人天({selectedCommission?.implementationDays.toFixed(1)}天)
                      </p>
                    )}
                    
                    {/* 计算结果 */}
                    {totalDays > 0 && totalDays <= (selectedCommission?.implementationDays || 0) && (
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600">计提人天</span>
                          <span className="font-medium">{totalDays.toFixed(1)}天</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-500 mb-1">
                          <span>财务 {financeDaysNum.toFixed(1)}天 × ¥100</span>
                          <span>¥{(financeDaysNum * 100).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                          <span>其他 {otherDaysNum.toFixed(1)}天 × ¥200</span>
                          <span>¥{(otherDaysNum * 200).toFixed(2)}</span>
                        </div>
                        <div className="pt-2 border-t border-green-200">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-green-900">本次应提金额</span>
                            <span className="text-xl font-bold text-green-600">¥{calculatedAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 已提记录 */}
                    {(selectedCommission?.paidCommission || 0) > 0 && (
                      <div className="text-sm text-gray-500">
                        已提: ¥{selectedCommission?.paidCommission.toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })()
            )}

            <div className="space-y-2">
              <Label htmlFor="remark">备注</Label>
              <Textarea
                id="remark"
                value={commissionRemark}
                onChange={(e) => setCommissionRemark(e.target.value)}
                placeholder="可选"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={handleSubmitCommission}
              disabled={submitting || !isFormValid()}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  处理中...
                </>
              ) : (
                '确认计提'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这条提成记录吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteRecord}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 设置下次计提时间对话框 */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>设置下次计提时间</DialogTitle>
            <DialogDescription>
              为客户 <span className="font-semibold">{schedulingCommission?.customerName}</span> 设置下次计提月份
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="scheduleMonth">下次计提月份</Label>
              <p className="text-xs text-gray-500">到达该月份时，此客户将出现在当月应计提列表中</p>
              <Input
                id="scheduleMonth"
                type="month"
                value={scheduleMonth}
                onChange={(e) => setScheduleMonth(e.target.value)}
                min={currentMonth}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={handleSetSchedule}
              disabled={scheduling || !scheduleMonth}
            >
              {scheduling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  设置中...
                </>
              ) : (
                '确认设置'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
