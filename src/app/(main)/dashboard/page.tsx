'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { 
  Users, 
  CheckCircle, 
  TrendingUp,
  TrendingDown,
  BarChart3,
  Loader2,
  Calendar,
  Trophy,
  ChevronDown
} from 'lucide-react';
import { TimeRange } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart as RechartsBarChart } from 'recharts';

interface DashboardStats {
  totalCustomers: number;
  onlineCustomers: number;
  acceptedCustomers: number;
  onlineRate: number;
  acceptanceRate: number;
  oneMonthOnlineRate: number;
  fourMonthsOnlineRate: number;
  // 上期数据
  lastMonthTotalCustomers: number;
  lastMonthOnlineRate: number;
  lastMonthAcceptanceRate: number;
  // 变动数据
  totalCustomersChange: number;
  onlineRateChange: number;
  acceptanceRateChange: number;
  statusDistribution: Record<string, number>;
  acceptanceDistribution: Record<string, number>;
  consultantDistribution: { name: string; projectCount: number; totalDays: number }[];
  consultantRanking: { name: string; projectCount: number; onlineRate: number; oneMonthOnlineRate: number; fourMonthsOnlineRate: number; acceptanceRate: number }[];
}

const initialStats: DashboardStats = {
  totalCustomers: 0,
  onlineCustomers: 0,
  acceptedCustomers: 0,
  onlineRate: 0,
  acceptanceRate: 0,
  oneMonthOnlineRate: 0,
  fourMonthsOnlineRate: 0,
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
  acceptanceDistribution: {
    '已验收': 0,
    '未上线未验收': 0,
    '已上线未验收': 0,
  },
  consultantDistribution: [],
  consultantRanking: [],
};

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
  const [timeRange, setTimeRange] = useState<TimeRange>(() => getStoredDates()?.timeRange ?? 'all');
  const [customStartDate, setCustomStartDate] = useState(() => getStoredDates()?.customStartDate ?? '');
  const [customEndDate, setCustomEndDate] = useState(() => getStoredDates()?.customEndDate ?? '');
  const [roleType, setRoleType] = useState<string>(() => getStoredDates()?.roleType ?? '交付顾问');
  const [rankingDimension, setRankingDimension] = useState<'onlineRate' | 'oneMonthOnlineRate' | 'fourMonthsOnlineRate' | 'acceptanceRate'>('onlineRate');
  const [distData, setDistData] = useState<{name:string,projectCount:number,totalDays:number}[]>([]);
  const [rankingData, setRankingData] = useState<{name:string,projectCount:number,onlineRate:number,oneMonthOnlineRate:number,fourMonthsOnlineRate:number,acceptanceRate:number}[]>([]);
  const [unlaunchedData, setUnlaunchedData] = useState<{name:string,oneMonthNotOnline:number,fourMonthsNotOnline:number}[]>([]);
  const [unlaunchedRoleType, setUnlaunchedRoleType] = useState<string>('交付顾问');
  const [unlaunchedImplType, setUnlaunchedImplType] = useState<string>('一对一交付');

  // 日期记忆：任一日期相关状态变化时保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('dashboard_date_memory', JSON.stringify({
        timeRange, customStartDate, customEndDate, roleType,
      }));
    } catch { /* ignore */ }
  }, [timeRange, customStartDate, customEndDate, roleType]);

  const fetchDistribution = async () => {
    try {
      let url = `/api/dashboard?timeRange=${timeRange}`;
      if (timeRange === 'custom' && customStartDate && customEndDate) {
        url += `&startDate=${customStartDate}&endDate=${customEndDate}`;
      }
      if (roleType) {
        url += `&roleType=${encodeURIComponent(roleType)}`;
      }
      if (roleType) {
        url += `&roleType=${encodeURIComponent(roleType)}`;
      }
      const response = await fetch(url, { headers: { ...getAuthHeader() } });
      const data = await response.json();
      if (response.ok && data.consultantDistribution) {
        setDistData(data.consultantDistribution);
      }
    } catch (error) {
      console.error('获取人天分布数据失败:', error);
    }
  };

  const fetchRanking = async () => {
    try {
      let url = `/api/dashboard?timeRange=${timeRange}`;
      if (timeRange === 'custom' && customStartDate && customEndDate) {
        url += `&startDate=${customStartDate}&endDate=${customEndDate}`;
      }
      if (roleType) {
        url += `&roleType=${encodeURIComponent(roleType)}`;
      }
      const response = await fetch(url, { headers: { ...getAuthHeader() } });
      const data = await response.json();
      if (response.ok && data.consultantRanking) {
        setRankingData(data.consultantRanking);
      }
    } catch (error) {
      console.error('获取排行数据失败:', error);
    }
  };

  const fetchUnlaunched = async () => {
    try {
      let url = `/api/dashboard/unlaunched-distribution?roleType=${encodeURIComponent(unlaunchedRoleType)}&implType=${encodeURIComponent(unlaunchedImplType)}`;
      const response = await fetch(url, { headers: { ...getAuthHeader() } });
      const data = await response.json();
      if (response.ok && data.data) {
        setUnlaunchedData(data.data);
      }
    } catch (error) {
      console.error('获取未上线项目分布失败:', error);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchDistribution();
  }, [isAdmin, timeRange, customStartDate, customEndDate, roleType]);

  useEffect(() => {
    if (isAdmin) fetchRanking();
  }, [isAdmin, timeRange, customStartDate, customEndDate, roleType]);

  useEffect(() => {
    if (isAdmin) fetchUnlaunched();
  }, [isAdmin, unlaunchedRoleType, unlaunchedImplType]);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!isInitialLoading) {
      fetchStats();
    }
  }, [timeRange, customStartDate, customEndDate]);

  const fetchStats = async () => {
    // 首次加载显示全屏loading，后续只显示更新状态
    if (isInitialLoading) {
      setIsInitialLoading(true);
    } else {
      setIsUpdating(true);
    }
    
    try {
      let url = `/api/dashboard?timeRange=${timeRange}`;
      if (timeRange === 'custom' && customStartDate && customEndDate) {
        url += `&startDate=${customStartDate}&endDate=${customEndDate}`;
      }
      const response = await fetch(url, {
        headers: { ...getAuthHeader() },
      });
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

  // 上线状态饼图数据
  const onlinePieData = [
    { name: '已上线', value: stats.statusDistribution?.['已上线'] || 0, fill: '#86efac' },
    { name: '未上线', value: stats.statusDistribution?.['未上线'] || 0, fill: '#fca5a5' },
    { name: '延期上线', value: stats.statusDistribution?.['延期上线'] || 0, fill: '#93c5fd' },
  ].filter(d => d.value > 0);

  // 验收状态饼图数据
  const acceptancePieData = [
    { name: '已验收', value: stats.acceptanceDistribution?.['已验收'] || 0, fill: '#86efac' },
    { name: '未上线未验收', value: stats.acceptanceDistribution?.['未上线未验收'] || 0, fill: '#fca5a5' },
    { name: '已上线未验收', value: stats.acceptanceDistribution?.['已上线未验收'] || 0, fill: '#fde68a' },
  ].filter(d => d.value > 0);

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

  return (
    <div className="min-h-screen p-4 sm:p-6 overflow-auto">
      {/* 页面标题和全局筛选 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">数据看板</h1>
          <p className="text-gray-500 mt-1">客户跟进数据总览</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isUpdating && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          )}
          <Select
            value={roleType}
            onValueChange={setRoleType}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="顾问类型" />
            </SelectTrigger>
            <SelectContent position="popper" side="bottom">
              <SelectItem value="交付顾问">交付顾问</SelectItem>
              <SelectItem value="答疑顾问">答疑顾问</SelectItem>
              <SelectItem value="全部">全部</SelectItem>
            </SelectContent>
          </Select>
          {timeRange !== 'custom' ? (
            <Select 
              value={timeRange} 
              onValueChange={(v) => setTimeRange(v as TimeRange)}
              disabled={isUpdating}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom">
                <SelectItem value="assessment">考核年度</SelectItem>
                <SelectItem value="year">本年</SelectItem>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <DateRangePicker
              startDate={customStartDate}
              endDate={customEndDate}
              onStartChange={setCustomStartDate}
              onEndChange={setCustomEndDate}
              onClear={() => setTimeRange('all')}
            />
          )}
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">1个月上线率</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{stats.oneMonthOnlineRate}%</div>
            <p className="text-xs text-gray-500 mt-1">
              开通&gt;30天客户中已上线
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">4个月上线率</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.fourMonthsOnlineRate}%</div>
            <p className="text-xs text-gray-500 mt-1">
              开通&gt;120天客户中已上线
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 客户状态分布图表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 上线状态饼图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-gray-400" />
              上线状态分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.statusDistribution && Object.keys(stats.statusDistribution).length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="w-[160px] h-[160px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={onlinePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {onlinePieData.map((entry, index) => (
                          <Cell key={`online-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value} 家`, name]}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 flex-1">
                  {onlinePieData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }}></span>
                        <span className="text-sm text-gray-700">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{item.value}</span>
                        <span className="text-xs text-gray-500 w-10 text-right">
                          {onlinePieData.reduce((s, d) => s + d.value, 0) > 0
                            ? Math.round((item.value / onlinePieData.reduce((s, d) => s + d.value, 0)) * 100)
                            : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">暂无数据</p>
            )}
          </CardContent>
        </Card>

        {/* 验收状态饼图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-gray-400" />
              验收状态分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.acceptanceDistribution && Object.keys(stats.acceptanceDistribution).length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="w-[160px] h-[160px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={acceptancePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {acceptancePieData.map((entry, index) => (
                          <Cell key={`acceptance-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value} 家`, name]}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 flex-1">
                  {acceptancePieData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }}></span>
                        <span className="text-sm text-gray-700">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{item.value}</span>
                        <span className="text-xs text-gray-500 w-10 text-right">
                          {acceptancePieData.reduce((s, d) => s + d.value, 0) > 0
                            ? Math.round((item.value / acceptancePieData.reduce((s, d) => s + d.value, 0)) * 100)
                            : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">暂无数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 项目人天分布 & 顾问排行 - 仅管理员可见 */}
      {isAdmin && (
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 mt-6">
        {/* 左列：项目人天分布 + 未上线项目分布 */}
        <div className="space-y-6">
          {/* 项目人天分布表 */}
          <Card>
            <CardHeader className="space-y-0 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-gray-400" />
                项目人天分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              {distData && distData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={distData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                    <YAxis yAxisId="left" label={{ value: '项目数', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" label={{ value: '人天', angle: 90, position: 'insideRight', style: { fontSize: 12 } }} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                      formatter={(value: number, name: string) => {
                        if (name === '项目数量') return [`${value} 个`, name];
                        return [`${value} 天`, name];
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="projectCount" name="项目数量" fill="#93c5fd" radius={[4, 4, 0, 0]} barSize={40} />
                    <Line yAxisId="right" type="monotone" dataKey="totalDays" name="人天数" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">暂无数据</p>
              )}
            </CardContent>
          </Card>

          {/* 未上线项目分布 */}
          <Card>
            <CardHeader className="space-y-0 pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-gray-400" />
                  未上线项目分布
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const el = document.getElementById('unlaunched-impl-dropdown');
                        if (el) el.classList.toggle('hidden');
                        const el2 = document.getElementById('unlaunched-role-dropdown');
                        if (el2) el2.classList.add('hidden');
                      }}
                      className="text-xs h-7"
                    >
                      {unlaunchedImplType === '一对一交付' ? '一对一交付' : unlaunchedImplType === '其他' ? '其他' : '全部类型'}
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                    <div id="unlaunched-impl-dropdown" className="hidden absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg min-w-[120px]">
                      {['全部类型', '一对一交付', '其他'].map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setUnlaunchedImplType(type === '全部类型' ? '' : type);
                            document.getElementById('unlaunched-impl-dropdown')?.classList.add('hidden');
                          }}
                          className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-accent ${(type === '全部类型' && !unlaunchedImplType) || type === unlaunchedImplType ? 'font-medium text-primary' : ''}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const el = document.getElementById('unlaunched-role-dropdown');
                        if (el) el.classList.toggle('hidden');
                        const el2 = document.getElementById('unlaunched-impl-dropdown');
                        if (el2) el2.classList.add('hidden');
                      }}
                      className="text-xs h-7"
                    >
                      {unlaunchedRoleType || '全部顾问'}
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                    <div id="unlaunched-role-dropdown" className="hidden absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg min-w-[120px]">
                      {['交付顾问', '答疑顾问'].map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setUnlaunchedRoleType(type);
                            document.getElementById('unlaunched-role-dropdown')?.classList.add('hidden');
                          }}
                          className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-accent ${type === unlaunchedRoleType ? 'font-medium text-primary' : ''}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {unlaunchedData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsBarChart data={unlaunchedData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                    <YAxis label={{ value: '项目数', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                      formatter={(value: number, name: string) => [`${value} 个`, name]}
                    />
                    <Legend />
                    <Bar dataKey="oneMonthNotOnline" name="1个月未上线" stackId="a" fill="#fb923c" radius={[0, 0, 0, 0]} barSize={40} />
                    <Bar dataKey="fourMonthsNotOnline" name="4个月未上线" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">暂无数据</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右列：顾问排行表 */}
        <div>
          <Card>
            <CardHeader className="space-y-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-gray-400" />
                  顾问排行
                </CardTitle>
                <div className="flex items-center gap-2 ml-auto">
                  <Select
                    value={rankingDimension}
                    onValueChange={(v) => setRankingDimension(v as typeof rankingDimension)}
                  >
                    <SelectTrigger className="w-36 h-7 text-xs">
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
                      // 从绿到红的渐变：第1名最绿，最后1名最红
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
