'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  ExternalLink,
  Calendar,
  User,
  Building,
  FileText,
  Clock
} from 'lucide-react';
import { Customer, FollowUpRecord, CustomerStatus, STATUS_CONFIG, INDUSTRY_OPTIONS } from '@/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomerDetailPage({ params }: PageProps) {
  const { session } = useAuth();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpForm, setFollowUpForm] = useState({
    follow_up_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    content: '',
    meeting_link: '',
  });
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    sales_order_no: '',
    implementation_order_no: '',
    product_amount: '',
    implementation_days: '',
    industry: '',
    special_requirements: '',
    status: '' as CustomerStatus,
  });

  useEffect(() => {
    const loadCustomer = async () => {
      const { id } = await params;
      if (id && session?.access_token) {
        fetchCustomer(id);
        fetchFollowUps(id);
      }
    };
    loadCustomer();
  }, [params, session]);

  const fetchCustomer = async (id: string) => {
    try {
      const response = await fetch(`/api/customers/${id}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setCustomer(data.data);
        setEditForm({
          name: data.data.name,
          sales_order_no: data.data.sales_order_no || '',
          implementation_order_no: data.data.implementation_order_no || '',
          product_amount: data.data.product_amount || '',
          implementation_days: data.data.implementation_days || '',
          industry: data.data.industry || '',
          special_requirements: data.data.special_requirements || '',
          status: data.data.status,
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
          'Authorization': `Bearer ${session?.access_token}`,
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

  const handleUpdateCustomer = async () => {
    if (!customer) return;
    
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: editForm.name,
          sales_order_no: editForm.sales_order_no || null,
          implementation_order_no: editForm.implementation_order_no || null,
          product_amount: editForm.product_amount ? parseInt(editForm.product_amount) : null,
          implementation_days: editForm.implementation_days ? parseInt(editForm.implementation_days) : null,
          industry: editForm.industry || null,
          special_requirements: editForm.special_requirements || null,
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
      alert('请填写跟进内容');
      return;
    }

    try {
      const response = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          customer_id: customer.id,
          follow_up_at: followUpForm.follow_up_at,
          content: followUpForm.content,
          meeting_link: followUpForm.meeting_link || null,
          is_accepted: false,
        }),
      });

      if (response.ok) {
        setFollowUpForm({
          follow_up_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          content: '',
          meeting_link: '',
        });
        setShowFollowUpForm(false);
        fetchFollowUps(customer.id);
        fetchCustomer(customer.id);
      }
    } catch (error) {
      console.error('添加跟进记录失败:', error);
    }
  };

  const handleMarkAccepted = async () => {
    if (!customer) return;
    
    if (!confirm('确定将此客户标记为已验收吗？')) return;

    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          status: 'accepted',
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

  const statusConfig = STATUS_CONFIG[customer.status as CustomerStatus];

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/customers')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <Badge className={`mt-1 ${statusConfig?.bgColor} ${statusConfig?.color}`}>
              {statusConfig?.label}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {customer.status !== 'accepted' && (
            <Button variant="outline" onClick={handleMarkAccepted}>
              <CheckCircle className="w-4 h-4 mr-2" />
              确认验收
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? '取消编辑' : '编辑档案'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：客户档案 */}
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
                      <Label>客户状态</Label>
                      <select
                        className="w-full border rounded-md px-3 py-2"
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as CustomerStatus })}
                      >
                        {Object.entries(STATUS_CONFIG).map(([key, value]) => (
                          <option key={key} value={key}>{value.label}</option>
                        ))}
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
                      <Label>产品金额</Label>
                      <Input
                        type="number"
                        value={editForm.product_amount}
                        onChange={(e) => setEditForm({ ...editForm, product_amount: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>实施人天</Label>
                      <Input
                        type="number"
                        value={editForm.implementation_days}
                        onChange={(e) => setEditForm({ ...editForm, implementation_days: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>行业背景</Label>
                      <select
                        className="w-full border rounded-md px-3 py-2"
                        value={editForm.industry}
                        onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                      >
                        <option value="">请选择</option>
                        {INDUSTRY_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
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
                    <InfoItem icon={<Building className="w-4 h-4" />} label="行业背景" value={customer.industry} />
                    <InfoItem icon={<Clock className="w-4 h-4" />} label="实施人天" value={customer.implementation_days ? `${customer.implementation_days} 天` : null} />
                  </div>
                  <Separator />
                  <div>
                    <Label className="text-gray-500">产品金额</Label>
                    <p className="text-lg font-semibold mt-1">
                      {customer.product_amount ? `¥${customer.product_amount.toLocaleString()}` : '-'}
                    </p>
                  </div>
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

        {/* 右侧：跟进记录 */}
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
                  <div className="space-y-2">
                    <Label>会议回放链接</Label>
                    <Input
                      value={followUpForm.meeting_link}
                      onChange={(e) => setFollowUpForm({ ...followUpForm, meeting_link: e.target.value })}
                      placeholder="可选"
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
                      {record.meeting_link && (
                        <a
                          href={record.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          会议回放
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
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
