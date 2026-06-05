'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle, XCircle, Clock, Eye, Loader2, Inbox, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface DismissalApplication {
  id: string;
  customer_id: string;
  applicant_id: string;
  kbc_screenshot_key: string;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  customer: {
    id: string;
    name: string;
    delivery_consultant: string | null;
    delivery_deadline: string | null;
    dismissed: boolean;
  } | null;
  applicant: {
    id: string;
    username: string;
    role: string;
  } | null;
  reviewer: {
    id: string;
    username: string;
  } | null;
}

export default function WorkbenchPage() {
  const router = useRouter();
  const { isAuthenticated, isAdmin, getAuthHeader } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [applications, setApplications] = useState<DismissalApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingAppId, setRejectingAppId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!isAdmin) {
      router.push('/unauthorized');
      return;
    }
    loadApplications();
  }, [router, isAuthenticated, isAdmin, statusFilter]);

  const loadApplications = async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const response = await fetch(`/api/dismissal-applications${params}`, {
        headers: getAuthHeader(),
      });
      const result = await response.json();
      if (response.ok) {
        setApplications(result.data || []);
      }
    } catch (error) {
      console.error('加载申请列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewScreenshot = async (key: string) => {
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/dismissal-applications/kbc-screenshot?key=${encodeURIComponent(key)}`, {
        headers: getAuthHeader(),
      });
      const result = await response.json();
      if (response.ok && result.url) {
        setPreviewUrl(result.url);
      } else {
        toast.error('获取截图失败');
      }
    } catch (error) {
      console.error('获取截图URL失败:', error);
      toast.error('获取截图失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApprove = async (appId: string) => {
    if (!(await confirm({ description: '确定批准该解散申请吗？批准后客户将被标记为已解散。' }))) return;

    setProcessing(appId);
    try {
      const response = await fetch(`/api/dismissal-applications/${appId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ status: 'approved' }),
      });

      if (response.ok) {
        toast.success('已批准解散申请');
        loadApplications();
      } else {
        const result = await response.json();
        toast.error(result.error || '审批失败');
      }
    } catch (error) {
      console.error('审批失败:', error);
      toast.error('审批失败');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingAppId) return;

    setProcessing(rejectingAppId);
    try {
      const response = await fetch(`/api/dismissal-applications/${rejectingAppId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ status: 'rejected', reject_reason: rejectReason || undefined }),
      });

      if (response.ok) {
        toast.success('已驳回解散申请');
        setShowRejectDialog(false);
        setRejectingAppId(null);
        setRejectReason('');
        loadApplications();
      } else {
        const result = await response.json();
        toast.error(result.error || '审批失败');
      }
    } catch (error) {
      console.error('审批失败:', error);
      toast.error('审批失败');
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">待审批</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">已批准</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">已驳回</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // 统计
  const pendingCount = applications.filter(a => a.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 overflow-auto">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">审批中心</h1>
            <p className="text-gray-500 mt-1">处理人员提交的申请</p>
          </div>
        </div>

        {/* 状态筛选 */}
        <div className="flex items-center gap-2">
          {[
            { value: 'pending', label: '待审批', icon: Clock },
            { value: 'approved', label: '已批准', icon: CheckCircle },
            { value: 'rejected', label: '已驳回', icon: XCircle },
            { value: '', label: '全部', icon: Inbox },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.value}
                variant={statusFilter === item.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setStatusFilter(item.value);
                  setLoading(true);
                }}
                className="relative"
              >
                <Icon className="w-4 h-4 mr-1.5" />
                {item.label}
                {item.value === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 min-w-[18px] text-center">
                    {pendingCount}
                  </span>
                )}
              </Button>
            );
          })}
        </div>

        {/* 申请列表 */}
        {applications.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">
              <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-lg font-medium">暂无{statusFilter === 'pending' ? '待审批' : ''}申请</p>
              <p className="text-sm mt-1">当有人提交解散申请时，会在这里显示</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {applications.map((app) => (
              <Card key={app.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4">
                    {/* 顶部：客户信息 + 状态 */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-lg">
                            {app.customer?.name || '未知客户'}
                          </h3>
                          {getStatusBadge(app.status)}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span>申请人：{app.applicant?.username || '未知'}</span>
                          <span>交付顾问：{app.customer?.delivery_consultant || '-'}</span>
                          {app.customer?.delivery_deadline && (
                            <span>交付截止日：{app.customer.delivery_deadline.split('T')[0]}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">
                        提交于 {formatDate(app.created_at)}
                      </div>
                    </div>

                    {/* KBC截图预览 */}
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewScreenshot(app.kbc_screenshot_key)}
                        disabled={previewLoading}
                      >
                        {previewLoading ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <ImageIcon className="w-4 h-4 mr-1.5" />
                        )}
                        查看KBC截图
                      </Button>
                    </div>

                    {/* 审批信息（已处理的申请） */}
                    {app.status !== 'pending' && (
                      <div className="text-sm text-gray-500 border-t pt-3">
                        <span>
                          {app.status === 'approved' ? '已批准' : '已驳回'}
                          {app.reviewer?.username && ` by ${app.reviewer.username}`}
                          {app.reviewed_at && ` · ${formatDate(app.reviewed_at)}`}
                        </span>
                        {app.reject_reason && (
                          <p className="mt-1 text-red-600">驳回原因：{app.reject_reason}</p>
                        )}
                      </div>
                    )}

                    {/* 操作按钮（待审批） */}
                    {app.status === 'pending' && (
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(app.id)}
                          disabled={processing === app.id}
                        >
                          {processing === app.id ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4 mr-1.5" />
                          )}
                          批准
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => {
                            setRejectingAppId(app.id);
                            setRejectReason('');
                            setShowRejectDialog(true);
                          }}
                          disabled={processing === app.id}
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          驳回
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 截图预览对话框 */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>KBC截图</DialogTitle>
            <DialogDescription>解散申请凭证</DialogDescription>
          </DialogHeader>
          {previewUrl && (
            <div className="border rounded-lg overflow-hidden">
              <img src={previewUrl} alt="KBC截图" className="w-full h-auto" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 驳回对话框 */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>驳回解散申请</DialogTitle>
            <DialogDescription>请填写驳回原因（可选）</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>驳回原因</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请输入驳回原因..."
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectingAppId(null);
                setRejectReason('');
              }}
              disabled={processing === rejectingAppId}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processing === rejectingAppId}
            >
              {processing === rejectingAppId ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  处理中...
                </>
              ) : (
                '确认驳回'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
