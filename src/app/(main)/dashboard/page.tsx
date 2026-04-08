'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, 
  CheckCircle, 
  TrendingUp,
  TrendingDown,
  BarChart3,
  Loader2
} from 'lucide-react';
import { TimeRange, STATUS_CONFIG, CustomerStatus } from '@/types';
import { cn } from '@/lib/utils';

interface DashboardStats {
  totalCustomers: number;
  onlineCustomers: number;
  acceptedCustomers: number;
  onlineRate: number;
  acceptanceRate: number;
  // 上期数据
  lastMonthTotalCustomers: number;
  lastMonthOnlineRate: number;
  lastMonthAcceptanceRate: number;
  // 变动数据
  totalCustomersChange: number;
  onlineRateChange: number;
  acceptanceRateChange: number;
  statusDistribution: Record<CustomerStatus, number>;
}

const initialStats: DashboardStats = {
  totalCustomers: 0,
  onlineCustomers: 0,
  acceptedCustomers: 0,
  onlineRate: 0,
  acceptanceRate: 0,
  lastMonthTotalCustomers: 0,
  lastMonthOnlineRate: 0,
  lastMonthAcceptanceRate: 0,
  totalCustomersChange: 0,
  onlineRateChange: 0,
  acceptanceRateChange: 0,
  statusDistribution: {
    not_online: 0,
    online_not_accepted: 0,
    accepted: 0,
    not_going_online: 0,
    delayed_online: 0,
    partially_online: 0,
  },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!isInitialLoading) {
      fetchStats();
    }
  }, [timeRange]);

  const fetchStats = async () => {
    // 首次加载显示全屏loading，后续只显示更新状态
    if (isInitialLoading) {
      setIsInitialLoading(true);
    } else {
      setIsUpdating(true);
    }
    
    try {
      const response = await fetch(`/api/dashboard?timeRange=${timeRange}`);
      const data = await response.json();
      if (response.ok) {
        setStats(data);
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
    } finally {
      setIsInitialLoading(false);
      setIsUpdating(false);
    }
  };

  // 将状态分布按数量降序排列
  const getSortedStatusDistribution = () => {
    if (!stats?.statusDistribution) return [];
    
    return Object.entries(stats.statusDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => ({
        status: status as CustomerStatus,
        count,
        percentage: stats.totalCustomers > 0 
          ? ((count / stats.totalCustomers) * 100).toFixed(1) 
          : '0.0'
      }));
  };

  // 格式化变动显示
  const formatChange = (change: number, isRate: boolean = false) => {
    const prefix = change > 0 ? '+' : '';
    const suffix = isRate ? 'pp' : '%';
    const value = isRate ? change.toFixed(1) : change.toFixed(1);
    return `${prefix}${value}${suffix}`;
  };

  // 获取变动样式
  const getChangeStyle = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-500';
  };

  // 首次加载显示全屏loading
  if (isInitialLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const sortedDistribution = getSortedStatusDistribution();

  return (
    <div className="min-h-screen p-4 sm:p-6 overflow-auto">
      {/* 页面标题和时间选择 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">数据看板</h1>
          <p className="text-gray-500 mt-1">客户跟进数据总览</p>
        </div>
        <div className="flex items-center gap-2">
          {isUpdating && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          )}
          <Select 
            value={timeRange} 
            onValueChange={(v) => setTimeRange(v as TimeRange)}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" side="bottom">
              <SelectItem value="month">本月</SelectItem>
              <SelectItem value="year">本年</SelectItem>
              <SelectItem value="all">全部</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">客户总数</CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalCustomers}</div>
            <div className="flex items-center gap-1 mt-1">
              {stats.totalCustomersChange > 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : stats.totalCustomersChange < 0 ? (
                <TrendingDown className="h-3 w-3 text-red-600" />
              ) : null}
              <span className={cn("text-xs", getChangeStyle(stats.totalCustomersChange))}>
                较上期 {formatChange(stats.totalCustomersChange)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">上线率</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.onlineRate}%</div>
            <div className="flex items-center gap-1 mt-1">
              {stats.onlineRateChange > 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : stats.onlineRateChange < 0 ? (
                <TrendingDown className="h-3 w-3 text-red-600" />
              ) : null}
              <span className={cn("text-xs", getChangeStyle(stats.onlineRateChange))}>
                较上期 {formatChange(stats.onlineRateChange, true)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {stats.onlineCustomers} / {stats.totalCustomers} 已上线
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">验收率</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.acceptanceRate}%</div>
            <div className="flex items-center gap-1 mt-1">
              {stats.acceptanceRateChange > 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : stats.acceptanceRateChange < 0 ? (
                <TrendingDown className="h-3 w-3 text-red-600" />
              ) : null}
              <span className={cn("text-xs", getChangeStyle(stats.acceptanceRateChange))}>
                较上期 {formatChange(stats.acceptanceRateChange, true)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {stats.acceptedCustomers} / {stats.totalCustomers} 已验收
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 客户状态分布图表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-gray-400" />
            客户状态分布
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedDistribution.map(({ status, count, percentage }) => (
              <div key={status} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${STATUS_CONFIG[status]?.bgColor}`}></span>
                    <span className="text-sm font-medium text-gray-700">{STATUS_CONFIG[status]?.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-900">{count}</span>
                    <span className="text-sm text-gray-500 w-14 text-right">{percentage}%</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-300 ${STATUS_CONFIG[status]?.bgColor}`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
