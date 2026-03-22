'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Plus, AlertCircle, Eye, Download, MessageSquare, Calendar, Loader2, ExternalLink } from 'lucide-react';
import { Customer, CustomerStatus, STATUS_CONFIG } from '@/types';
import { formatDistanceToNow, format, addHours } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// 扩展Customer类型，包含计算字段
interface CustomerWithDays extends Customer {
  consumed_days: number;
  remaining_days: number;
}

// 排期对话框状态
interface ScheduleDialogState {
  open: boolean;
  customer: CustomerWithDays | null;
  subject: string;
  date: string;
  time: string;
  duration: number;
  loading: boolean;
  result: {
    meetingUrl: string;
    meetingCode: string;
    subject: string;
    startTime: number;
    duration: number;
    message?: string;
  } | null;
}

export default function CustomersPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerWithDays[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // 排期对话框状态
  const [scheduleDialog, setScheduleDialog] = useState<ScheduleDialogState>({
    open: false,
    customer: null,
    subject: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(addHours(new Date(), 1), 'HH:mm'),
    duration: 60,
    loading: false,
    result: null,
  });

  useEffect(() => {
    fetchCustomers();
  }, [session, statusFilter]);

  const fetchCustomers = async () => {
    if (!session?.access_token) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      const response = await fetch(`/api/customers?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setCustomers(data.data || []);
      }
    } catch (error) {
      console.error('获取客户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // 导出数据
  const handleExport = async () => {
    if (!session?.access_token) return;
    
    try {
      const response = await fetch('/api/export', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers_${Date.now()}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  // 打开排期对话框
  const openScheduleDialog = (customer: CustomerWithDays) => {
    setScheduleDialog({
      open: true,
      customer,
      subject: `${customer.name} - 项目实施沟通`,
      date: format(new Date(), 'yyyy-MM-dd'),
      time: format(addHours(new Date(), 1), 'HH:mm'),
      duration: 60,
      loading: false,
      result: null,
    });
  };

  // 创建腾讯会议
  const handleCreateMeeting = async () => {
    if (!scheduleDialog.customer || !scheduleDialog.subject || !scheduleDialog.date || !scheduleDialog.time) {
      return;
    }

    setScheduleDialog(prev => ({ ...prev, loading: true, result: null }));

    try {
      // 计算开始时间戳 (秒)
      const startDateTime = new Date(`${scheduleDialog.date}T${scheduleDialog.time}`);
      const startTime = Math.floor(startDateTime.getTime() / 1000);

      const response = await fetch('/api/tencent-meeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          subject: scheduleDialog.subject,
          startTime,
          duration: scheduleDialog.duration,
          customerId: scheduleDialog.customer.id,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setScheduleDialog(prev => ({
          ...prev,
          loading: false,
          result: data.data,
        }));
      } else {
        alert(data.error || '创建会议失败');
        setScheduleDialog(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('创建会议失败:', error);
      alert('创建会议失败');
      setScheduleDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // 检查是否长时间未跟进（超过7天）
  const isStaleFollowUp = (customer: CustomerWithDays) => {
    if (!customer.last_follow_up_at) return true; // 从未跟进
    const lastFollowUp = new Date(customer.last_follow_up_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - lastFollowUp.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 7;
  };

  // 格式化人天数字
  const formatDays = (days: number | string | null | undefined) => {
    if (days === null || days === undefined) return '0';
    const num = typeof days === 'string' ? parseFloat(days) : days;
    return num.toFixed(2).replace(/\.?0+$/, '') || '0'; // 移除末尾的0
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">客户列表</h1>
          <p className="text-gray-500 mt-1">共 {filteredCustomers.length} 个客户</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            导出
          </Button>
          <Button onClick={() => router.push('/customers/new')}>
            <Plus className="w-4 h-4 mr-2" />
            添加客户
          </Button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="搜索客户名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, value]) => (
              <SelectItem key={key} value={key}>{value.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 客户列表 */}
      <div className="grid gap-4">
        {filteredCustomers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              暂无客户数据，点击"添加客户"开始创建
            </CardContent>
          </Card>
        ) : (
          filteredCustomers.map((customer) => {
            const statusConfig = STATUS_CONFIG[customer.status as CustomerStatus];
            const isStale = isStaleFollowUp(customer);
            
            return (
              <Card key={customer.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {/* 状态标识 */}
                      <div className={`w-2 h-8 rounded-full ${statusConfig?.bgColor}`}></div>
                      
                      {/* 客户信息 */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                          <Badge className={`${statusConfig?.bgColor} ${statusConfig?.color}`}>
                            {statusConfig?.label}
                          </Badge>
                          {isStale && customer.status !== 'accepted' && (
                            <Badge variant="outline" className="text-orange-600 border-orange-300">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              需跟进
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>
                            人天: 总{formatDays(customer.implementation_days)} / 
                            已耗{formatDays(customer.consumed_days)} / 
                            余<span className={customer.remaining_days < 0 ? 'text-red-600 font-medium' : ''}>{formatDays(customer.remaining_days)}</span>
                          </span>
                          {customer.last_follow_up_at ? (
                            <span className="text-xs">
                              最近跟进: {formatDistanceToNow(new Date(customer.last_follow_up_at), { addSuffix: true, locale: zhCN })}
                            </span>
                          ) : (
                            <span className="text-xs text-orange-500">暂无跟进</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/customers/${customer.id}`)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        查看
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/customers/${customer.id}/follow-up`)}
                      >
                        <MessageSquare className="w-4 h-4 mr-1" />
                        跟进
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openScheduleDialog(customer)}
                      >
                        <Calendar className="w-4 h-4 mr-1" />
                        排期
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* 排期对话框 */}
      <Dialog 
        open={scheduleDialog.open} 
        onOpenChange={(open) => {
          if (!open) {
            setScheduleDialog(prev => ({ ...prev, open: false, result: null }));
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建排期会议</DialogTitle>
            <DialogDescription>
              为客户 <span className="font-semibold">{scheduleDialog.customer?.name}</span> 创建腾讯会议
            </DialogDescription>
          </DialogHeader>

          {!scheduleDialog.result ? (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">会议主题</Label>
                  <Input
                    id="subject"
                    value={scheduleDialog.subject}
                    onChange={(e) => setScheduleDialog(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="请输入会议主题"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">会议日期</Label>
                    <Input
                      id="date"
                      type="date"
                      value={scheduleDialog.date}
                      onChange={(e) => setScheduleDialog(prev => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">开始时间</Label>
                    <Input
                      id="time"
                      type="time"
                      value={scheduleDialog.time}
                      onChange={(e) => setScheduleDialog(prev => ({ ...prev, time: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">会议时长 (分钟)</Label>
                  <Select
                    value={scheduleDialog.duration.toString()}
                    onValueChange={(v) => setScheduleDialog(prev => ({ ...prev, duration: parseInt(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择会议时长" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 分钟</SelectItem>
                      <SelectItem value="60">1 小时</SelectItem>
                      <SelectItem value="90">1.5 小时</SelectItem>
                      <SelectItem value="120">2 小时</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setScheduleDialog(prev => ({ ...prev, open: false }))}
                >
                  取消
                </Button>
                <Button 
                  onClick={handleCreateMeeting}
                  disabled={scheduleDialog.loading || !scheduleDialog.subject || !scheduleDialog.date || !scheduleDialog.time}
                >
                  {scheduleDialog.loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4 mr-2" />
                      创建会议
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-4">
                {/* 提示信息 */}
                {scheduleDialog.result.message && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                    {scheduleDialog.result.message}
                  </div>
                )}

                {/* 会议信息 */}
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">会议创建成功</p>
                      <p className="text-sm text-gray-500">会议码: {scheduleDialog.result.meetingCode}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">会议主题</span>
                      <span className="font-medium">{scheduleDialog.result.subject}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">会议时间</span>
                      <span className="font-medium">
                        {format(new Date(scheduleDialog.result.startTime * 1000), 'yyyy-MM-dd HH:mm')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">会议时长</span>
                      <span className="font-medium">{scheduleDialog.result.duration} 分钟</span>
                    </div>
                  </div>
                </div>

                {/* 会议链接 */}
                <div className="space-y-2">
                  <Label>会议链接</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={scheduleDialog.result.meetingUrl}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(scheduleDialog.result!.meetingUrl);
                      }}
                    >
                      复制
                    </Button>
                  </div>
                </div>

                {/* 快速入会 */}
                <Button
                  className="w-full"
                  onClick={() => {
                    window.open(scheduleDialog.result!.meetingUrl, '_blank');
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  打开腾讯会议
                </Button>
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setScheduleDialog(prev => ({ ...prev, open: false, result: null }));
                  }}
                >
                  关闭
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
