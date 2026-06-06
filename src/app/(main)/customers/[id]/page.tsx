'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Plus, 
  CheckCircle, 
  XCircle,
  ExternalLink,
  Calendar,
  User,
  Building,
  FileText,
  Clock,
  TrendingUp,
  Trash2,
  FileDown,
  Pencil,
  Upload,
  Eye,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Customer, FollowUpRecord } from '@/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

// 实施日志类型
interface ImplementationLog {
  id: string;
  customer_id: string;
  log_date: string;
  consumed_days: string;
  summary: string;
  meeting_link: string | null;
  created_at: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// 计算交付期截止日
// 默认：开通日期 + 120天；已验收且有剩余人天：延长 remainingDays * 120 天
function computeDeliveryDeadline(openedAt: string | null, extraDays: number = 0) {
  if (!openedAt) return null;
  const base = new Date(openedAt);
  if (isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + 120 + extraDays);
  return base.toISOString().split('T')[0];
}

export default function CustomerDetailPage({ params }: PageProps) {
  const { getAuthHeader, isAdmin } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [implementationLogs, setImplementationLogs] = useState<ImplementationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const logFormRef = useRef<HTMLDivElement>(null);
  const followUpFormRef = useRef<HTMLDivElement>(null);
  const [followUpForm, setFollowUpForm] = useState({
    follow_up_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    content: '',
  });
  const [logForm, setLogForm] = useState({
    log_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    consumed_days: '',
    summary: '',
    meeting_link: '',
  });
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editLogForm, setEditLogForm] = useState({
    log_date: '',
    consumed_days: '',
    summary: '',
    meeting_link: '',
  });
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    sales_order_no: '',
    implementation_order_no: '',
    implementation_fee: '',
    implementation_days: '',
    opened_at: '',
    version: '',
    modules: '',
    industry: '',
    special_requirements: '',
    delivery_consultant: '',
    status: '',
    acceptance_status: '',
    salesperson: '',
    implementation_type: '',
    delivery_deadline: '',
  });
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    const loadCustomer = async () => {
      const { id } = await params;
      if (id) {
        fetchCustomer(id);
        fetchFollowUps(id);
        fetchImplementationLogs(id);
      }
    };
    loadCustomer();
  }, [params]);

  const fetchCustomer = async (id: string) => {
    try {
      const response = await fetch(`/api/customers/${id}`, {
        headers: {
          ...getAuthHeader(),
        },
      });
      const data = await response.json();
      if (response.ok) {
        setCustomer(data.data);
        setEditForm({
          name: data.data.name,
          sales_order_no: data.data.sales_order_no || '',
          implementation_order_no: data.data.implementation_order_no || '',
          implementation_fee: data.data.implementation_fee || '',
          implementation_days: data.data.implementation_days || '',
          opened_at: data.data.opened_at ? data.data.opened_at.split('T')[0] : '',
          version: data.data.version || '',
          modules: Array.isArray(data.data.modules) ? data.data.modules.join(', ') : (data.data.modules || ''),
          industry: data.data.industry || '',
          special_requirements: data.data.special_requirements || '',
          delivery_consultant: data.data.delivery_consultant || '',
          status: data.data.status || '',
          acceptance_status: data.data.acceptance_status || '',
          salesperson: data.data.salesperson || '',
          implementation_type: data.data.implementation_type || '',
          delivery_deadline: data.data.delivery_deadline
            ? (typeof data.data.delivery_deadline === 'string' ? data.data.delivery_deadline.split('T')[0] : String(data.data.delivery_deadline).split('T')[0])
            : '',
        });

      }
    } catch (error) {
      console.error('获取客户详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowUps = async (customerId: string) => {
    try {
      const response = await fetch(`/api/follow-ups?customer_id=${customerId}`, {
        headers: {
          ...getAuthHeader(),
        },
      });
      const data = await response.json();
      if (response.ok) {
        setFollowUps(data.data || []);
      }
    } catch (error) {
      console.error('获取跟进记录失败:', error);
    }
  };

  const fetchImplementationLogs = async (customerId: string) => {
    try {
      const response = await fetch(`/api/implementation-logs?customer_id=${customerId}`, {
        headers: {
          ...getAuthHeader(),
        },
      });
      const data = await response.json();
      if (response.ok) {
        setImplementationLogs(data.data || []);
      }
    } catch (error) {
      console.error('获取实施日志失败:', error);
    }
  };

  const handleUpdateCustomer = async () => {
    if (!customer) return;
    
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          name: editForm.name,
          sales_order_no: editForm.sales_order_no || null,
          implementation_order_no: editForm.implementation_order_no || null,
          implementation_fee: editForm.implementation_fee ? parseInt(editForm.implementation_fee) : null,
          implementation_days: editForm.implementation_days ? parseFloat(editForm.implementation_days) : null,
          opened_at: editForm.opened_at || null,
          version: editForm.version || null,
          modules: editForm.modules.length > 0 ? editForm.modules : null,
          industry: editForm.industry || null,
          special_requirements: editForm.special_requirements || null,
          delivery_consultant: editForm.delivery_consultant || null,
          delivery_deadline: editForm.delivery_deadline || null,
          status: editForm.status,
        }),
      });

      if (response.ok) {
        setEditing(false);
        fetchCustomer(customer.id);
      }
    } catch (error) {
      console.error('更新客户失败:', error);
    }
  };

  const handleAddFollowUp = async () => {
    if (!customer || !followUpForm.content) {
      toast.warning('请填写跟进内容');
      return;
    }

    try {
      const response = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          customer_id: customer.id,
          follow_up_at: followUpForm.follow_up_at,
          content: followUpForm.content,
        }),
      });

      if (response.ok) {
        setFollowUpForm({
          follow_up_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          content: '',
        });
        setShowFollowUpForm(false);
        fetchFollowUps(customer.id);
      }
    } catch (error) {
      console.error('添加跟进记录失败:', error);
    }
  };

  const handleAddImplementationLog = async () => {
    if (!customer || !logForm.summary || !logForm.consumed_days) {
      toast.warning('请填写实施纪要和消耗人天');
      return;
    }

    try {
      const response = await fetch('/api/implementation-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          customer_id: customer.id,
          log_date: logForm.log_date,
          consumed_days: parseFloat(logForm.consumed_days),
          summary: logForm.summary,
          meeting_link: logForm.meeting_link || null,
        }),
      });

      if (response.ok) {
        setLogForm({
          log_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          consumed_days: '',
          summary: '',
          meeting_link: '',
        });
        setShowLogForm(false);
        fetchImplementationLogs(customer.id);
      }
    } catch (error) {
      console.error('添加实施日志失败:', error);
    }
  };

  const handleDeleteImplementationLog = async (logId: string) => {
    if (!(await confirm({ description: '确定删除此实施日志吗？', variant: 'destructive' }))) return;

    try {
      const response = await fetch(`/api/implementation-logs/${logId}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeader(),
        },
      });

      if (response.ok && customer) {
        fetchImplementationLogs(customer.id);
      }
    } catch (error) {
      console.error('删除实施日志失败:', error);
    }
  };

  // 开始编辑实施日志
  const handleStartEditLog = (log: ImplementationLog) => {
    setEditingLogId(log.id);
    setEditLogForm({
      log_date: format(new Date(log.log_date), "yyyy-MM-dd'T'HH:mm"),
      consumed_days: log.consumed_days,
      summary: log.summary,
      meeting_link: log.meeting_link || '',
    });
  };

  // 取消编辑实施日志
  const handleCancelEditLog = () => {
    setEditingLogId(null);
    setEditLogForm({
      log_date: '',
      consumed_days: '',
      summary: '',
      meeting_link: '',
    });
  };

  // 更新实施日志
  const handleUpdateImplementationLog = async () => {
    if (!editingLogId || !customer || !editLogForm.summary || !editLogForm.consumed_days) {
      toast.warning('请填写实施纪要和消耗人天');
      return;
    }

    try {
      const response = await fetch(`/api/implementation-logs/${editingLogId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          log_date: editLogForm.log_date,
          consumed_days: parseFloat(editLogForm.consumed_days),
          summary: editLogForm.summary,
          meeting_link: editLogForm.meeting_link || null,
        }),
      });

      if (response.ok) {
        setEditingLogId(null);
        setEditLogForm({
          log_date: '',
          consumed_days: '',
          summary: '',
          meeting_link: '',
        });
        fetchImplementationLogs(customer.id);
      }
    } catch (error) {
      console.error('更新实施日志失败:', error);
    }
  };

  // 生成验收单
  const handleGenerateAcceptanceDoc = async () => {
    if (!customer) return;
    
    setGeneratingDoc(true);
    try {
      const response = await fetch('/api/acceptance-doc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          customer_id: customer.id,
        }),
      });

      if (!response.ok) {
        throw new Error('生成验收单失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${customer.name}_验收单_${format(new Date(), 'yyyyMMdd')}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('生成验收单失败:', error);
      toast.error('生成验收单失败，请重试');
    } finally {
      setGeneratingDoc(false);
    }
  };

  // 上传验收单
  const handleUploadAcceptanceDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!customer || !e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('customer_id', customer.id);

      const response = await fetch('/api/acceptance-doc/upload', {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '上传失败');
      }

      // 更新客户信息中的验收单key
      setCustomer({ ...customer, acceptance_doc_key: data.file_key } as any);
      toast.success('验收单上传成功');
    } catch (error: any) {
      console.error('上传验收单失败:', error);
      toast.error(error.message || '上传验收单失败，请重试');
    } finally {
      setUploadingDoc(false);
      // 重置 file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 查看验收单
  const handleViewAcceptanceDoc = async () => {
    if (!customer) return;
    
    setViewingDoc(true);
    try {
      const response = await fetch(`/api/acceptance-doc/view?customer_id=${customer.id}`, {
        headers: {
          ...getAuthHeader(),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '获取验收单失败');
      }

      // 在新标签页打开签名URL
      window.open(data.url, '_blank');
    } catch (error: any) {
      console.error('查看验收单失败:', error);
      toast.error(error.message || '查看验收单失败，请重试');
    } finally {
      setViewingDoc(false);
    }
  };

  const handleCancelAcceptance = async () => {
    if (!customer) return;

    if (!(await confirm({ description: '确定撤回此客户的验收状态吗？撤回后该客户将变为未验收状态。', variant: 'destructive' }))) return;

    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          acceptance_status: 'not_accepted',
          acceptance_source: null,
        }),
      });

      if (response.ok) {
        fetchCustomer(customer.id);
      } else {
        const data = await response.json();
        if (data.error) toast.error(data.error);
      }
    } catch (error) {
      console.error('撤回验收状态失败:', error);
    }
  };

  const handleMarkDismissed = () => {
    if (!customer) return;
    router.push(`/workbench?type=group_dismissal&customerId=${customer.id}`);
  };

  const handleCancelDismissed = async () => {
    if (!customer) return;
    if (!(await confirm({ description: '确定取消此客户的已解散状态吗？' }))) return;

    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ dismissed: false }),
      });

      if (response.ok) {
        toast.success('已取消解散状态');
        fetchCustomer(customer.id);
      } else {
        const data = await response.json();
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      console.error('取消解散失败:', error);
      toast.error('操作失败');
    }
  };

  const handleMarkAccepted = async () => {
    if (!customer) return;
    
    if (!(await confirm({ description: '确定将此客户标记为已验收吗？' }))) return;

    try {
      let newDeadline: string | undefined;

      // 如果有剩余人天，提示是否延长交付期
      if (remainingDays > 0) {
        const extendDays = Math.round(remainingDays * 120);
        const extendedDeadline = computeDeliveryDeadline(customer.opened_at, extendDays);
        const baseDeadline = computeDeliveryDeadline(customer.opened_at, 0);
        if (extendedDeadline && baseDeadline && extendedDeadline !== baseDeadline) {
          const shouldExtend = await confirm({
            title: '延长交付期',
            description: `该客户剩余 ${remainingDays} 人天，可延长交付期 ${extendDays} 天至 ${extendedDeadline}。是否延长交付期截止日？`,
            confirmText: '是，延长',
            cancelText: '否，不延长',
          });
          if (shouldExtend) {
            newDeadline = extendedDeadline;
          }
        }
      }

      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          acceptance_status: 'accepted',
          acceptance_source: 'app',
          ...(newDeadline ? { delivery_deadline: newDeadline } : {}),
        }),
      });

      if (response.ok) {
        fetchCustomer(customer.id);
      }
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">客户不存在</p>
        <Button className="mt-4" onClick={() => router.push('/customers')}>
          返回列表
        </Button>
      </div>
    );
  }

  const isOnline = customer.status === 'online';
  const isAccepted = customer.acceptance_status === 'accepted';
  const statusBadgeClass = isOnline
    ? 'bg-green-100 text-green-700 border-green-200'
    : 'bg-red-100 text-red-700 border-red-200';
  const acceptanceBadgeClass = isAccepted
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-gray-100 text-gray-700 border-gray-200';

  // 计算已消耗人天和剩余人天（从实施日志计算）
  const totalConsumedDays = implementationLogs.reduce((sum, log) => sum + parseFloat(log.consumed_days || '0'), 0);
  const remainingDays = parseFloat(customer.implementation_days || '0') - totalConsumedDays;

  const baseDeadline = computeDeliveryDeadline(customer.opened_at, 0);
  const deliveryDeadlineRaw = customer.delivery_deadline;
  const deliveryDeadlineStored = deliveryDeadlineRaw
    ? (typeof deliveryDeadlineRaw === 'string' ? deliveryDeadlineRaw.split('T')[0] : String(deliveryDeadlineRaw).split('T')[0])
    : null;
  const deliveryDeadline = deliveryDeadlineStored || baseDeadline;

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/customers')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <Badge variant="outline" className={statusBadgeClass}>
                {isOnline ? '已上线' : '未上线'}
              </Badge>
              <Badge variant="outline" className={acceptanceBadgeClass}>
                {isAccepted ? '已验收' : '未验收'}
              </Badge>
              {customer?.dismissed && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  已解散
                </Badge>
              )}
              <Badge variant="outline" className={
                customer?.commission_status === '已计提' 
                  ? 'bg-green-50 text-green-700 border-green-200' 
                  : customer?.commission_status === '部分计提'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-gray-50 text-gray-600 border-gray-200'
              }>
                {customer?.commission_status || '未计提'}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* 编辑按钮 */}
            <Button variant="outline" onClick={() => setEditing(!editing)}>
              {editing ? '取消编辑' : '编辑'}
            </Button>
            {/* 验收按钮 */}
            {!isAccepted ? (
              <Button variant="outline" onClick={handleMarkAccepted}>
                <CheckCircle className="w-4 h-4 mr-2" />
                验收
              </Button>
            ) : (
              <Button variant="outline" onClick={handleCancelAcceptance} className="text-orange-600 border-orange-300 hover:bg-orange-50">
                <XCircle className="w-4 h-4 mr-2" />
                取消验收
              </Button>
            )}
            {/* 解散按钮 */}
            {customer?.dismissed ? (
              isAdmin ? (
                <Button variant="outline" onClick={handleCancelDismissed} className="text-blue-600 border-blue-300 hover:bg-blue-50">
                  <XCircle className="w-4 h-4 mr-2" />
                  取消解散
                </Button>
              ) : (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 px-3 py-1.5">
                  已解散
                </Badge>
              )
            ) : (
              <Button variant="outline" onClick={() => router.push(`/workbench?type=group_dismissal&customerId=${customer?.id}`)} className="text-purple-600 border-purple-300 hover:bg-purple-50">
                <CheckCircle className="w-4 h-4 mr-2" />
                解散
              </Button>
            )}
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：客户档案 - 2/3宽度 */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                客户档案
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>客户名称</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>上线状态</Label>
                      <select
                        className="w-full border rounded-md px-3 py-2 bg-background text-foreground text-sm"
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      >
                        <option value="">请选择</option>
                        <option value="online">已上线</option>
                        <option value="not_online">未上线</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>验收状态</Label>
                      <select
                        className="w-full border rounded-md px-3 py-2 bg-background text-foreground text-sm"
                        value={editForm.acceptance_status}
                        onChange={(e) => setEditForm({ ...editForm, acceptance_status: e.target.value })}
                      >
                        <option value="">请选择</option>
                        <option value="accepted">已验收</option>
                        <option value="not_accepted">未验收</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>销售订单号</Label>
                      <Input
                        value={editForm.sales_order_no}
                        onChange={(e) => setEditForm({ ...editForm, sales_order_no: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>实施订单号</Label>
                      <Input
                        value={editForm.implementation_order_no}
                        onChange={(e) => setEditForm({ ...editForm, implementation_order_no: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>实施费（元）</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editForm.implementation_fee}
                        onChange={(e) => setEditForm({ ...editForm, implementation_fee: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>实施人天</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.implementation_days}
                        onChange={(e) => setEditForm({ ...editForm, implementation_days: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>开通时间</Label>
                      <Input
                        type="date"
                        value={editForm.opened_at}
                        onChange={(e) => setEditForm({ ...editForm, opened_at: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>产品版本</Label>
                      <Input
                        value={editForm.version}
                        onChange={(e) => setEditForm({ ...editForm, version: e.target.value })}
                        placeholder="如：专业版、标准版"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>产品模块</Label>
                      <Input
                        value={editForm.modules}
                        onChange={(e) => setEditForm({ ...editForm, modules: e.target.value })}
                        placeholder="如：进销存、财务+进销存"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>项目备注</Label>
                      <Input
                        value={editForm.industry}
                        onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                        placeholder="请输入项目备注"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>业务员</Label>
                      <Input
                        value={editForm.salesperson}
                        onChange={(e) => setEditForm({ ...editForm, salesperson: e.target.value })}
                        placeholder="请输入业务员"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>实施类型</Label>
                      <Input
                        value={editForm.implementation_type}
                        onChange={(e) => setEditForm({ ...editForm, implementation_type: e.target.value })}
                        placeholder="如：新购、续费、增购"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>交付期截止日</Label>
                      <Input
                        type="date"
                        value={editForm.delivery_deadline}
                        onChange={(e) => setEditForm({ ...editForm, delivery_deadline: e.target.value })}
                      />
                      {baseDeadline && (
                        <p className="text-xs text-muted-foreground">
                          系统默认值：{baseDeadline}（开通日+120天）
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                  <div className="space-y-2">
                    <Label>交付顾问</Label>
                    <Input
                      value={editForm.delivery_consultant}
                      onChange={(e) => setEditForm({ ...editForm, delivery_consultant: e.target.value })}
                      placeholder="请输入交付顾问"
                    />
                  </div>
                    <Label>特殊要求</Label>
                    <Textarea
                      value={editForm.special_requirements}
                      onChange={(e) => setEditForm({ ...editForm, special_requirements: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <Button onClick={handleUpdateCustomer}>保存修改</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem icon={<FileText className="w-4 h-4" />} label="销售订单号" value={customer.sales_order_no} />
                    <InfoItem icon={<FileText className="w-4 h-4" />} label="实施订单号" value={customer.implementation_order_no} />
                    <InfoItem icon={<TrendingUp className="w-4 h-4" />} label="实施费" value={customer.implementation_fee ? `${customer.implementation_fee.toLocaleString()} 元` : null} />
                    <InfoItem icon={<Clock className="w-4 h-4" />} label="实施人天" value={customer.implementation_days ? `${parseFloat(customer.implementation_days).toFixed(2)} 天` : null} />
                    <InfoItem icon={<Calendar className="w-4 h-4" />} label="开通时间" value={customer.opened_at ? format(new Date(customer.opened_at), 'yyyy-MM-dd') : null} />
                    <InfoItem icon={<Calendar className="w-4 h-4" />} label="交付期截止日" value={deliveryDeadline} />
                    <InfoItem icon={<User className="w-4 h-4" />} label="交付顾问" value={(customer as any).delivery_consultant} />
                    <InfoItem icon={<User className="w-4 h-4" />} label="业务员" value={(customer as any).salesperson} />
                    <InfoItem icon={<FileText className="w-4 h-4" />} label="实施类型" value={(customer as any).implementation_type} />
                    <InfoItem icon={<Building className="w-4 h-4" />} label="项目备注" value={customer.industry} />
                  </div>
                  {/* 产品版本和模块 */}
                  {(customer.version || customer.modules) && (
                    <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {customer.version && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">产品版本:</span>
                          <Badge variant="outline">
                            {customer.version}
                          </Badge>
                        </div>
                      )}
                      {customer.modules && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">产品模块:</span>
                          <Badge variant="outline" className="text-xs">
                            {Array.isArray(customer.modules) ? customer.modules.join(', ') : String(customer.modules)}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                  <Separator />
                  {/* 人天统计 */}
                  <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-sm text-gray-500">总实施人天</p>
                      <p className="text-xl font-bold text-gray-900">{parseFloat(customer.implementation_days || '0').toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500">已消耗人天</p>
                      <p className="text-xl font-bold text-orange-600">{totalConsumedDays.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500">剩余人天</p>
                      <p className={`text-xl font-bold ${remainingDays < 0 ? 'text-red-600' : 'text-green-600'}`}>{remainingDays.toFixed(2)}</p>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <Label className="text-gray-500">特殊要求</Label>
                    <p className="mt-1 whitespace-pre-wrap">{customer.special_requirements || '-'}</p>
                  </div>
                  <Separator />
                  <div className="text-sm text-gray-400">
                    创建于 {format(new Date(customer.created_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* 右侧：实施日志 + 跟进记录 - 1/3宽度 */}
        <div className="lg:col-span-1 space-y-6">
          {/* 实施日志 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                实施日志
              </CardTitle>
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  onChange={handleUploadAcceptanceDoc}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <FileDown className="w-4 h-4 mr-1" />
                      验收单
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={handleGenerateAcceptanceDoc}
                      disabled={generatingDoc || implementationLogs.length === 0}
                    >
                      <FileDown className="w-4 h-4 mr-2" />
                      {generatingDoc ? '生成中...' : '生成验收单'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingDoc}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingDoc ? '上传中...' : '上传验收单'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleViewAcceptanceDoc}
                      disabled={viewingDoc || !(customer as any)?.acceptance_doc_key}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      {viewingDoc ? '加载中...' : '查看验收单'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" onClick={() => { setShowLogForm(true); setTimeout(() => logFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  添加
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showLogForm && (
                <div ref={logFormRef} className="space-y-3 p-3 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>实施时间</Label>
                      <Input
                        type="datetime-local"
                        value={logForm.log_date}
                        onChange={(e) => setLogForm({ ...logForm, log_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>消耗人天</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={logForm.consumed_days}
                        onChange={(e) => setLogForm({ ...logForm, consumed_days: e.target.value })}
                        placeholder="本次消耗的人天数"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>实施纪要</Label>
                    <Textarea
                      value={logForm.summary}
                      onChange={(e) => setLogForm({ ...logForm, summary: e.target.value })}
                      placeholder="请输入实施纪要"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>会议链接</Label>
                    <Input
                      value={logForm.meeting_link}
                      onChange={(e) => setLogForm({ ...logForm, meeting_link: e.target.value })}
                      placeholder="可选"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddImplementationLog}>保存</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowLogForm(false)}>取消</Button>
                  </div>
                </div>
              )}

              {implementationLogs.length === 0 && !showLogForm ? (
                <p className="text-gray-500 text-center py-4">暂无实施日志</p>
              ) : (
                <div className="space-y-3">
                  {implementationLogs.map((log) => (
                    <div key={log.id} className="p-3 border rounded-lg">
                      {editingLogId === log.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>实施时间</Label>
                              <Input
                                type="datetime-local"
                                value={editLogForm.log_date}
                                onChange={(e) => setEditLogForm({ ...editLogForm, log_date: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>消耗人天</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editLogForm.consumed_days}
                                onChange={(e) => setEditLogForm({ ...editLogForm, consumed_days: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>实施纪要</Label>
                            <Textarea
                              value={editLogForm.summary}
                              onChange={(e) => setEditLogForm({ ...editLogForm, summary: e.target.value })}
                              rows={3}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>会议链接</Label>
                            <Input
                              value={editLogForm.meeting_link}
                              onChange={(e) => setEditLogForm({ ...editLogForm, meeting_link: e.target.value })}
                              placeholder="可选"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleUpdateImplementationLog}>保存</Button>
                            <Button size="sm" variant="outline" onClick={handleCancelEditLog}>取消</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">
                              {format(new Date(log.log_date), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                            </span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-orange-600 border-orange-300">
                                消耗 {parseFloat(log.consumed_days).toFixed(2)} 天
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-gray-400 hover:text-blue-500"
                                onClick={() => handleStartEditLog(log)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-gray-400 hover:text-red-500"
                                onClick={() => handleDeleteImplementationLog(log.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <p className="mt-2 text-sm whitespace-pre-wrap">{log.summary}</p>
                          {log.meeting_link && (
                            <a
                              href={log.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              会议链接
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 跟进记录 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                跟进记录
              </CardTitle>
              <Button size="sm" onClick={() => setShowFollowUpForm(!showFollowUpForm)}>
                <Plus className="w-4 h-4 mr-1" />
                添加
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {showFollowUpForm && (
                <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                  <div className="space-y-2">
                    <Label>跟进时间</Label>
                    <Input
                      type="datetime-local"
                      value={followUpForm.follow_up_at}
                      onChange={(e) => setFollowUpForm({ ...followUpForm, follow_up_at: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>跟进内容</Label>
                    <Textarea
                      value={followUpForm.content}
                      onChange={(e) => setFollowUpForm({ ...followUpForm, content: e.target.value })}
                      placeholder="请输入跟进内容"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddFollowUp}>保存</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowFollowUpForm(false)}>取消</Button>
                  </div>
                </div>
              )}

              {followUps.length === 0 ? (
                <p className="text-gray-500 text-center py-4">暂无跟进记录</p>
              ) : (
                <div className="space-y-3">
                  {followUps.map((record) => (
                    <div key={record.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">
                          {format(new Date(record.follow_up_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                        </span>
                        {record.is_accepted && (
                          <Badge className="bg-green-100 text-green-700">已验收</Badge>
                        )}
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap">{record.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
      </div>
      {ConfirmDialog}

    </div>
  );
}

// 信息项组件
function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number | null }) {
  return (
    <div>
      <Label className="text-gray-500 flex items-center gap-1">
        {icon}
        {label}
      </Label>
      <p className="mt-1">{value || '-'}</p>
    </div>
  );
}
