'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, TrendingUp, Calendar, Loader2, ChevronLeft, ChevronRight, ChevronDown, Trash2, Bell, Send, CheckCircle, XCircle, ClipboardList, FileText, Eye, Clock, CheckCheck } from 'lucide-react';
import { CommissionCalculation } from '@/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface CommissionReport {
  id: string;
  user_id: string;
  username: string;
  month: string;
  total_commission: number;
  paid_commission: number;
  remaining_commission: number;
  commission_details: CommissionCalculation[];
  status: 'pending' | 'approved' | 'rejected';
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function CommissionsPage() {
  const { getAuthHeader, isAdmin, user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [commissions, setCommissions] = useState<CommissionCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  // 提成对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<CommissionCalculation | null>(null);
  const [commissionAmount, setCommissionAmount] = useState('');
  const [commissionRemark, setCommissionRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null); // 修改模式下的记录ID
  
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

  // 申报相关状态
  const [reporting, setReporting] = useState(false);
  const [reportStatus, setReportStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [reportComment, setReportComment] = useState<string | null>(null);

  // 管理员审核相关状态
  const [reports, setReports] = useState<CommissionReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewingReport, setReviewingReport] = useState<CommissionReport | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // 详情弹窗
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailReport, setDetailReport] = useState<CommissionReport | null>(null);

  // 管理员标签切换
  const [adminTab, setAdminTab] = useState<'pending' | 'reviewed'>('pending');
  const [collapsedConsultants, setCollapsedConsultants] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const toggleConsultant = (name: string) => {
    setCollapsedConsultants(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // 验收单预览
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState('');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchCommissions();
  }, [currentMonth]);

  useEffect(() => {
    if (isAdmin) {
      fetchReports();
    } else {
      fetchMyReportStatus();
    }
  }, [currentMonth, isAdmin]);

  const fetchMyReportStatus = async () => {
    try {
      const response = await fetch(`/api/commissions/report?month=${currentMonth}`, {
        headers: { ...getAuthHeader() },
      });
      const data = await response.json();
      if (response.ok && data.data && data.data.length > 0) {
        const report = data.data[0];
        setReportStatus(report.status);
        setReportComment(report.review_comment);
      } else {
        setReportStatus('none');
        setReportComment(null);
      }
    } catch (error) {
      console.error('获取申报状态失败:', error);
    }
  };

  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const response = await fetch(`/api/commissions/report?month=${currentMonth}`, {
        headers: { ...getAuthHeader() },
      });
      const data = await response.json();
      if (response.ok) {
        setReports(data.data || []);
      }
    } catch (error) {
      console.error('获取提成申报列表失败:', error);
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchCommissions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/commissions?month=${currentMonth}`, {
        headers: { ...getAuthHeader() },
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

  const handleReportCommission = async (isSupplement = false) => {
    // 只申报金额不为零且已计提的客户
    let reportableCommissions = commissions.filter(c =>
      (c.totalCommission || 0) > 0 && (c.paidCommission || 0) > 0
    );
    if (reportableCommissions.length === 0) {
      toast.warning('本月暂无可申报的提成数据（需已计提且金额不为零）');
      return;
    }

    // 补充申报时，先获取已审批申报的客户列表进行前置过滤
    if (isSupplement && reportStatus === 'approved') {
      try {
        const checkRes = await fetch(`/api/commissions/report?month=${currentMonth}`, {
          headers: { ...getAuthHeader() },
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const approvedReports = (checkData.data || []).filter((r: any) => r.status === 'approved');
          // 收集所有已审批申报中的客户ID
          const approvedCustomerIds = new Set<string>();
          approvedReports.forEach((report: any) => {
            const details = report.commission_details || [];
            details.forEach((d: any) => {
              if (d.customerId) approvedCustomerIds.add(d.customerId);
            });
          });
          // 过滤掉已审批申报中的客户
          const beforeCount = reportableCommissions.length;
          reportableCommissions = reportableCommissions.filter(c => !approvedCustomerIds.has(c.customerId));
          const duplicateCount = beforeCount - reportableCommissions.length;
          if (duplicateCount > 0) {
            toast.info(`${duplicateCount}个客户已在已审批申报中，无需重复申报，将只申报新增部分`);
          }
          if (reportableCommissions.length === 0) {
            toast.info('所有客户均已申报并审批通过，无需补充申报');
            return;
          }
        }
      } catch {
        // 检查失败时继续申报，后端会做重复过滤
      }

      const confirmed = await confirm({ description: `确认补充申报${reportableCommissions.length}个客户的提成？` });
      if (!confirmed) return;
    } else if (reportStatus !== 'none' && reportStatus !== 'pending') {
      const confirmed = await confirm({ description: '本月提成已申报，是否重新申报？' });
      if (!confirmed) return;
    }

    setReporting(true);
    try {
      const totalCommission = reportableCommissions.reduce((sum, c) => sum + (c.totalCommission || 0), 0);
      const totalPaid = reportableCommissions.reduce((sum, c) => sum + (c.paidCommission || 0), 0);
      const totalRemaining = reportableCommissions.reduce((sum, c) => sum + (c.remainingCommission || 0), 0);

      const response = await fetch('/api/commissions/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          month: currentMonth,
          total_commission: totalCommission,
          paid_commission: totalPaid,
          remaining_commission: totalRemaining,
          commission_details: reportableCommissions,
          is_supplement: isSupplement,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setReportStatus('pending');
        let message = data.message || '申报成功';
        // 如果后端检测到重复，附加提示
        if (data.duplicateCount > 0) {
          message += `\n\n${data.duplicateCount}个客户已在已审批申报中，已自动跳过`;
        }
        toast.success(message);
      } else {
        toast.error(data.error || '申报失败');
      }
    } catch (error) {
      console.error('提成申报失败:', error);
      toast.error('提成申报失败');
    } finally {
      setReporting(false);
    }
  };

  const handleMarkCommissioned = async (commission: CommissionCalculation) => {
    if (!(await confirm({ description: `确认将「${commission.customerName}」标记为已计提？标记后将从提成管理中隐藏。` }))) return;
    try {
      const response = await fetch('/api/commissions/mark-commissioned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ customerIds: [commission.customerId] }),
      });
      const data = await response.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      fetchCommissions();
    } catch (error) {
      console.error('标记已计提失败:', error);
      toast.error('标记已计提失败');
    }
  };

  const handleReview = async () => {
    if (!reviewingReport) return;

    setReviewing(true);
    try {
      const response = await fetch('/api/commissions/report', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          id: reviewingReport.id,
          status: reviewAction,
          review_comment: reviewComment,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setReviewDialogOpen(false);
        setReviewingReport(null);
        setReviewComment('');
        fetchReports();
      } else {
        toast.error(data.error || '审核失败');
      }
    } catch (error) {
      console.error('审核失败:', error);
      toast.error('审核失败');
    } finally {
      setReviewing(false);
    }
  };

  const openCommissionDialog = (commission: CommissionCalculation, recordId?: string) => {
    setSelectedCommission(commission);
    setCommissionAmount('');
    setCommissionRemark('');
    setTotalDaysInput('');
    setFinanceDays('');
    setOtherDays('');

    // 修改模式：预填已有记录数据
    if (recordId && commission.records) {
      const record = commission.records.find((r: any) => r.id === recordId);
      if (record) {
        setEditingRecordId(recordId);
        setCommissionAmount(String(record.amount || ''));
        setCommissionRemark(record.remark || '');
        // 从备注中解析人天
        const remark = record.remark || '';
        const totalMatch = remark.match(/计提([\d.]+)天/);
        const financeMatch = remark.match(/财务([\d.]+)天/);
        const otherMatch = remark.match(/其他([\d.]+)天/);
        if (totalMatch) setTotalDaysInput(totalMatch[1]);
        if (financeMatch) setFinanceDays(financeMatch[1]);
        if (otherMatch) setOtherDays(otherMatch[1]);
        if (record.commission_month) setNextCommissionMonth(record.commission_month);
      }
    } else {
      setEditingRecordId(null);
      // 默认设置为下一个月份
      const nextMonth = new Date(currentMonth + '-01');
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      setNextCommissionMonth(format(nextMonth, 'yyyy-MM'));
    }
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
          ...getAuthHeader(),
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
        toast.error(data.error || '设置失败');
      }
    } catch (error) {
      console.error('设置下次计提时间失败:', error);
      toast.error('设置下次计提时间失败');
    } finally {
      setScheduling(false);
    }
  };

  const handleSubmitCommission = async () => {
    if (!selectedCommission) return;
    if (!editingRecordId && !commissionAmount) return;
    
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
      
      if (editingRecordId) {
        // 修改模式：调用 PUT 接口
        const response = await fetch('/api/commissions', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            record_id: editingRecordId,
            amount: parseFloat(commissionAmount),
            remark: finalRemark,
            finance_days: financeDaysParam,
            other_days: otherDaysParam,
            commission_month: nextCommissionMonth,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          setDialogOpen(false);
          setEditingRecordId(null);
          await fetchCommissions();
        } else {
          toast.error(data.error || '修改提成失败');
        }
      } else {
        // 新增模式：调用 POST 接口
        const response = await fetch('/api/commissions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            customer_id: selectedCommission.customerId,
            commission_month: nextCommissionMonth,
            amount: parseFloat(commissionAmount),
            remark: finalRemark,
            finance_days: financeDaysParam,
            other_days: otherDaysParam,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          setDialogOpen(false);
          await fetchCommissions();
        } else {
          toast.error(data.error || '创建提成失败');
        }
      }
    } catch (error) {
      console.error('创建提成失败:', error);
      toast.error('创建提成失败');
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
          ...getAuthHeader(),
        },
      });

      const data = await response.json();
      if (response.ok) {
        setDeleteDialogOpen(false);
        setRecordToDelete(null);
        fetchCommissions();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除提成记录失败:', error);
      toast.error('删除提成记录失败');
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
    
    // 修改模式下，用总额计算（因为会替换已有记录）
    if (editingRecordId) {
      return {
        total: selectedCommission.implementationDays || 0,
        paidFinanceDays: 0,
        paidOtherDays: 0,
        financeMax: selectedCommission.financeMaxDays || 0,
        otherMax: selectedCommission.otherMaxDays || 0,
      };
    }
    
    // 新增计提模式下，使用后端返回的剩余人天数据
    return {
      total: selectedCommission.remainingDays || 0,
      paidFinanceDays: selectedCommission.paidFinanceDays || 0,
      paidOtherDays: selectedCommission.paidOtherDays || 0,
      financeMax: selectedCommission.financeMaxDays || 0,
      otherMax: selectedCommission.otherMaxDays || 0,
    };
  };
  
  // 判断是否还有剩余可提（按天计算用人天判断，按比例计算用金额判断）
  const hasRemainingCommission = (commission: CommissionCalculation) => {
    if (commission.commissionType === 'daily') {
      // 按天计算：使用剩余人天判断
      return (commission.remainingDays || 0) > 0.01;
    } else {
      // 按比例计算：使用剩余金额判断
      return (commission.remainingCommission || 0) > 0.01;
    }
  };
  
  // 获取剩余可提人天（用于列表显示）
  const getListRemainingDays = (commission: CommissionCalculation) => {
    return commission.remainingDays ?? commission.implementationDays ?? 0;
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
        toast.warning('请输入计提人天');
        return false;
      }
      if (daysNum > remainingDays.total) {
        toast.warning(`计提人天(${daysNum}天)不能大于剩余可提人天(${remainingDays.total.toFixed(1)}天)`);
        return false;
      }
    } else {
      // 实施费≤50%：验证财务和其他人天
      const financeDaysNum = parseFloat(financeDays) || 0;
      const otherDaysNum = parseFloat(otherDays) || 0;
      const totalInputDays = financeDaysNum + otherDaysNum;
      
      if (totalInputDays <= 0) {
        toast.warning('请输入计提人天');
        return false;
      }
      
      // 验证总人天不超过剩余可提人天
      if (totalInputDays > remainingDays.total) {
        toast.warning(`计提人天之和(${totalInputDays.toFixed(1)}天)不能大于剩余可提人天(${remainingDays.total.toFixed(1)}天)`);
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
      const totalInputDays = financeDaysNum + otherDaysNum;
      
      return totalInputDays > 0 && totalInputDays <= remainingDays.total;
    }
  };

  const goToNextMonth = () => {
    const date = new Date(currentMonth + '-01');
    date.setMonth(date.getMonth() + 1);
    setCurrentMonth(format(date, 'yyyy-MM'));
  };

  // 计算总提成（只统计已计提且金额不为零的）
  const reportableCommissions = commissions.filter(c => (c.totalCommission || 0) > 0 && (c.paidCommission || 0) > 0);
  const totalCommission = reportableCommissions.reduce((sum, c) => sum + (c.totalCommission || 0), 0);
  const totalPaid = reportableCommissions.reduce((sum, c) => sum + (c.paidCommission || 0), 0);
  const totalRemaining = reportableCommissions.reduce((sum, c) => sum + (c.remainingCommission || 0), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">待审核</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 border-green-300">已通过</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 border-red-300">已驳回</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // 预览验收单
  const handlePreviewDoc = async (customerId: string, customerName: string) => {
    setPreviewDocName(customerName);
    setPreviewLoading(true);
    setPreviewDialogOpen(true);
    setPreviewDocUrl(null);
    try {
      const response = await fetch(`/api/acceptance-doc/view?customer_id=${customerId}`, {
        headers: { ...getAuthHeader() },
      });
      const data = await response.json();
      if (data.has_doc && data.url) {
        setPreviewDocUrl(data.url);
      } else {
        setPreviewDocUrl(null);
      }
    } catch {
      setPreviewDocUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // 按交付顾问分组提成申报（只包含金额不为零且已计提的）
  const groupReportsByConsultant = (reportList: CommissionReport[]) => {
    const grouped: Record<string, { report: CommissionReport; details: CommissionCalculation[] }> = {};
    reportList.forEach(report => {
      const key = report.username;
      if (!grouped[key]) {
        grouped[key] = { report, details: [] };
      }
      if (Array.isArray(report.commission_details)) {
        // 只添加金额不为零且已计提的明细
        const filtered = report.commission_details.filter(d => (d.totalCommission || 0) > 0 && (d.paidCommission || 0) > 0);
        grouped[key].details.push(...filtered);
      }
    });
    // 过滤掉没有符合条件明细的顾问
    return Object.entries(grouped).filter(([, { details }]) => details.length > 0);
  };

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
          {/* 普通用户显示申报按钮 */}
          {!isAdmin && (
            <div className="flex items-center gap-3">
              {reportStatus !== 'none' && (
                <div className="flex items-center gap-2">
                  {getStatusBadge(reportStatus)}
                  {reportComment && (
                    <span className="text-xs text-gray-500 max-w-[200px] truncate" title={reportComment}>
                      {reportComment}
                    </span>
                  )}
                </div>
              )}
              <Button
                onClick={() => handleReportCommission(reportStatus === 'approved')}
                disabled={reporting || commissions.filter(c => (c.totalCommission || 0) > 0 && (c.paidCommission || 0) > 0).length === 0 || reportStatus === 'pending'}
                variant={reportStatus === 'pending' ? 'outline' : (reportStatus === 'rejected' || reportStatus === 'approved') ? 'outline' : 'default'}
                className={(reportStatus === 'rejected' || reportStatus === 'approved') ? 'border-orange-300 text-orange-600 hover:bg-orange-50' : ''}
              >
                {reporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    申报中...
                  </>
                ) : reportStatus === 'pending' ? (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    已申报
                  </>
                ) : reportStatus === 'rejected' ? (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    修改并重新申报
                  </>
                ) : reportStatus === 'approved' ? (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    补充申报
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    申报提成
                  </>
                )}
              </Button>
            </div>
          )}
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

      {/* 管理员视图 */}
      {isAdmin ? (
        <div className="space-y-4">
          {/* 标签切换 */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
            <button
              onClick={() => setAdminTab('pending')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                adminTab === 'pending'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Clock className="w-4 h-4" />
              待审核
              {reports.filter(r => r.status === 'pending').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-destructive/10 text-destructive rounded-full">
                  {reports.filter(r => r.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setAdminTab('reviewed')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                adminTab === 'reviewed'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckCheck className="w-4 h-4" />
              已审核
            </button>
          </div>

          {reportsLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                加载中...
              </CardContent>
            </Card>
          ) : (() => {
            const filteredReports = adminTab === 'pending'
              ? reports.filter(r => r.status === 'pending')
              : reports.filter(r => r.status === 'approved' || r.status === 'rejected');

            if (filteredReports.length === 0) {
              return (
                <Card>
                  <CardContent className="py-8 text-center text-gray-500">
                    {adminTab === 'pending' ? '暂无待审核的提成申报' : '暂无已审核的提成申报'}
                  </CardContent>
                </Card>
              );
            }

            const grouped = groupReportsByConsultant(filteredReports);

            return (
              <div className="space-y-4">
                {grouped.map(([consultantName, { report, details }]) => {
                  const pendingCount = details.length;
                  const totalAmount = details.reduce((s, d) => s + (d.implementationFee || 0), 0);
                  const totalDays = details.reduce((s, d) => s + (d.implementationDays || 0), 0);
                  const totalCommission = details.reduce((s, d) => s + (d.totalCommission || 0), 0);

                  return (
                    <Card key={consultantName} className="overflow-hidden">
                      {/* 顾问头部 */}
                      <div
                        className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b cursor-pointer select-none"
                        onClick={() => toggleConsultant(consultantName)}
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${collapsedConsultants.has(consultantName) ? '-rotate-90' : ''}`} />
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                            {consultantName.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm">{consultantName}</h3>
                            <p className="text-xs text-muted-foreground">
                              {pendingCount}个客户 · 实施金额 ¥{totalAmount.toLocaleString()} · 计提人天 {totalDays.toFixed(1)}天 · 计提金额 ¥{totalCommission.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          {report.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                              onClick={() => {
                                setReviewingReport(report);
                                setReviewAction('approved');
                                setReviewComment('');
                                setReviewDialogOpen(true);
                              }}
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              通过
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => {
                                setReviewingReport(report);
                                setReviewAction('rejected');
                                setReviewComment('');
                                setReviewDialogOpen(true);
                              }}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              驳回
                            </Button>
                          </div>
                        )}
                        {(report.status === 'approved' || report.status === 'rejected') && (
                          <div className="flex items-center gap-2">
                            {getStatusBadge(report.status)}
                            {report.review_comment && (
                              <span className="text-xs text-muted-foreground max-w-[200px] truncate" title={report.review_comment}>
                                {report.review_comment}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      </div>

                      {/* 客户明细列表 */}
                      {!collapsedConsultants.has(consultantName) && (
                      <div className="divide-y">
                        {details.map((detail, idx) => {
                          const fee = detail.implementationFee || 0;
                          const days = detail.implementationDays || 0;
                          const discount = days > 0 ? (fee / (1500 * days)) * 100 : 0;
                          const isDaily = detail.commissionType === 'daily';
                          const financeDays = isDaily ? (detail.financeMaxDays || 0) : 0;
                          const otherDays = isDaily ? (detail.otherMaxDays || 0) : 0;

                          return (
                          <div key={idx} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}</span>
                                <span className="text-sm font-medium truncate">{detail.customerName}</span>
                                {detail.modulesLabel && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                                    {detail.modulesLabel}
                                  </Badge>
                                )}
                              </div>
                              <div className="w-10 flex justify-center shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="预览验收单"
                                  onClick={() => handlePreviewDoc(detail.customerId, detail.customerName)}
                                >
                                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 pl-7 text-xs">
                              <div>
                                <span className="text-muted-foreground">实施金额</span>
                                <span className="ml-1 font-medium">¥{fee.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">购买人天</span>
                                <span className="ml-1 font-medium">{days.toFixed(1)}天</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">实施折扣</span>
                                <span className={`ml-1 font-medium ${discount > 50 ? 'text-primary' : 'text-orange-500'}`}>{discount.toFixed(2)}%</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">计提人天</span>
                                {isDaily && (financeDays > 0 || otherDays > 0) ? (
                                  <span className="ml-1 font-medium">
                                    {financeDays > 0 && <span>财务{financeDays.toFixed(1)}天</span>}
                                    {financeDays > 0 && otherDays > 0 && <span className="text-muted-foreground"> + </span>}
                                    {otherDays > 0 && <span>其他{otherDays.toFixed(1)}天</span>}
                                  </span>
                                ) : (
                                  <span className="ml-1 font-medium">{days.toFixed(1)}天</span>
                                )}
                              </div>
                              <div>
                                <span className="text-muted-foreground">计提金额</span>
                                <span className="ml-1 font-medium text-primary">¥{(detail.totalCommission || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : (
        <>
          {/* 普通用户统计卡片 */}
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

          {/* 普通用户提成列表 */}
          <div className="space-y-4">
            {commissions.length > 0 && (
              <div className="relative">
                <Input
                  placeholder="搜索客户名称..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            )}
            {commissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  本月暂无验收完成的客户
                </CardContent>
              </Card>
            ) : commissions.filter(c => !searchQuery || c.customerName.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  未找到匹配的客户
                </CardContent>
              </Card>
            ) : (
              commissions
                .filter(c => !searchQuery || c.customerName.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((commission) => (
                <Card key={commission.customerId}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* 客户名称和模块 */}
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900">{commission.customerName}</h3>
                          {commission.modules && Array.isArray(commission.modules) && commission.modules.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {commission.modulesLabel}
                            </Badge>
                          )}
                          {(commission.paidCommission || 0) > 0 && (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">已计提</Badge>
                          )}
                        </div>
                        
                        {/* 提成详情 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">实施费</p>
                            <p className="font-medium">¥{(commission.implementationFee || 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">实施人天</p>
                            <p className="font-medium">{(commission.implementationDays || 0).toFixed(2)} 天</p>
                          </div>
                          <div>
                            <p className="text-gray-500">提成类型</p>
                            <p className="font-medium">
                              {commission.commissionType === 'percentage' 
                                ? `按比例 (${((commission.commissionRate || 0) * 100).toFixed(0)}%)` 
                                : '按天计算'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">验收时间</p>
                            <p className="font-medium">{commission.acceptedAt ? format(new Date(commission.acceptedAt), 'yyyy-MM-dd') : '-'}</p>
                          </div>
                        </div>

                        {/* 提成进度 */}
                        <div className="mt-3">
                          {commission.commissionType === 'daily' ? (
                            (() => {
                              const paidFinanceDays = commission.paidFinanceDays || 0;
                              const paidOtherDays = commission.paidOtherDays || 0;
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
                                    <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(progressPercent, 100)}%` }}></div>
                                  </div>
                                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>财务: {paidFinanceDays.toFixed(1)}天</span>
                                    <span>其他: {paidOtherDays.toFixed(1)}天</span>
                                  </div>
                                </>
                              );
                            })()
                          ) : (
                            <>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-500">提成进度</span>
                                <span className="font-medium">
                                  ¥{(commission.paidCommission || 0).toFixed(2)} / ¥{(commission.totalCommission || 0).toFixed(2)}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(((commission.paidCommission || 0) / (commission.totalCommission || 1)) * 100, 100)}%` }}></div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 计提/修改按钮 */}
                      <div className="ml-4 flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" title="标记已计提" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleMarkCommissioned(commission)}>
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          {hasRemainingCommission(commission) && (
                            <Button variant="outline" size="icon" title="设置下次计提时间" onClick={() => openScheduleDialog(commission)}>
                              <Bell className="w-4 h-4" />
                            </Button>
                          )}
                          {reportStatus === 'rejected' && commission.records && commission.records.length > 0 ? (
                            <Button onClick={() => openCommissionDialog(commission, commission.records![commission.records!.length - 1].id)} variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50">
                              修改
                            </Button>
                          ) : (
                            <Button onClick={() => openCommissionDialog(commission)} disabled={!hasRemainingCommission(commission)}>
                              计提提成
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {(() => {
                            const remainingDays = getListRemainingDays(commission);
                            return `剩余: ${remainingDays.toFixed(1)}天`;
                          })()}
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
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => openDeleteDialog(record.id, commission.customerId)}>
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
        </>
      )}

      {/* 提成对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRecordId ? '修改提成' : '计提提成'}</DialogTitle>
            <DialogDescription>
              为客户 <span className="font-semibold">{selectedCommission?.customerName}</span> {editingRecordId ? '修改' : '计提'}提成
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
                        提成比例: {((selectedCommission?.commissionRate || 0) * 100).toFixed(0)}%
                        <span className="mx-2">|</span>
                        应提总额: ¥{(selectedCommission?.totalCommission || 0).toFixed(2)}
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
                          <span>计算公式: ¥{(selectedCommission?.totalCommission || 0).toFixed(2)} × ({daysNum.toFixed(1)}/{totalDays.toFixed(1)})</span>
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
                    {(selectedCommission.paidCommission || 0) > 0 && (
                      <div className="text-sm text-gray-500">
                        已提: ¥{(selectedCommission.paidCommission || 0).toFixed(2)}
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
                      总实施人天: <span className="font-medium">{(selectedCommission?.implementationDays || 0).toFixed(1)}天</span>
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
                        已提: ¥{(selectedCommission?.paidCommission || 0).toFixed(2)}
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
                editingRecordId ? '确认修改' : '确认计提'
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

      {/* 管理员审核对话框 */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reviewAction === 'approved' ? '通过审核' : '驳回申报'}</DialogTitle>
            <DialogDescription>
              {reviewingReport && (
                <>
                  用户 <span className="font-semibold">{reviewingReport.username}</span> 的
                  {format(new Date(reviewingReport.month + '-01'), 'yyyy年M月')} 提成申报
                  （应提总额: ¥{Number(reviewingReport.total_commission).toFixed(2)}）
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reviewComment">审核备注</Label>
              <Textarea
                id="reviewComment"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={reviewAction === 'rejected' ? '请填写驳回原因' : '可选'}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={handleReview}
              disabled={reviewing || (reviewAction === 'rejected' && !reviewComment.trim())}
              variant={reviewAction === 'rejected' ? 'destructive' : 'default'}
              className={reviewAction === 'approved' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {reviewing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  处理中...
                </>
              ) : reviewAction === 'approved' ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  确认通过
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  确认驳回
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 验收单预览对话框 */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              验收单 - {previewDocName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto py-2">
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">加载中...</span>
              </div>
            ) : previewDocUrl ? (
              <iframe
                src={previewDocUrl}
                className="w-full border rounded-lg"
                style={{ height: '60vh' }}
                title="验收单预览"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mb-3 opacity-30" />
                <p>该客户暂未上传验收单</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
      </div>
    </div>
  );
}
