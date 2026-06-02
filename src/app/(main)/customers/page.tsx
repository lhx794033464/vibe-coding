'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, AlertCircle, Loader2, FileSpreadsheet, Download, Check, X, LayoutList, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Customer } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// 扩展Customer类型，包含计算字段
interface CustomerWithDays extends Customer {
  consumed_days: number;
  remaining_days: number;
}

export default function CustomersPage() {
  const { getAuthHeader } = useAuth();
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerWithDays[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [acceptanceFilter, setAcceptanceFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState(1);

  // 同步相关状态
  const [showFetchDialog, setShowFetchDialog] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchData, setFetchData] = useState<{
    customerName: string; modules: string; deliverer?: string;
    status?: string; opened_at?: string; implementation_type?: string;
    salesperson?: string; expiry_date?: string; sales_order_no?: string;
    implementation_order_no?: string; implementation_fee?: string;
    implementation_days?: string; version?: string;
    acceptance_status?: string; industry?: string;
  }[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; updated: number } | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, [statusFilter, acceptanceFilter]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (acceptanceFilter !== 'all') {
        params.append('acceptance_status', acceptanceFilter);
      }
      
      const response = await fetch(`/api/customers?${params.toString()}`, {
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

  // 搜索时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, acceptanceFilter]);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // 分页计算
  const isShowAll = pageSize === 0;
  const paginatedCustomers = isShowAll ? filteredCustomers : filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = isShowAll ? 1 : Math.ceil(filteredCustomers.length / pageSize);

  // 同步客户信息
  const handleFetchFromTencentDocs = async () => {
    setFetchLoading(true);
    setFetchData([]);
    setSelectedCustomers(new Set());
    setImportResult(null);
    setShowFetchDialog(true);
    try {
      const response = await fetch('/api/tencent-docs/fetch-customers', {
        headers: { ...getAuthHeader() },
      });
      const data = await response.json();
      if (data.success) {
        setFetchData(data.data || []);
        // 默认全选
        setSelectedCustomers(new Set((data.data || []).map((d: { customerName: string }) => d.customerName)));
      } else {
        alert(data.error || '获取失败');
      }
    } catch (error) {
      console.error('获取腾讯文档同步信息失败:', error);
      alert('获取失败，请检查网络连接');
    } finally {
      setFetchLoading(false);
    }
  };

  // 批量导入选中的客户
  const handleImportCustomers = async () => {
    if (selectedCustomers.size === 0) return;
    setImporting(true);
    try {
      const customersToImport = fetchData.filter(c => selectedCustomers.has(c.customerName));
      const response = await fetch('/api/tencent-docs/fetch-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ customers: customersToImport }),
      });
      const data = await response.json();
      if (data.success) {
        setImportResult({ imported: data.imported, updated: data.updated });
        // 刷新客户列表
        fetchCustomers();
      } else {
        alert(data.error || '导入失败');
      }
    } catch (error) {
      console.error('导入客户失败:', error);
      alert('导入失败');
    } finally {
      setImporting(false);
    }
  };

  const toggleCustomerSelection = (name: string) => {
    setSelectedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCustomers.size === fetchData.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(fetchData.map(d => d.customerName)));
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
            <Button variant="outline" onClick={handleFetchFromTencentDocs}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
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
                placeholder="搜索客户名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { key: 'all', label: '全部', statusVal: 'all', acceptanceVal: 'all' },
                { key: 'not_online', label: '未上线', statusVal: 'not_online', acceptanceVal: 'all' },
                { key: 'online', label: '已上线', statusVal: 'online', acceptanceVal: 'all' },
                { key: 'online_not_accepted', label: '已上线未验收', statusVal: 'online', acceptanceVal: 'not_accepted' },
                { key: 'accepted', label: '已验收', statusVal: 'all', acceptanceVal: 'accepted' },
              ].map((filter) => {
                const isActive = statusFilter === filter.statusVal && acceptanceFilter === filter.acceptanceVal;
                return (
                  <Button
                    key={filter.key}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setStatusFilter(filter.statusVal);
                      setAcceptanceFilter(filter.acceptanceVal);
                    }}
                    className="text-xs"
                  >
                    {filter.label}
                  </Button>
                );
              })}
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
                title="列表视图"
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
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'grid gap-4'}>
          {filteredCustomers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                暂无客户数据，点击"添加客户"开始创建
              </CardContent>
            </Card>
          ) : (
            paginatedCustomers.map((customer) => {
              const isStale = isStaleFollowUp(customer);
              
              return (
                <Card key={customer.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    {viewMode === 'grid' ? (
                      /* 双列视图 - 紧凑垂直布局 */
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
                          {isStale && customer.acceptance_status !== 'accepted' && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                              <AlertCircle className="w-3 h-3 mr-0.5" />
                              需跟进
                            </Badge>
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
                          {customer.last_follow_up_at ? (
                            <span>最近跟进: {formatDistanceToNow(new Date(customer.last_follow_up_at), { addSuffix: true, locale: zhCN })}</span>
                          ) : (
                            <span className="text-orange-500">暂无跟进</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* 列表视图 - 原有横向布局 */
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          {/* 状态标识 */}
                          <div className={`w-2 h-12 sm:h-8 rounded-full flex-shrink-0 ${customer.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`}></div>
                          
                          {/* 客户信息 */}
                          <div className="flex-1 min-w-0">
                            {/* 第一行：客户名称 + 上线状态 + 验收状态 */}
                            <div className="flex items-start gap-2 flex-wrap">
                              <Link 
                                href={`/customers/${customer.id}`}
                                className="font-semibold text-gray-900 hover:text-blue-600 cursor-pointer transition-colors break-words"
                              >
                                {customer.name}
                              </Link>
                              <Badge className={customer.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}>
                                {customer.status === 'online' ? '已上线' : '未上线'}
                              </Badge>
                              {customer.acceptance_status === 'accepted' && (
                                <Badge className="bg-purple-100 text-purple-700">已验收</Badge>
                              )}
                              {isStale && customer.acceptance_status !== 'accepted' && (
                                <Badge variant="outline" className="text-orange-600 border-orange-300">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  需跟进
                                </Badge>
                              )}
                            </div>
                            {/* 第二行：版本 + 模块 */}
                            {(customer.version || customer.modules) && (
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {customer.version && (
                                  <Badge className="bg-blue-50 text-blue-700 border-blue-200" variant="outline">
                                    {customer.version}
                                  </Badge>
                                )}
                                {customer.modules && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {(Array.isArray(customer.modules) ? customer.modules : String(customer.modules).split(',')).filter(Boolean).map((module: string, idx: number) => (
                                      <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
                                        {module.trim()}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* 第三行：人天 + 最近跟进 */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-gray-500 mt-2">
                              <span className="whitespace-nowrap">
                                人天: 总{formatDays(customer.implementation_days)} / 
                                已耗{formatDays(customer.consumed_days)} / 
                                余<span className={customer.remaining_days < 0 ? 'text-red-600 font-medium' : ''}>{formatDays(customer.remaining_days)}</span>
                              </span>
                              {(customer as any).delivery_consultant && (
                                <span className="text-xs whitespace-nowrap text-blue-600">
                                  顾问: {(customer as any).delivery_consultant}
                                </span>
                              )}
                              {customer.last_follow_up_at ? (
                                <span className="text-xs whitespace-nowrap">
                                  最近跟进: {formatDistanceToNow(new Date(customer.last_follow_up_at), { addSuffix: true, locale: zhCN })}
                                </span>
                              ) : (
                                <span className="text-xs text-orange-500 whitespace-nowrap">暂无跟进</span>
                              )}
                            </div>
                          </div>
                        </div>
                        </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-semibold">从同步客户信息</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {fetchLoading ? '正在获取...' : fetchData.length > 0 ? `共获取到 ${fetchData.length} 条客户信息` : ''}
                </p>
              </div>
              <button
                onClick={() => setShowFetchDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-auto p-4">
              {fetchLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                  <p className="text-gray-500">正在同步客户数据...</p>
                </div>
              ) : importResult ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Check className="w-12 h-12 text-green-500 mb-3" />
                  <p className="text-lg font-medium">导入完成</p>
                  <p className="text-gray-500 mt-1">
                    新增 {importResult.imported} 个客户，更新 {importResult.updated} 个客户
                  </p>
                  <Button className="mt-4" onClick={() => setShowFetchDialog(false)}>
                    完成
                  </Button>
                </div>
              ) : fetchData.length > 0 ? (
                <div>
                  {/* 全选/取消全选 */}
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                    <input
                      type="checkbox"
                      checked={selectedCustomers.size === fetchData.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-600">
                      全选（已选 {selectedCustomers.size}/{fetchData.length}）
                    </span>
                  </div>
                  {/* 客户列表 */}
                  <div className="space-y-2">
                    {fetchData.map((item) => (
                      <label
                        key={item.customerName}
                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCustomers.has(item.customerName)}
                          onChange={() => toggleCustomerSelection(item.customerName)}
                          className="w-4 h-4 mt-0.5 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{item.customerName}</p>
                            {item.status && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                item.status === 'online' ? 'bg-green-100 text-green-700' :
                                item.status === '延期上线' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {item.status === 'online' ? '已上线' : item.status === 'not_online' ? '未上线' : item.status}
                              </span>
                            )}
                            {item.version && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{item.version}</span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                            {item.modules && <span>购买模块：{item.modules}</span>}
                            {item.implementation_type && <span>实施类型：{item.implementation_type}</span>}
                            {item.salesperson && <span>业务员：{item.salesperson}</span>}
                            {item.opened_at && <span>开通时间：{item.opened_at}</span>}
                            {item.expiry_date && <span>到期日：{item.expiry_date}</span>}
                            {item.implementation_fee && <span>实施费：{item.implementation_fee}</span>}
                            {item.implementation_days && <span>购买人天：{item.implementation_days}</span>}
                            {item.sales_order_no && <span>销售订单：{item.sales_order_no}</span>}
                            {item.implementation_order_no && <span>实施订单号：{item.implementation_order_no}</span>}
                            {item.acceptance_status && <span>验收状态：{item.acceptance_status === 'accepted' ? '已验收' : item.acceptance_status === 'not_accepted' ? '未验收' : item.acceptance_status}</span>}
                            {item.industry && <span>项目备注：{item.industry}</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-gray-500">未获取到客户信息</p>
                </div>
              )}
            </div>

            {/* 底部操作 */}
            {!fetchLoading && !importResult && fetchData.length > 0 && (
              <div className="flex items-center justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setShowFetchDialog(false)}>
                  取消
                </Button>
                <Button
                  onClick={handleImportCustomers}
                  disabled={selectedCustomers.size === 0 || importing}
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      导入中...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      导入选中的 {selectedCustomers.size} 个客户
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
