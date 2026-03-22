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
import { ArrowLeft, Calendar, Clock, CheckCircle } from 'lucide-react';
import { Customer, FollowUpRecord, CustomerStatus, STATUS_CONFIG } from '@/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function FollowUpPage({ params }: PageProps) {
  const { session } = useAuth();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    follow_up_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    content: '',
    meeting_link: '',
    consumed_days: '',
  });

  useEffect(() => {
    const loadData = async () => {
      const { id } = await params;
      if (id && session?.access_token) {
        fetchCustomer(id);
        fetchFollowUps(id);
      }
    };
    loadData();
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

  // 计算已消耗人天
  const totalConsumedDays = followUps.reduce((sum, record) => sum + (record.consumed_days || 0), 0);
  const remainingDays = customer ? (customer.implementation_days || 0) - totalConsumedDays : 0;

  const handleSubmit = async () => {
    if (!customer || !form.content) {
      alert('请填写跟进内容');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          customer_id: customer.id,
          follow_up_at: form.follow_up_at,
          content: form.content,
          meeting_link: form.meeting_link || null,
          consumed_days: form.consumed_days ? parseInt(form.consumed_days) : null,
          is_accepted: false,
        }),
      });

      if (response.ok) {
        setForm({
          follow_up_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          content: '',
          meeting_link: '',
          consumed_days: '',
        });
        fetchFollowUps(customer.id);
        fetchCustomer(customer.id);
      }
    } catch (error) {
      console.error('添加跟进记录失败:', error);
    } finally {
      setSaving(false);
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
          <Button variant="outline" onClick={() => router.push(`/customers/${customer.id}`)}>
            查看详情
          </Button>
        </div>
      </div>

      {/* 人天统计 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm">总实施人天</span>
            </div>
            <p className="text-2xl font-bold">{customer.implementation_days || 0} 天</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-orange-500 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm">已消耗人天</span>
            </div>
            <p className="text-2xl font-bold text-orange-600">{totalConsumedDays} 天</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-500 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm">剩余人天</span>
            </div>
            <p className={`text-2xl font-bold ${remainingDays < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {remainingDays} 天
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：添加跟进记录 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              添加跟进记录
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>跟进时间</Label>
              <Input
                type="datetime-local"
                value={form.follow_up_at}
                onChange={(e) => setForm({ ...form, follow_up_at: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>跟进内容 <span className="text-red-500">*</span></Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入跟进内容"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>消耗人天</Label>
              <Input
                type="number"
                min="0"
                value={form.consumed_days}
                onChange={(e) => setForm({ ...form, consumed_days: e.target.value })}
                placeholder="本次跟进消耗的人天数"
              />
            </div>
            <div className="space-y-2">
              <Label>会议回放链接</Label>
              <Input
                value={form.meeting_link}
                onChange={(e) => setForm({ ...form, meeting_link: e.target.value })}
                placeholder="可选"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? '保存中...' : '保存跟进记录'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 右侧：历史跟进记录 */}
        <Card>
          <CardHeader>
            <CardTitle>历史跟进记录</CardTitle>
          </CardHeader>
          <CardContent>
            {followUps.length === 0 ? (
              <p className="text-gray-500 text-center py-4">暂无跟进记录</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {followUps.map((record) => (
                  <div key={record.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        {format(new Date(record.follow_up_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                      </span>
                      {record.consumed_days && (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">
                          消耗 {record.consumed_days} 天
                        </Badge>
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
  );
}
