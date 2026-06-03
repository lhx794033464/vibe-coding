'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DateRangePicker } from '@/components/ui/date-range-picker';

type TimeRange = 'all' | 'custom';

interface DashboardStats {
  totalCustomers: number;
  newCustomersThisMonth: number;
  totalFollowUps: number;
  totalDays: number;
  onlineRate: number;
  oneMonthOnlineRate: number;
  fourMonthsOnlineRate: number;
  acceptanceRate: number;
  monthlyNewCustomers: { month: string; count: number }[];
  recentFollowUps: { id: string; customerName: string; content: string; date: string; consultantName?: string }[];
  statusDistribution: { status: string; count: number }[];
  moduleDistribution: { module: string; count: number }[];
  consultantDistribution: { name: string; projectCount: number; totalDays: number }[];
  consultantRanking: { name: string; projectCount: number; onlineRate: number; oneMonthOnlineRate: number; fourMonthsOnlineRate: number; acceptanceRate: number }[];
}

const initialStats: DashboardStats = {
  totalCustomers: 0,
  newCustomersThisMonth: 0,
  totalFollowUps: 0,
  totalDays: 0,
  onlineRate: 0,
  oneMonthOnlineRate: 0,
  fourMonthsOnlineRate: 0,
  acceptanceRate: 0,
  monthlyNewCustomers: [],
  recentFollowUps: [],
  statusDistribution: [],
  moduleDistribution: [],
  consultantDistribution: [],
  consultantRanking: [],
};

const STATUS_OPTIONS = [
  { value: '全部', label: '全部' },
  { value: '未上线', label: '未上线' },
  { value: '实施中', label: '实施中' },
  { value: '已上线', label: '已上线' },
  { value: '已验收', label: '已验收' },
  { value: '已暂停', label: '已暂停' },
];

export default function DashboardPage() {
  const { getAuthHeader, isAdmin } = useAuth();

  // 从 localStorage 恢复日期记忆
  const getStoredDates = () => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('dashboard_date_memory');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  };

  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // 全局筛选器：日期 + 角色类型
  const [timeRange, setTimeRange] = useState<TimeRange>(() => getStoredDates()?.timeRange ?? 'all');
  const [customStartDate, setCustomStartDate] = useState(() => getStoredDates()?.customStartDate ?? '');
  const [customEndDate, setCustomEndDate] = useState(() => getStoredDates()?.customEndDate ?? '');
  const [roleType, setRoleType] = useState<string>(() => getStoredDates()?.roleType ?? '交付顾问');

  // 顾问排行专属筛选
  const [rankingDimension, setRankingDimension] = useState<'onlineRate' | 'oneMonthOnlineRate' | 'fourMonthsOnlineRate' | 'acceptanceRate'>('onlineRate');
  const [rankingStatusFilter, setRankingStatusFilter] = useState('全部');

  const [distData, setDistData] = useState<{name:string,projectCount:number,totalDays:number}[]>([]);
  const [rankingData, setRankingData] = useState<{name:string,projectCount:number,onlineRate:number,oneMonthOnlineRate:number,fourMonthsOnlineRate:number,acceptanceRate:number}[]>([]);

  // 日期记忆：任一日期相关状态变化时保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('dashboard_date_memory', JSON.stringify({
        timeRange, customStartDate, customEndDate, roleType,
      }));
    } catch { /* ignore */ }
  }, [timeRange, customStartDate, customEndDate, roleType]);

  // 构建全局查询参数
  const buildGlobalParams = useCallback(() => {
    let params = `timeRange=${timeRange}`;
    if (timeRange === 'custom' && customStartDate && customEndDate) {
      params += `&startDate=${customStartDate}&endDate=${customEndDate}`;
    }
    if (roleType) {
      params += `&roleType=${encodeURIComponent(roleType)}`;
    }
    return params;
  }, [timeRange, customStartDate, customEndDate, roleType]);

  const fetchDistribution = useCallback(async () => {
    try {
      const url = `/api/dashboard?${buildGlobalParams()}`;
      const response = await fetch(url, { headers: { ...getAuthHeader() } });
      const data = await response.json();
      if (response.ok && data.consultantDistribution) {
        setDistData(data.consultantDistribution);
      }
    } catch (error) {
      console.error('获取人天分布数据失败:', error);
    }
  }, [buildGlobalParams, getAuthHeader]);

  const fetchRanking = useCallback(async () => {
    try {
      let url = `/api/dashboard?${buildGlobalParams()}`;
      if (rankingStatusFilter && rankingStatusFilter !== '全部') {
        url += `&statusFilter=${encodeURIComponent(rankingStatusFilter)}`;
      }
      const response = await fetch(url, { headers: { ...getAuthHeader() } });
      const data = await response.json();
      if (response.ok && data.consultantRanking) {
        setRankingData(data.consultantRanking);
      }
    } catch (error) {
      console.error('获取排行数据失败:', error);
    }
  }, [buildGlobalParams, rankingStatusFilter, getAuthHeader]);

  const fetchMainData = useCallback(async () => {
    try {
      setIsUpdating(true);
      const url = `/api/dashboard?${buildGlobalParams()}`;
      const response = await fetch(url, { headers: { ...getAuthHeader() } });
      const data = await response.json();
      if (response.ok) {
        setStats(data);
        setDistData(data.consultantDistribution || []);
        setRankingData(data.consultantRanking || []);
      }
    } catch (error) {
      console.error('获取看板数据失败:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [buildGlobalParams, getAuthHeader]);

  // 初始加载
  useEffect(() => {
    fetchMainData().finally(() => setIsInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 全局筛选变化时刷新所有数据
  useEffect(() => {
    if (!isInitialLoading) {
      fetchMainData();
    }
  }, [timeRange, customStartDate, customEndDate, roleType, fetchMainData, isInitialLoading]);

  // 顾问排行专属筛选变化
  useEffect(() => {
    if (!isInitialLoading) {
      fetchRanking();
    }
  }, [rankingStatusFilter, fetchRanking, isInitialLoading]);

  // 月度新增客户图表
  const maxMonthlyCount = Math.max(...(stats.monthlyNewCustomers?.map((m: { count: number }) => m.count) || [1]), 1);

  return (
    <div className="space-y-4">
      {/* 页面标题 + 全局筛选器 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">数据看板</h1>
        <div className="flex items-center gap-2">
          {/* 角色类型选择 */}
          <SearchableSelect
            label="角色"
            options={[
              { value: '', label: '全部' },
              { value: '交付顾问', label: '交付顾问' },
              { value: '售前顾问', label: '售前顾问' },
            ]}
            value={roleType}
            onChange={setRoleType}
            className="w-28"
          />
          {/* 时间范围选择 */}
          {timeRange === 'custom' ? (
            <DateRangePicker
              startDate={customStartDate}
              endDate={customEndDate}
              onStartChange={setCustomStartDate}
              onEndChange={setCustomEndDate}
              onClear={() => setTimeRange('all')}
            />
          ) : (
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom">
                <SelectItem value="all">全部时间</SelectItem>
                <SelectItem value="custom">自定义日期</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* 数据更新提示 */}
      {isUpdating && (
        <div className="text-xs text-muted-foreground animate-pulse">数据更新中...</div>
      )}

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">客户总数</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">本月新增 {stats.newCustomersThisMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">跟进记录</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{stats.totalFollowUps}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">消耗人天</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{stats.totalDays}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">上线率</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{stats.onlineRate}%</div>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>1月 {stats.oneMonthOnlineRate}%</span>
              <span>4月 {stats.fourMonthsOnlineRate}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 状态分布 + 月度新增 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">客户状态分布</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="space-y-2">
              {stats.statusDistribution?.map((item) => {
                const total = stats.statusDistribution.reduce((s, i) => s + i.count, 0);
                const percentage = total > 0 ? (item.count / total * 100).toFixed(1) : '0';
                return (
                  <div key={item.status} className="flex items-center gap-2">
                    <span className="text-xs w-16 text-right text-muted-foreground">{item.status}</span>
                    <div className="flex-1 bg-muted rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          item.status === '已验收' ? 'bg-green-500' :
                          item.status === '已上线' ? 'bg-blue-500' :
                          item.status === '实施中' ? 'bg-amber-500' :
                          item.status === '已暂停' ? 'bg-gray-400' :
                          'bg-red-400'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs w-14 text-muted-foreground">{item.count} ({percentage}%)</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">月度新增客户</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="space-y-1.5">
              {stats.monthlyNewCustomers?.slice(-12).map((item) => (
                <div key={item.month} className="flex items-center gap-2">
                  <span className="text-xs w-20 text-right text-muted-foreground">{item.month}</span>
                  <div className="flex-1 bg-muted rounded-full h-2.5">
                    <div
                      className="bg-primary h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${(item.count / maxMonthlyCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs w-8 text-muted-foreground">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 项目人天分布 */}
      {distData && distData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">项目人天分布</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">顾问</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">项目数</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">人天</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground" style={{ minWidth: '200px' }}>分布</th>
                  </tr>
                </thead>
                <tbody>
                  {distData.map((item) => {
                    const maxDays = Math.max(...distData.map(d => d.totalDays), 1);
                    return (
                      <tr key={item.name} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 px-2">{item.name}</td>
                        <td className="text-right py-2 px-2">{item.projectCount}</td>
                        <td className="text-right py-2 px-2">{item.totalDays}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-full h-2.5">
                              <div
                                className="bg-primary h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${(item.totalDays / maxDays) * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 顾问排行 */}
      {isAdmin && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">项目人天分布</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              {distData && distData.length > 0 ? (
                <div className="space-y-2">
                  {distData.map((item) => {
                    const maxDays = Math.max(...distData.map(d => d.totalDays), 1);
                    return (
                      <div key={item.name} className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-muted/50">
                        <span className="text-sm w-20 truncate">{item.name}</span>
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-500"
                            style={{ width: `${(item.totalDays / maxDays) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right">{item.totalDays}天</span>
                        <span className="text-xs text-muted-foreground w-16 text-right">{item.projectCount}个</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">暂无数据</p>
              )}
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">顾问排行</CardTitle>
                <div className="flex items-center gap-1.5">
                  {/* 客户状态筛选 - 仅顾问排行保留 */}
                  <SearchableSelect
                    label="状态"
                    options={STATUS_OPTIONS}
                    value={rankingStatusFilter}
                    onChange={setRankingStatusFilter}
                    className="w-24"
                  />
                  <Select
                    value={rankingDimension}
                    onValueChange={(v) => setRankingDimension(v as typeof rankingDimension)}
                  >
                    <SelectTrigger className="w-28 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" side="bottom">
                      <SelectItem value="onlineRate">上线率</SelectItem>
                      <SelectItem value="oneMonthOnlineRate">一个月上线率</SelectItem>
                      <SelectItem value="fourMonthsOnlineRate">四个月上线率</SelectItem>
                      <SelectItem value="acceptanceRate">验收率</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {rankingData && rankingData.length > 0 ? (
                <div className="space-y-3">
                  {[...rankingData]
                    .sort((a, b) => b[rankingDimension] - a[rankingDimension])
                    .map((consultant, index) => {
                      const rate = consultant[rankingDimension];
                      const dimensionLabel: Record<string, string> = {
                        onlineRate: '上线率',
                        oneMonthOnlineRate: '一个月上线率',
                        fourMonthsOnlineRate: '四个月上线率',
                        acceptanceRate: '验收率',
                      };
                      const total = rankingData.length;
                      const t = total > 1 ? index / (total - 1) : 0;
                      const r = Math.round(34 + t * (239 - 34));
                      const g = Math.round(197 + t * (68 - 197));
                      const b = Math.round(94 + t * (68 - 94));
                      const barColor = `rgb(${r}, ${g}, ${b})`;
                      return (
                        <div key={consultant.name} className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            index === 0 ? 'bg-amber-100 text-amber-700' :
                            index === 1 ? 'bg-gray-200 text-gray-600' :
                            index === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-sm font-medium text-gray-900 truncate">{consultant.name}</span>
                              <span className="text-sm font-bold" style={{ color: barColor }}>{rate}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(rate, 100)}%`,
                                    backgroundColor: barColor,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0">{consultant.projectCount}个</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">暂无数据</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
