'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, AlertCircle, MessageSquare, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Customer, CustomerStatus, STATUS_CONFIG, VERSION_CONFIG, MODULE_CONFIG, ProductVersion, ProductModule } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// 扩展Customer类型，包含计算字段
interface CustomerWithDays extends Customer {
  consumed_days: number;
  remaining_days: number;
}

export default function CustomersPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerWithDays[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
    <div className="h-full p-6 overflow-auto">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">客户列表</h1>
            <p className="text-gray-500 mt-1">共 {filteredCustomers.length} 个客户</p>
          </div>
          <div className="flex gap-2">
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
            <SelectContent position="popper" side="bottom" align="start">
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
                          {/* 第一行：客户名称 + 状态 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link 
                              href={`/customers/${customer.id}`}
                              className="font-semibold text-gray-900 hover:text-blue-600 cursor-pointer transition-colors"
                            >
                              {customer.name}
                            </Link>
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
                          {/* 第二行：版本 + 模块 */}
                          {(customer.version || (customer.modules && customer.modules.length > 0)) && (
                            <div className="flex items-center gap-2 mt-1">
                              {customer.version && (
                                <Badge className={VERSION_CONFIG[customer.version as ProductVersion]?.color}>
                                  {VERSION_CONFIG[customer.version as ProductVersion]?.label}
                                </Badge>
                              )}
                              {customer.modules && customer.modules.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {customer.modules.map((module) => (
                                    <Badge key={module} variant="outline" className="text-xs px-1.5 py-0">
                                      {MODULE_CONFIG[module as ProductModule]?.label}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {/* 第三行：人天 + 最近跟进 */}
                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
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
                          variant="default"
                          size="sm"
                          onClick={() => router.push(`/customers/${customer.id}/follow-up`)}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          跟进
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
