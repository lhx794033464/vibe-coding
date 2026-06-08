'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, AlertCircle, Loader2, RefreshCw, Check, X, LayoutList, LayoutGrid, Filter, ChevronDown, Copy } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Customer } from '@/types';


// 扩展Customer类型，包含计算字段
interface CustomerWithDays extends Customer {
  consumed_days: number;
  remaining_days: number;
}

// 从各种日期格式中提取纯日期部分 (YYYY-MM-DD)
// 兼容: ISO格式 "2026-06-05T10:00:00Z", UTC格式 "2026-06-05 00:00:00 +0000 UTC", 纯日期 "2026-06-05"
function extractDateString(value: unknown): string | null {
  if (!value) return null;
  const str = typeof value === 'string' ? value : String(value);
  // 先尝试按 T 分割 (ISO格式)
  let datePart = str.split('T')[0];
  // 如果结果包含空格 (如 "2026-06-05 00:00:00 +0000 UTC")，再按空格分割
  if (datePart.includes(' ')) {
    datePart = datePart.split(' ')[0];
  }
  return datePart || null;
}

export default function CustomersPage() {
  const { getAuthHeader } = useAuth();
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerWithDays[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [consultantFilter, setFilterConsultant] = useState<string>('all');
  const [implTypeFilter, setFilterImplType] = useState<string>('all');
  const [onlineStatusFilter, setFilterOnlineStatus] = useState<string>('all');
  const [acceptanceStatusFilter, setFilterAcceptanceStatus] = useState<string>('all');
  const [overdueFilter, setFilterOverdue] = useState<string>('all');
  const [openedStartFilter, setFilterOpenDateStart] = useState<string>('');
  const [openedEndFilter, setFilterOpenDateEnd] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState(1);

  // 同步相关状态
  const [showFetchDialog, setShowFetchDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; updated: number; skipped: number; deleted: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/customers`, {
        headers: { ...getAuthHeader() },
      });
      const data = await response.json();
      if (response.ok) {
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('获取客户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取筛选选项
  const consultantOptions = [...new Set(customers.map(c => c.delivery_consultant).filter(Boolean))].sort();
  const implTypeOptions = [...new Set(customers.map(c => c.implementation_type).filter(Boolean))].sort();

  // 搜索时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [search, consultantFilter, implTypeFilter, onlineStatusFilter, acceptanceStatusFilter, openedStartFilter, openedEndFilter, overdueFilter]);

  const filteredCustomers = customers.filter(c => {
    // 搜索条件：支持搜索名称、交付顾问、实施类型
    const searchLower = search.toLowerCase();
    const matchSearch = !search || 
      c.name.toLowerCase().includes(searchLower) ||
      (c.delivery_consultant || '').toLowerCase().includes(searchLower) ||
      (c.implementation_type || '').toLowerCase().includes(searchLower) ||
      (c.salesperson || '').toLowerCase().includes(searchLower) ||
      (c.version || '').toLowerCase().includes(searchLower) ||
      (Array.isArray(c.modules) ? c.modules.join(',') : (c.modules || '')).toLowerCase().includes(searchLower);

    // 交付顾问筛选
    const matchConsultant = consultantFilter === 'all' || c.delivery_consultant === consultantFilter;
    
    // 实施类型筛选
    const matchImplType = implTypeFilter === 'all' ||
      (implTypeFilter === '一对一交付' ? c.implementation_type === '一对一交付' : c.implementation_type !== '一对一交付');
    
    // 上线状态筛选（DB中status字段混合存储英文和中文值）
    const matchOnline = onlineStatusFilter === 'all' || (() => {
      const s = c.status;
      switch (onlineStatusFilter) {
        case 'not_online': return s === 'not_online' || s === '未上线';
        case 'online': return s === 'online' || s === '已上线';
        case 'delayed': return s === 'delayed' || s === '延期上线';
        default: return false;
      }
    })();
    
    // 验收状态筛选（DB中acceptance_status字段存储英文值）
    const matchAcceptance = acceptanceStatusFilter === 'all' || c.acceptance_status === acceptanceStatusFilter;
    
    // 开通时间范围筛选
    let matchOpenDate = true;
    if (openedStartFilter || openedEndFilter) {
      const openedAt = c.opened_at;
      if (!openedAt) {
        matchOpenDate = false;
      } else {
        try {
          const openDate = new Date((c.opened_at || '').replace(/\//g, '-'));
          if (openedStartFilter) {
            matchOpenDate = matchOpenDate && openDate >= new Date(openedStartFilter);
          }
          if (openedEndFilter) {
            matchOpenDate = matchOpenDate && openDate <= new Date(openedEndFilter);
          }
        } catch {
          matchOpenDate = false;
        }
      }
    }
    
    // 超期未解散筛选
    const matchOverdue = overdueFilter === 'all' || (() => {
      // 已解散的客户不算超期
      if (c.dismissed) return overdueFilter === 'not_overdue';
      const deadline = c.delivery_deadline;
      if (!deadline) return false;
      const deadlineDateStr = extractDateString(deadline);
      const deadlineDate = deadlineDateStr ? new Date(deadlineDateStr) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isOverdue = deadlineDate ? deadlineDate < today : false;
      return overdueFilter === 'overdue' ? isOverdue : !isOverdue;
    })();
    
    return matchSearch && matchConsultant && matchImplType && matchOnline && matchAcceptance && matchOpenDate && matchOverdue;
  });

  // 分页计算
  const isShowAll = pageSize === 0;
  const paginatedCustomers = isShowAll ? filteredCustomers : filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = isShowAll ? 1 : Math.ceil(filteredCustomers.length / pageSize);

  // 同步客户信息（一键同步所有客户，不展示明细）
  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncResult(null);
    setShowFetchDialog(true);
    try {
      // 1. 获取腾讯文档数据
      const fetchRes = await fetch('/api/tencent-docs/fetch-customers', {
        headers: { ...getAuthHeader() },
      });
      const fetchData = await fetchRes.json();
      if (!fetchData.success) {
        toast.error(fetchData.error || '获取失败');
        setSyncing(false);
        return;
      }

      const customers = fetchData.data || [];
      if (customers.length === 0) {
        toast.error('未获取到客户信息');
        setSyncing(false);
        return;
      }

      // 2. 直接全部导入
      const importRes = await fetch('/api/tencent-docs/fetch-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ customers }),
      });
      const importData = await importRes.json();
      if (importData.success) {
        setSyncResult({
          imported: importData.imported,
          updated: importData.updated,
          skipped: importData.skipped || 0,
          deleted: importData.deleted || 0,
        });
        fetchCustomers();
      } else {
        toast.error(importData.error || '导入失败');
      }
    } catch (error) {
      console.error('同步客户信息失败:', error);
      toast.error('同步失败，请检查网络连接');
    } finally {
      setSyncing(false);
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
    <div className="min-h-screen p-4 sm:p-6 overflow-auto">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">客户列表</h1>
            <p className="text-gray-500 mt-1">共 {filteredCustomers.length} 个客户{!isShowAll && filteredCustomers.length > 0 ? ` · 第 ${currentPage}/${totalPages} 页` : ''}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSyncAll}>
              <RefreshCw className="w-4 h-4 mr-2" />
              同步
            </Button>
            <Button onClick={() => router.push('/customers/new')}>
              <Plus className="w-4 h-4 mr-2" />
              添加客户
            </Button>
            </div>
          </div>

          {/* 搜索和筛选 */}
        <div className="space-y-3">
          {/* 第一行：搜索框 + 筛选按钮 */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="搜索客户名称、交付顾问、实施类型..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <SearchableSelect
                options={customers.filter(c => c.delivery_consultant).map(c => c.delivery_consultant as string).filter((v, i, a) => a.indexOf(v) === i).sort().map(name => ({ value: name, label: name }))}
                value={consultantFilter}
                onChange={(v) => setFilterConsultant(v)}
                placeholder="搜索交付顾问"
                label="交付顾问"
              />
              <SearchableSelect
                options={[
                  { value: '一对一交付', label: '一对一交付' },
                  { value: '其他', label: '其他' },
                ]}
                value={implTypeFilter}
                onChange={(v) => setFilterImplType(v)}
                placeholder="搜索实施类型"
                label="实施类型"
              />
              <SearchableSelect
                options={[
                  { value: 'not_online', label: '未上线' },
                  { value: 'online', label: '已上线' },
                  { value: 'delayed', label: '延期上线' },
                ]}
                value={onlineStatusFilter}
                onChange={(v) => setFilterOnlineStatus(v)}
                placeholder="搜索上线状态"
                label="上线状态"
              />
              <SearchableSelect
                options={[
                  { value: 'not_accepted', label: '未验收' },
                  { value: 'accepted', label: '已验收' },
                ]}
                value={acceptanceStatusFilter}
                onChange={(v) => setFilterAcceptanceStatus(v)}
                placeholder="搜索验收状态"
                label="验收状态"
              />
              <SearchableSelect
                options={[
                  { value: 'overdue', label: '超期未解散' },
                  { value: 'not_overdue', label: '未超期' },
                ]}
                value={overdueFilter}
                onChange={(v) => setFilterOverdue(v)}
                placeholder="搜索超期状态"
                label="超期状态"
              />
              <DateRangePicker
                startDate={openedStartFilter}
                endDate={openedEndFilter}
                onStartChange={setFilterOpenDateStart}
                onEndChange={setFilterOpenDateEnd}
                placeholder="选择日期范围"
                label="开通时间"
              />
            </div>
          </div>
          {/* 第二行：排列方式 + 每页数量 */}
          <div className="flex items-center gap-3">
            <select
              className="text-sm border rounded-md px-2 py-1.5 bg-background text-foreground"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            >
              <option value={50}>每页50</option>
              <option value={100}>每页100</option>
              <option value={200}>每页200</option>
              <option value={0}>全部显示</option>
            </select>
            <div className="flex items-center gap-1 border rounded-lg p-0.5">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('list')}
                title="表格视图"
              >
                <LayoutList className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('grid')}
                title="双列视图"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* 客户列表 */}
        {viewMode === 'list' ? (
          /* 表格视图 */
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-[200px] text-left">客户名称</TableHead>
                  <TableHead className="w-[100px] text-left">上线状态</TableHead>
                  <TableHead className="w-[100px] text-left">验收状态</TableHead>
                  <TableHead className="text-left">购买模块</TableHead>
                  <TableHead className="w-[120px] text-left">交付顾问</TableHead>
                  <TableHead className="w-[140px] text-left">人天</TableHead>
                  <TableHead className="w-[120px] text-left">截止日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                      暂无客户数据，点击"添加客户"开始创建
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCustomers.map((customer) => {
                    const deadlineDateStr = extractDateString(customer.delivery_deadline);
                    const deadlineDate = deadlineDateStr ? new Date(deadlineDateStr) : null;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isOverdue = deadlineDate && deadlineDate < today && !customer.dismissed;
                    const overdueDays = isOverdue && deadlineDate ? Math.ceil((today.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                    const modules = customer.modules ? (Array.isArray(customer.modules) ? customer.modules : String(customer.modules).split(',')).filter(Boolean) : [];
                    return (
                      <TableRow key={customer.id} className="hover:bg-gray-50/50">
                        <TableCell className="w-[200px]">
                          <div className="group/copy flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${customer.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`} />
                            <Link
                              href={`/customers/${customer.id}`}
                              className="font-medium text-gray-900 hover:text-blue-600 truncate"
                            >
                              {customer.name}
                            </Link>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                navigator.clipboard.writeText(customer.name);
                                toast.success('已复制: ' + customer.name);
                              }}
                              className="opacity-0 group-hover/copy:opacity-100 transition-opacity shrink-0 text-gray-400 hover:text-gray-600 ml-auto"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="w-[100px]">
                          <Badge className={`text-xs ${customer.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {customer.status === 'online' ? '已上线' : '未上线'}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-[100px]">
                          <Badge className={`text-xs ${customer.acceptance_status === 'accepted' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                            {customer.acceptance_status === 'accepted' ? '已验收' : '未验收'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {modules.slice(0, 3).map((module: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
                                {module.trim()}
                              </Badge>
                            ))}
                            {modules.length > 3 && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0">+{modules.length - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="w-[120px] text-sm text-blue-600">
                          {(customer as any).delivery_consultant || '-'}
                        </TableCell>
                        <TableCell className="w-[140px] text-sm text-gray-500">
                          <span className="whitespace-nowrap">
                            总{formatDays(customer.implementation_days)} /
                            耗{formatDays(customer.consumed_days)} /
                            余<span className={customer.remaining_days < 0 ? 'text-red-600 font-medium' : ''}>{formatDays(customer.remaining_days)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="w-[120px] text-sm">
                          {deadlineDate ? (
                            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                              {deadlineDate.getFullYear()}-{String(deadlineDate.getMonth() + 1).padStart(2, '0')}-{String(deadlineDate.getDate()).padStart(2, '0')}
                              {isOverdue && <span className="ml-1 text-xs">(超{overdueDays}天)</span>}
                            </span>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* 卡片视图 */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCustomers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-left text-gray-500">
                  暂无客户数据，点击"添加客户"开始创建
                </CardContent>
              </Card>
            ) : (
              paginatedCustomers.map((customer) => {
                const isStale = isStaleFollowUp(customer);
                
                return (
                  <Card key={customer.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col gap-2">
                        {/* 客户名称 + 状态 */}
                        <div className="flex items-start gap-2">
                          <div className={`w-1.5 h-6 rounded-full flex-shrink-0 mt-0.5 ${customer.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`}></div>
                          <div className="flex-1 min-w-0">
                            <Link 
                              href={`/customers/${customer.id}`}
                              className="font-semibold text-gray-900 hover:text-blue-600 cursor-pointer transition-colors truncate block"
                            >
                              {customer.name}
                            </Link>
                          </div>
                        </div>
                        {/* 状态标签 */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className={`text-xs ${customer.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {customer.status === 'online' ? '已上线' : '未上线'}
                          </Badge>
                          {customer.acceptance_status === 'accepted' && (
                            <Badge className="text-xs bg-purple-100 text-purple-700">已验收</Badge>
                          )}

                        </div>
                        {/* 版本 + 模块 */}
                        {(customer.version || customer.modules) && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {customer.version && (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs" variant="outline">
                                {customer.version}
                              </Badge>
                            )}
                            {customer.modules && (
                              (Array.isArray(customer.modules) ? customer.modules : String(customer.modules).split(',')).filter(Boolean).slice(0, 2).map((module: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
                                  {module.trim()}
                                </Badge>
                              ))
                            )}
                          </div>
                        )}
                        {/* 人天 + 最近跟进 */}
                        <div className="flex flex-col gap-0.5 text-xs text-gray-500">
                          <span className="whitespace-nowrap">
                            人天: 总{formatDays(customer.implementation_days)} / 已耗{formatDays(customer.consumed_days)} / 余<span className={customer.remaining_days < 0 ? 'text-red-600 font-medium' : ''}>{formatDays(customer.remaining_days)}</span>
                          </span>
                          {(customer as any).delivery_consultant && (
                            <span className="text-blue-600">顾问: {(customer as any).delivery_consultant}</span>
                          )}
                          {customer.delivery_deadline && (() => {
                            const deadlineDateStr = extractDateString(customer.delivery_deadline);
                            const deadlineDate = deadlineDateStr ? new Date(deadlineDateStr) : null;
                            if (!deadlineDate) return null;
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const isOverdue = deadlineDate < today;
                            const overdueDays = isOverdue ? Math.ceil((today.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                            const formatted = `${deadlineDate.getFullYear()}年${deadlineDate.getMonth() + 1}月${deadlineDate.getDate()}日`;
                            return (
                              <span className={isOverdue && !customer.dismissed ? 'text-red-600 font-medium' : ''}>
                                交付期截止日：{formatted}
                                {isOverdue && !customer.dismissed && <span className="ml-1">（超期{overdueDays}天）</span>}
                                {customer.dismissed && <span className="ml-1 text-purple-600">（已解散）</span>}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

      {/* 分页控制 */}
        {!isShowAll && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
            >
              首页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              下一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              末页
            </Button>
          </div>
        )}
      </div>

      {/* 同步弹窗 */}
      {showFetchDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">同步客户信息</h3>
              <button
                onClick={() => setShowFetchDialog(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={syncing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 内容区 */}
            <div className="p-8">
              {syncing ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                  <p className="text-gray-600 font-medium">正在同步客户数据...</p>
                  <p className="text-gray-400 text-sm mt-1">请稍候，正在从腾讯文档获取并导入</p>
                </div>
              ) : syncResult ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <Check className="w-12 h-12 text-green-500 mb-3" />
                  <p className="text-lg font-medium">同步完成</p>
                  <p className="text-gray-500 mt-2 text-center">
                    新增 {syncResult.imported} 个，更新 {syncResult.updated} 个
                    {syncResult.deleted > 0 && `，删除 ${syncResult.deleted} 个`}
                    {syncResult.skipped > 0 && `，跳过 ${syncResult.skipped} 个`}
                  </p>
                  <Button className="mt-4" onClick={() => setShowFetchDialog(false)}>
                    完成
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6">
                  <p className="text-gray-500">同步过程中出现异常</p>
                  <Button className="mt-4" variant="outline" onClick={() => setShowFetchDialog(false)}>
                    关闭
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
