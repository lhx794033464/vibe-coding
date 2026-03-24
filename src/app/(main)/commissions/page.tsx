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
import { DollarSign, TrendingUp, Calendar, Loader2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
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
  
  // 人天输入状态（用于实施费≤50%的情况）
  const [financeDays, setFinanceDays] = useState('');
  const [otherDays, setOtherDays] = useState('');
  
  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<{ id: string; customerId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setFinanceDays('');
    setOtherDays('');
    setDialogOpen(true);
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
      
      if (selectedCommission.commissionType === 'daily') {
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
        fetchCommissions();
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
  
  // 自动计算提成（实施费≤50%时）- 输入人天时实时计算
  const handleFinanceDaysChange = (value: string) => {
    setFinanceDays(value);
    const financeDaysNum = parseFloat(value) || 0;
    const otherDaysNum = parseFloat(otherDays) || 0;
    const total = financeDaysNum * 100 + otherDaysNum * 200;
    setCommissionAmount(total.toFixed(2));
  };
  
  const handleOtherDaysChange = (value: string) => {
    setOtherDays(value);
    const financeDaysNum = parseFloat(financeDays) || 0;
    const otherDaysNum = parseFloat(value) || 0;
    const total = financeDaysNum * 100 + otherDaysNum * 200;
    setCommissionAmount(total.toFixed(2));
  };
  
  // 验证人天输入
  const validateDaysInput = () => {
    if (selectedCommission?.commissionType !== 'daily') return true;
    
    const financeDaysNum = parseFloat(financeDays) || 0;
    const otherDaysNum = parseFloat(otherDays) || 0;
    const totalInputDays = financeDaysNum + otherDaysNum;
    const maxDays = selectedCommission.implementationDays;
    
    if (totalInputDays > maxDays) {
      alert(`计提人天之和(${totalInputDays}天)不能大于总实施人天(${maxDays}天)`);
      return false;
    }
    return true;
  };
  
  // 计算剩余可提人天
  const getRemainingDays = () => {
    if (!selectedCommission || selectedCommission.commissionType !== 'daily') {
      return { finance: 0, other: 0, total: 0 };
    }
    
    // 从已提记录中累计人天
    let paidFinanceDays = 0;
    let paidOtherDays = 0;
    
    if (selectedCommission.records) {
      for (const record of selectedCommission.records) {
        const rec = record as { finance_days?: string; other_days?: string };
        paidFinanceDays += parseFloat(rec.finance_days || '0');
        paidOtherDays += parseFloat(rec.other_days || '0');
      }
    }
    
    const totalDays = selectedCommission.implementationDays;
    return {
      finance: totalDays - paidFinanceDays,
      other: totalDays - paidOtherDays,
      total: totalDays - paidFinanceDays - paidOtherDays,
      paidFinanceDays,
      paidOtherDays,
    };
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
                          let paidFinanceDays = 0;
                          let paidOtherDays = 0;
                          if (commission.records) {
                            for (const record of commission.records) {
                              const rec = record as { finance_days?: string; other_days?: string };
                              paidFinanceDays += parseFloat(rec.finance_days || '0');
                              paidOtherDays += parseFloat(rec.other_days || '0');
                            }
                          }
                          const totalPaidDays = paidFinanceDays + paidOtherDays;
                          const totalDays = commission.implementationDays;
                          const progressPercent = totalDays > 0 ? (totalPaidDays / totalDays) * 100 : 0;
                          
                          return (
                            <>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-500">提成进度（人天）</span>
                                <span className="font-medium">
                                  {totalPaidDays.toFixed(1)}天 / {totalDays.toFixed(1)}天
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-green-500 h-2 rounded-full transition-all"
                                  style={{ width: `${Math.min(progressPercent, 100)}%` }}
                                ></div>
                              </div>
                              <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>财务: {paidFinanceDays.toFixed(1)}天</span>
                                <span>其他: {paidOtherDays.toFixed(1)}天</span>
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
                  <div className="ml-4">
                    <Button
                      onClick={() => openCommissionDialog(commission)}
                      disabled={commission.remainingCommission <= 0}
                    >
                      计提提成
                    </Button>
                    <p className="text-xs text-gray-500 mt-1 text-right">
                      剩余: ¥{commission.remainingCommission.toFixed(2)}
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
            <div className="p-3 bg-gray-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">应提总额</span>
                <span className="font-medium">¥{selectedCommission?.totalCommission.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">已提金额</span>
                <span className="font-medium text-green-600">¥{selectedCommission?.paidCommission.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">待提金额</span>
                <span className="font-medium text-orange-600">¥{selectedCommission?.remainingCommission.toFixed(2)}</span>
              </div>
            </div>

            {/* 人天输入（仅当实施费≤50%时显示） */}
            {selectedCommission?.commissionType === 'daily' && (() => {
              const remainingDays = getRemainingDays();
              return (
                <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-blue-900">按天计算提成</p>
                    <p className="text-xs text-blue-700">财务100元/天，其他200元/天</p>
                  </div>
                  
                  {/* 剩余可提人天提示 */}
                  <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
                    剩余可提: {remainingDays.total.toFixed(1)}天 (共{selectedCommission.implementationDays.toFixed(1)}天)
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="financeDays" className="text-sm">财务模块人天</Label>
                      <Input
                        id="financeDays"
                        type="number"
                        min="0"
                        max={remainingDays.finance}
                        step="0.5"
                        value={financeDays}
                        onChange={(e) => handleFinanceDaysChange(e.target.value)}
                        placeholder={`最多${remainingDays.finance.toFixed(1)}天`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="otherDays" className="text-sm">其他模块人天</Label>
                      <Input
                        id="otherDays"
                        type="number"
                        min="0"
                        max={remainingDays.other}
                        step="0.5"
                        value={otherDays}
                        onChange={(e) => handleOtherDaysChange(e.target.value)}
                        placeholder={`最多${remainingDays.other.toFixed(1)}天`}
                      />
                    </div>
                  </div>
                  
                  {/* 人天验证提示 */}
                  {(parseFloat(financeDays) || 0) + (parseFloat(otherDays) || 0) > selectedCommission.implementationDays && (
                    <p className="text-xs text-red-500">
                      计提人天之和不能大于总实施人天({selectedCommission.implementationDays.toFixed(1)}天)
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label htmlFor="amount">本次提成金额</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                max={selectedCommission?.remainingCommission}
                value={commissionAmount}
                onChange={(e) => setCommissionAmount(e.target.value)}
                placeholder={`最多可提 ¥${selectedCommission?.remainingCommission.toFixed(2)}`}
              />
            </div>

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
              disabled={submitting || !commissionAmount || parseFloat(commissionAmount) <= 0}
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
      </div>
    </div>
  );
}
