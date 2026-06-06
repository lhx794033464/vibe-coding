'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Upload, Plus, Clock, CheckCircle2, XCircle, FileText, CalendarDays, DollarSign, Users, Eye, Loader2, Search, X } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
}

interface ProcessApplication {
  id: string;
  type: 'group_dismissal' | 'schedule_coordination' | 'commission_claim';
  applicant_id: string;
  customerIds: string[];
  customerNames: string[];
  status: 'pending' | 'approved' | 'rejected';
  kbcScreenshotKeys: string[];
  expected_date: string | null;
  notes: string | null;
  reject_reason: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string | null;
  applicant_name?: string;
  // 兼容旧数据
  customer_name?: string;
  customer_id?: string;
  kbc_screenshot_key?: string;
}

const TYPE_CONFIG = {
  group_dismissal: { label: '群聊解散', icon: Users, color: 'bg-orange-100 text-orange-700' },
  schedule_coordination: { label: '排期协调', icon: CalendarDays, color: 'bg-blue-100 text-blue-700' },
  commission_claim: { label: '提成申报', icon: DollarSign, color: 'bg-green-100 text-green-700' },
};

const STATUS_CONFIG = {
  pending: { label: '待审批', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '已通过', icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  rejected: { label: '已驳回', icon: XCircle, color: 'bg-red-100 text-red-700' },
};

function ProcessCenterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, getAuthHeader } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('pending');
  const [applications, setApplications] = useState<ProcessApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // 新增弹窗状态
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // 全局粘贴监听：群聊解散表单打开时支持粘贴截图
  useEffect(() => {
    if (!showAddDialog || selectedType !== 'group_dismissal') return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const newFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) newFiles.push(file);
        }
      }
      if (newFiles.length > 0) {
        e.preventDefault();
        setScreenshotFiles(prev => [...prev, ...newFiles]);
        toast.success(`已粘贴 ${newFiles.length} 张截图`);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [showAddDialog, selectedType]);

  // 审批弹窗
  const [reviewingApp, setReviewingApp] = useState<ProcessApplication | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // 查看截图
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([]);
  const [currentScreenshotIdx, setCurrentScreenshotIdx] = useState(0);
  const [showScreenshotDialog, setShowScreenshotDialog] = useState(false);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const status = activeTab === 'pending' ? 'pending' : 'approved,rejected';
      const res = await fetch(`/api/process-applications?status=${status}`, {
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      if (res.ok) {
        setApplications(data.data || []);
      }
    } catch (error) {
      console.error('获取流程列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, getAuthHeader]);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers', {
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      if (res.ok) {
        setCustomers((data.customers || []).map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch (error) {
      console.error('获取客户列表失败:', error);
    }
  }, [getAuthHeader]);

  const filteredCustomers = customers.filter((c) =>
    !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    if (showAddDialog) {
      fetchCustomers();
    }
  }, [showAddDialog, fetchCustomers]);

  // 点击外部关闭客户下拉
  useEffect(() => {
    const handleClickOutside = () => setShowCustomerDropdown(false);
    if (showCustomerDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showCustomerDropdown]);

  // 从URL参数自动打开申请表单（管理员不能发起申请）
  useEffect(() => {
    if (isAdmin) return;
    const customerId = searchParams.get('customerId');
    const type = searchParams.get('type');
    if (customerId) {
      setSelectedCustomerIds([customerId]);
      if (type) {
        setSelectedType(type);
      }
      setShowAddDialog(true);
    }
  }, [searchParams, isAdmin]);

  const handleSubmit = async () => {
    if (!selectedType) {
      toast.warning('请选择申请类型');
      return;
    }

    // 提成申报跳转到提成管理
    if (selectedType === 'commission_claim') {
      setShowAddDialog(false);
      router.push('/commissions');
      return;
    }

    if (selectedCustomerIds.length === 0) {
      toast.warning('请选择客户');
      return;
    }

    if (selectedType === 'group_dismissal' && screenshotFiles.length === 0) {
      toast.warning('请上传KBC截图');
      return;
    }

    if (selectedType === 'schedule_coordination' && !expectedDate) {
      toast.warning('请选择期望日期');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('type', selectedType);
      formData.append('customer_ids', JSON.stringify(selectedCustomerIds));
      screenshotFiles.forEach((file, idx) => {
        formData.append(`file_${idx}`, file);
      });
      if (expectedDate) {
        formData.append('expected_date', expectedDate);
      }
      if (notes) {
        formData.append('notes', notes);
      }

      const res = await fetch('/api/process-applications', {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('申请已提交');
        setShowAddDialog(false);
        resetForm();
        fetchApplications();
      } else {
        toast.error(data.error || '提交失败');
      }
    } catch (error) {
      toast.error('提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (appId: string, action: 'approved' | 'rejected') => {
    try {
      setReviewing(true);
      const body: Record<string, unknown> = { status: action };
      if (action === 'rejected' && rejectReason) {
        body.reject_reason = rejectReason;
      }

      const res = await fetch(`/api/process-applications/${appId}`, {
        method: 'PUT',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(action === 'approved' ? '已通过' : '已驳回');
        setShowReviewDialog(false);
        setReviewingApp(null);
        setRejectReason('');
        fetchApplications();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setReviewing(false);
    }
  };

  const handleViewScreenshots = async (keys: string[]) => {
    try {
      setLoadingScreenshot(true);
      setShowScreenshotDialog(true);
      setCurrentScreenshotIdx(0);
      const urls: string[] = [];
      for (const key of keys) {
        const res = await fetch(`/api/process-applications/kbc-screenshot?key=${encodeURIComponent(key)}`, {
          headers: { ...getAuthHeader() },
        });
        const data = await res.json();
        if (res.ok && data.url) {
          urls.push(data.url);
        }
      }
      setScreenshotUrls(urls);
    } catch (error) {
      console.error('获取截图失败:', error);
      toast.error('获取截图失败');
      setShowScreenshotDialog(false);
    } finally {
      setLoadingScreenshot(false);
    }
  };

  const resetForm = () => {
    setSelectedType('');
    setSelectedCustomerIds([]);
    setScreenshotFiles([]);
    setExpectedDate('');
    setNotes('');
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const getTypeLabel = (type: string) => (TYPE_CONFIG as Record<string, { label: string }>)[type]?.label || type;
  const getTypeColor = (type: string) => (TYPE_CONFIG as Record<string, { color: string }>)[type]?.color || '';
  const getStatusLabel = (status: string) => (STATUS_CONFIG as Record<string, { label: string }>)[status]?.label || status;
  const getStatusColor = (status: string) => (STATUS_CONFIG as Record<string, { color: string }>)[status]?.color || '';

  // 获取申请的截图keys（兼容新旧数据格式）
  const getAppScreenshotKeys = (app: ProcessApplication): string[] => {
    if (app.kbcScreenshotKeys && app.kbcScreenshotKeys.length > 0) {
      return app.kbcScreenshotKeys;
    }
    if (app.kbc_screenshot_key) {
      try {
        return JSON.parse(app.kbc_screenshot_key);
      } catch {
        return [app.kbc_screenshot_key];
      }
    }
    return [];
  };

  // 获取申请的客户名称（兼容新旧数据格式）
  const getAppCustomerNames = (app: ProcessApplication): string[] => {
    if (app.customerNames && app.customerNames.length > 0) {
      return app.customerNames;
    }
    if (app.customer_name) {
      return [app.customer_name];
    }
    return [];
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">流程中心</h1>
        {!isAdmin && (
          <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                新增
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>新增申请</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* 申请类型选择 */}
              <div className="space-y-2">
                <Label>申请类型</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择申请类型" />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom">
                    <SelectItem value="group_dismissal">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        群聊解散
                      </div>
                    </SelectItem>
                    <SelectItem value="schedule_coordination">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        排期协调
                      </div>
                    </SelectItem>
                    <SelectItem value="commission_claim">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        提成申报
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 提成申报提示 */}
              {selectedType === 'commission_claim' && (
                <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                  点击提交后将跳转到提成管理页面进行申报
                </div>
              )}

              {/* 群聊解散/排期协调：选择客户（多选） */}
              {(selectedType === 'group_dismissal' || selectedType === 'schedule_coordination') && (
                <div className="space-y-2">
                  <Label>选择客户</Label>
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={selectedCustomerIds.length > 0 ? `已选 ${selectedCustomerIds.length} 个客户，继续搜索...` : '搜索客户...'}
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        className="pl-8"
                      />
                    </div>
                    {showCustomerDropdown && filteredCustomers.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredCustomers.map((c) => {
                          const isSelected = selectedCustomerIds.includes(c.id);
                          return (
                            <div
                              key={c.id}
                              className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center justify-between ${isSelected ? 'bg-accent/50' : ''}`}
                              onClick={() => {
                                setSelectedCustomerIds(prev =>
                                  isSelected
                                    ? prev.filter(id => id !== c.id)
                                    : [...prev, c.id]
                                );
                              }}
                            >
                              <span>{c.name}</span>
                              {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {showCustomerDropdown && customerSearch && filteredCustomers.length === 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg">
                        <div className="px-3 py-3 text-sm text-muted-foreground text-center">未找到匹配客户</div>
                      </div>
                    )}
                    {/* 已选客户标签 */}
                    {selectedCustomerIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedCustomerIds.map(id => {
                          const c = customers.find(c => c.id === id);
                          return c ? (
                            <Badge key={id} variant="secondary" className="gap-1 pr-1">
                              {c.name}
                              <button
                                type="button"
                                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                                onClick={() => setSelectedCustomerIds(prev => prev.filter(i => i !== id))}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 群聊解散：上传KBC截图（多张） */}
              {selectedType === 'group_dismissal' && (
                <div className="space-y-2">
                  <Label>上传KBC截图</Label>
                  <div
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => {
                      const input = document.getElementById('kbc-screenshot-input');
                      input?.click();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        const input = document.getElementById('kbc-screenshot-input');
                        input?.click();
                      }
                    }}
                  >
                    {screenshotFiles.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 justify-center">
                          {screenshotFiles.map((file, idx) => (
                            <div key={idx} className="relative inline-block">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={`截图${idx + 1}`}
                                className="h-20 rounded"
                              />
                              <button
                                type="button"
                                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setScreenshotFiles(prev => prev.filter((_, i) => i !== idx));
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">已选 {screenshotFiles.length} 张，点击继续添加</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">点击选择文件或粘贴截图</p>
                        <p className="text-xs text-muted-foreground/60">支持多张，Ctrl+V 粘贴</p>
                      </div>
                    )}
                    <Input
                      id="kbc-screenshot-input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          setScreenshotFiles(prev => [...prev, ...Array.from(files)]);
                        }
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </div>
                </div>
              )}

              {/* 排期协调：期望日期 */}
              {selectedType === 'schedule_coordination' && (
                <div className="space-y-2">
                  <Label>期望日期</Label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="请选择日期"
                  />
                </div>
              )}

              {/* 排期协调/群聊解散：备注 */}
              {(selectedType === 'group_dismissal' || selectedType === 'schedule_coordination') && (
                <div className="space-y-2">
                  <Label>备注</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="请输入备注信息（可选）"
                    rows={3}
                  />
                </div>
              )}

              {/* 提交按钮 */}
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    提交中...
                  </>
                ) : selectedType === 'commission_claim' ? '前往提成管理' : '提交申请'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Tab 区域 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="inline-flex w-1/5">
          <TabsTrigger value="pending" className="flex-1">待办</TabsTrigger>
          <TabsTrigger value="done" className="flex-1">已办</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">暂无待办流程</div>
          ) : (
            applications.map((app) => {
              const TypeIcon = TYPE_CONFIG[app.type]?.icon || FileText;
              const screenshotKeys = getAppScreenshotKeys(app);
              const customerNames = getAppCustomerNames(app);
              return (
                <Card key={app.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 rounded-lg ${getTypeColor(app.type)}`}>
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground">{getTypeLabel(app.type)}</span>
                            <Badge variant="outline" className={getStatusColor(app.status)}>
                              {getStatusLabel(app.status)}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-0.5">
                            {customerNames.length > 0 && (
                              <p>客户：{customerNames.join('、')}</p>
                            )}
                            {app.expected_date && (
                              <p>期望日期：{app.expected_date}</p>
                            )}
                            {app.notes && (
                              <p>备注：{app.notes}</p>
                            )}
                            <p>申请人：{app.applicant_name || '未知'}</p>
                            <p>申请时间：{formatDate(app.created_at)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        {/* 查看KBC截图 */}
                        {screenshotKeys.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewScreenshots(screenshotKeys)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            截图{screenshotKeys.length > 1 ? `(${screenshotKeys.length})` : ''}
                          </Button>
                        )}
                        {/* 管理员审批按钮 */}
                        {isAdmin && app.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReviewingApp(app);
                              setShowReviewDialog(true);
                            }}
                          >
                            审批
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="done" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">暂无已办流程</div>
          ) : (
            applications.map((app) => {
              const TypeIcon = TYPE_CONFIG[app.type]?.icon || FileText;
              const screenshotKeys = getAppScreenshotKeys(app);
              const customerNames = getAppCustomerNames(app);
              return (
                <Card key={app.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 rounded-lg ${getTypeColor(app.type)}`}>
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground">{getTypeLabel(app.type)}</span>
                            <Badge variant="outline" className={getStatusColor(app.status)}>
                              {getStatusLabel(app.status)}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-0.5">
                            {customerNames.length > 0 && (
                              <p>客户：{customerNames.join('、')}</p>
                            )}
                            {app.expected_date && (
                              <p>期望日期：{app.expected_date}</p>
                            )}
                            {app.notes && (
                              <p>备注：{app.notes}</p>
                            )}
                            {app.reject_reason && (
                              <p className="text-destructive">驳回原因：{app.reject_reason}</p>
                            )}
                            <p>申请人：{app.applicant_name || '未知'}</p>
                            <p>申请时间：{formatDate(app.created_at)}</p>
                            {app.reviewed_at && (
                              <p>审批时间：{formatDate(app.reviewed_at)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        {screenshotKeys.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewScreenshots(screenshotKeys)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            截图{screenshotKeys.length > 1 ? `(${screenshotKeys.length})` : ''}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* 审批弹窗 */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>审批申请</DialogTitle>
          </DialogHeader>
          {reviewingApp && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">申请类型：</span>{getTypeLabel(reviewingApp.type)}</p>
                <p><span className="text-muted-foreground">客户：</span>{getAppCustomerNames(reviewingApp).join('、') || '无'}</p>
                <p><span className="text-muted-foreground">申请人：</span>{reviewingApp.applicant_name || '未知'}</p>
                {reviewingApp.notes && (
                  <p><span className="text-muted-foreground">备注：</span>{reviewingApp.notes}</p>
                )}
                {reviewingApp.expected_date && (
                  <p><span className="text-muted-foreground">期望日期：</span>{reviewingApp.expected_date}</p>
                )}
              </div>
              {/* 审批时查看截图 */}
              {getAppScreenshotKeys(reviewingApp).length > 0 && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewScreenshots(getAppScreenshotKeys(reviewingApp))}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    查看KBC截图
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                <Label>驳回原因（驳回时填写）</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="请输入驳回原因（可选）"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => handleReview(reviewingApp.id, 'approved')}
                  disabled={reviewing}
                >
                  {reviewing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                  通过
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={() => handleReview(reviewingApp.id, 'rejected')}
                  disabled={reviewing}
                >
                  {reviewing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />}
                  驳回
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 查看截图弹窗（支持多张轮播） */}
      <Dialog open={showScreenshotDialog} onOpenChange={setShowScreenshotDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>KBC截图 {screenshotUrls.length > 1 ? `(${currentScreenshotIdx + 1}/${screenshotUrls.length})` : ''}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {loadingScreenshot ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : screenshotUrls.length > 0 ? (
              <>
                <img
                  src={screenshotUrls[currentScreenshotIdx]}
                  alt={`KBC截图${currentScreenshotIdx + 1}`}
                  className="max-w-full max-h-[60vh] rounded-lg"
                />
                {screenshotUrls.length > 1 && (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentScreenshotIdx === 0}
                      onClick={() => setCurrentScreenshotIdx(prev => prev - 1)}
                    >
                      上一张
                    </Button>
                    <span className="text-sm text-muted-foreground">{currentScreenshotIdx + 1} / {screenshotUrls.length}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentScreenshotIdx === screenshotUrls.length - 1}
                      onClick={() => setCurrentScreenshotIdx(prev => prev + 1)}
                    >
                      下一张
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">加载失败</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProcessCenterPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><p className="text-muted-foreground">加载中...</p></div>}>
      <ProcessCenterContent />
    </Suspense>
  );
}
