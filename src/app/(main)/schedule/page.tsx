'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Video, ExternalLink, Loader2, Check, ChevronsUpDown, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { format, addHours } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useHolidays } from '@/contexts/HolidayContext';

// 类型定义
interface Customer {
  id: string;
  name: string;
  status: string;
}

interface Schedule {
  id: string;
  customer_id: string;
  schedule_date: string;
  start_time?: string;
  notes: string | null;
  customer_name?: string;
  user_id?: string;
  user_name?: string;
}

interface DailySummary {
  gapCount: number;
  allSatisfied: boolean;
  consultantSchedules: { userId: string; userName: string; count: number }[];
}

interface ActiveConsultant {
  id: string;
  name: string;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateCalendarData(centerDate: Date): Date[] {
  const dates: Date[] = [];
  const today = new Date(centerDate);
  today.setHours(0, 0, 0, 0);
  
  const dayOfWeek = today.getDay();
  const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const monday = new Date(today);
  monday.setDate(today.getDate() - adjustedDayOfWeek);
  
  for (let i = 0; i < 42; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

export default function SchedulePage() {
  const { getAuthHeader, isAdmin } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [centerDate, setCenterDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  
  // 管理员汇总视图状态
  const [dailySummary, setDailySummary] = useState<Record<string, DailySummary>>({});
  const [activeConsultants, setActiveConsultants] = useState<ActiveConsultant[]>([]);
  const [showSummaryDetail, setShowSummaryDetail] = useState(false);
  const [summaryDetailDate, setSummaryDetailDate] = useState<string>('');
  const [expandedConsultant, setExpandedConsultant] = useState<string | null>(null);
  
  // 法定节假日数据从全局 Context 获取
  const { getDateStatus, loaded: holidayLoaded } = useHolidays();
  
  // 会议相关状态
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const [meetingSubject, setMeetingSubject] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [meetingDuration, setMeetingDuration] = useState(60);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingResult, setMeetingResult] = useState<{
    meetingUrl: string;
    meetingCode: string;
    subject: string;
    startTime: number;
    duration: number;
  } | null>(null);

  const calendarDates = useMemo(() => generateCalendarData(centerDate), [centerDate]);

  // 获取客户列表
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await fetch('/api/customers', {
          headers: { ...getAuthHeader() },
        });
        if (response.ok) {
          const result = await response.json();
          setCustomers(result.customers || []);
        }
      } catch (error) {
        console.error('获取客户列表失败:', error);
      }
    };
    fetchCustomers();
  }, []);

  // 获取日程数据
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const startDate = calendarDates[0];
        const endDate = calendarDates[calendarDates.length - 1];
        
        const response = await fetch(
          `/api/schedule?start=${formatDate(startDate)}&end=${formatDate(endDate)}`,
          { headers: { ...getAuthHeader() } }
        );
        
        if (response.ok) {
          const data = await response.json();
          setSchedules(data.schedules || []);
          // 管理员汇总数据
          if (data.dailySummary) setDailySummary(data.dailySummary);
          if (data.activeConsultants) setActiveConsultants(data.activeConsultants);
        }
      } catch (error) {
        console.error('获取日程失败:', error);
      }
    };
    fetchSchedules();
  }, [calendarDates]);

  const getSchedulesForDate = (date: Date): Schedule[] => {
    const dateStr = formatDate(date);
    return schedules.filter(s => {
      const dateField = s.schedule_date || s.start_time;
      if (!dateField) return false;
      const scheduleDateStr = dateField.split('T')[0];
      return scheduleDateStr === dateStr;
    });
  };

  // 管理员：获取某日期某顾问的日程
  const getSchedulesForDateAndUser = (dateStr: string, userId: string): Schedule[] => {
    return schedules.filter(s => {
      const dateField = s.schedule_date || s.start_time;
      if (!dateField) return false;
      const scheduleDateStr = dateField.split('T')[0];
      return scheduleDateStr === dateStr && s.user_id === userId;
    });
  };

  // 添加日程
  const handleAddSchedule = async (openMeeting: boolean = false) => {
    if (!selectedCustomerId || !selectedDate) return;
    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    if (!selectedCustomer) return;

    setLoading(true);
    try {
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          scheduleDate: formatDate(selectedDate),
          notes: notes || null,
        }),
      });

      if (response.ok) {
        const newSchedule = await response.json();
        setSchedules(prev => [...prev, { ...newSchedule.schedule, customer_name: selectedCustomer.name }]);
        setShowAddDialog(false);
        setSelectedCustomerId('');
        setNotes('');
        
        if (openMeeting) {
          setMeetingSubject(`${selectedCustomer.name} - 项目实施沟通`);
          setMeetingDate(formatDate(selectedDate));
          setMeetingTime(format(addHours(new Date(), 1), 'HH:mm'));
          setMeetingDuration(60);
          setMeetingResult(null);
          setShowMeetingDialog(true);
        }
      }
    } catch (error) {
      console.error('添加日程失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 删除日程
  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      const response = await fetch(`/api/schedule/${scheduleId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      if (response.ok) {
        setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      }
    } catch (error) {
      console.error('删除日程失败:', error);
    }
  };

  // 打开本地腾讯会议
  const openLocalTencentMeeting = () => {
    window.location.href = 'wemeet://page/schedulemeeting';
    setTimeout(() => setShowMeetingDialog(false), 1000);
  };

  // 创建腾讯会议
  const handleCreateMeeting = async () => {
    if (!meetingSubject || !meetingDate || !meetingTime) return;
    setMeetingLoading(true);
    try {
      const startDateTime = new Date(`${meetingDate}T${meetingTime}`);
      const startTime = Math.floor(startDateTime.getTime() / 1000);
      const response = await fetch('/api/tencent-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ subject: meetingSubject, startTime, duration: meetingDuration }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setMeetingResult(data.data);
        setTimeout(() => { setShowMeetingDialog(false); setMeetingResult(null); }, 2000);
      } else {
        alert(data.error || '创建会议失败');
      }
    } catch (error) {
      console.error('创建会议失败:', error);
      alert('创建会议失败');
    } finally {
      setMeetingLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  const isToday = (date: Date): boolean => formatDate(date) === formatDate(new Date());

  const isFirstOfMonth = (date: Date): { isFirst: boolean; month: number } => {
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    return {
      isFirst: date.getDate() === 1 || prevDate.getMonth() !== date.getMonth(),
      month: date.getMonth() + 1,
    };
  };

  // 管理员汇总视图：点击日期查看详情
  const handleSummaryDateClick = (date: Date) => {
    const dateStr = formatDate(date);
    setSummaryDetailDate(dateStr);
    setShowSummaryDetail(true);
    setExpandedConsultant(null);
  };

  // 获取管理员汇总日历某天的空缺数（含无日程日期）
  const getAdminDayGapCount = (date: Date): number => {
    const dateStr = formatDate(date);
    const summary = dailySummary[dateStr];
    if (summary) return summary.gapCount;
    // 没有任何日程的日期，空缺数 = 在职顾问数 * 2
    return activeConsultants.length * 2;
  };

  const isAdminAllSatisfied = (date: Date): boolean => {
    const dateStr = formatDate(date);
    const summary = dailySummary[dateStr];
    if (!summary && activeConsultants.length === 0) return true;
    if (!summary) return false;
    return summary.allSatisfied;
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 页面标题 */}
      <div className="shrink-0 px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">日程排期</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin ? '汇总视图 - 查看所有顾问排期' : '安排你的交付日程'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
              <span className="text-gray-500">存在空缺</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-red-100 border border-red-200"></div>
              <span className="text-gray-500">排期满载</span>
            </div>
          </div>
        )}
      </div>

      {/* 日历区域 */}
      <div className="flex-1 overflow-auto p-6">
        {/* PC端：网格布局 */}
        <div className="hidden lg:block max-w-6xl mx-auto">
          {/* 星期标题 */}
          <div className="grid grid-cols-7 mb-2">
            {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, index) => (
              <div key={day} className={`text-center py-2 text-sm font-medium ${index >= 5 ? 'text-gray-400' : 'text-gray-500'}`}>
                {day}
              </div>
            ))}
          </div>

          {/* 日历网格 */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDates.map((date, index) => {
              const dateStr = formatDate(date);
              const dateStatus = getDateStatus(date);
              const todayClass = isToday(date);
              const { isFirst, month } = isFirstOfMonth(date);
              const dateSchedules = getSchedulesForDate(date);
              const isHovered = hoveredDate === dateStr;
              const isWeekendOrHoliday = dateStatus.isHoliday || dateStatus.isWeekend;

              // 管理员汇总视图
              if (isAdmin) {
                const gapCount = getAdminDayGapCount(date);
                const allSatisfied = isAdminAllSatisfied(date);

                return (
                  <div
                    key={index}
                    className={cn(
                      'relative min-h-[100px] border rounded-lg transition-colors cursor-pointer',
                      isWeekendOrHoliday
                        ? 'bg-gray-100 border-gray-300'
                        : allSatisfied
                        ? 'bg-red-50 border-red-200 hover:border-red-400'
                        : 'bg-green-50 border-green-200 hover:border-green-400',
                      todayClass ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                    )}
                    onMouseEnter={() => setHoveredDate(dateStr)}
                    onMouseLeave={() => setHoveredDate(null)}
                    onClick={() => handleSummaryDateClick(date)}
                  >
                    <div className="p-2 flex items-start justify-between">
                      <div>
                        {isFirst ? (
                          <span className="text-lg font-bold text-blue-600">{month}月</span>
                        ) : (
                          <span className={`text-sm ${isWeekendOrHoliday ? 'text-gray-600' : 'text-gray-700'}`}>
                            {date.getDate()}
                          </span>
                        )}
                      </div>
                      {!isWeekendOrHoliday && gapCount > 0 && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">
                          余{gapCount}
                        </span>
                      )}
                      {!isWeekendOrHoliday && gapCount === 0 && activeConsultants.length > 0 && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                          满
                        </span>
                      )}
                    </div>

                    {dateStatus.holidayName && (
                      <div className="px-2 pb-1">
                        <span className="text-xs text-gray-500">{dateStatus.holidayName}</span>
                      </div>
                    )}

                    {/* 管理员视图：简要显示顾问日程数 */}
                    <div className="px-2 pb-2 space-y-0.5">
                      {!isWeekendOrHoliday && dailySummary[dateStr]?.consultantSchedules?.slice(0, 4).map((cs) => (
                        <div key={cs.userId} className="text-xs flex items-center justify-between">
                          <span className="text-gray-600 truncate">{cs.userName}</span>
                          <span className={cn(
                            'font-medium ml-1',
                            cs.count >= 2 ? 'text-green-600' : cs.count > 0 ? 'text-yellow-600' : 'text-red-500'
                          )}>
                            {cs.count}
                          </span>
                        </div>
                      ))}
                      {!isWeekendOrHoliday && dailySummary[dateStr]?.consultantSchedules?.length > 4 && (
                        <div className="text-xs text-gray-400">
                          +{dailySummary[dateStr].consultantSchedules.length - 4} 更多
                        </div>
                      )}
                      {!isWeekendOrHoliday && !dailySummary[dateStr] && activeConsultants.length > 0 && (
                        <div className="text-xs text-green-500">全部空缺</div>
                      )}
                    </div>
                  </div>
                );
              }

              // 普通用户视图
              return (
                <div
                  key={index}
                  className={`relative min-h-[100px] border rounded-lg transition-colors cursor-pointer group ${
                    isWeekendOrHoliday
                      ? 'bg-gray-100 border-gray-300'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  } ${todayClass ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  onMouseEnter={() => setHoveredDate(dateStr)}
                  onMouseLeave={() => setHoveredDate(null)}
                  onClick={() => {
                    setSelectedDate(date);
                    setSelectedCustomerId('');
                    setCustomerSearch('');
                    setNotes('');
                    setShowAddDialog(true);
                  }}
                >
                  <div className="p-2 flex items-start justify-between">
                    <div>
                      {isFirst ? (
                        <span className="text-lg font-bold text-blue-600">{month}月</span>
                      ) : (
                        <span className={`text-sm ${isWeekendOrHoliday ? 'text-gray-600' : 'text-gray-700'}`}>
                          {date.getDate()}
                        </span>
                      )}
                    </div>
                    {isHovered && (
                      <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm">
                        <Plus className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {dateStatus.holidayName && (
                    <div className="px-2 pb-1">
                      <span className="text-xs text-gray-500">{dateStatus.holidayName}</span>
                    </div>
                  )}

                  <div className="px-2 pb-2 space-y-1">
                    {dateSchedules.slice(0, 3).map(schedule => (
                      <div
                        key={schedule.id}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded truncate flex items-center justify-between group/schedule"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="truncate flex-1">{schedule.customer_name || '未知客户'}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(schedule.id); }}
                          className="ml-1 opacity-0 group-hover/schedule:opacity-100 hover:text-red-500 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {dateSchedules.length > 3 && (
                      <div className="text-xs text-gray-500 px-2">+{dateSchedules.length - 3} 更多</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 移动端：纵向列表 */}
        <div className="lg:hidden max-w-3xl mx-auto space-y-2">
          {calendarDates.map((date, index) => {
            const dateStr = formatDate(date);
            const dateStatus = getDateStatus(date);
            const todayClass = isToday(date);
            const { isFirst, month } = isFirstOfMonth(date);
            const dateSchedules = getSchedulesForDate(date);
            const dayOfWeek = date.getDay();
            const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const isWeekendOrHoliday = dateStatus.isHoliday || dateStatus.isWeekend;

            // 管理员汇总移动端
            if (isAdmin) {
              const gapCount = getAdminDayGapCount(date);
              const allSatisfied = isAdminAllSatisfied(date);

              return (
                <div
                  key={index}
                  className={cn(
                    'flex items-center gap-4 p-4 border rounded-lg transition-colors cursor-pointer',
                    isWeekendOrHoliday
                      ? 'bg-gray-100 border-gray-300'
                      : allSatisfied
                      ? 'bg-red-50 border-red-200'
                      : 'bg-green-50 border-green-200',
                    todayClass ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  )}
                  onClick={() => handleSummaryDateClick(date)}
                >
                  <div className="w-24 shrink-0">
                    {isFirst && <div className="text-lg font-bold text-blue-600 mb-1">{month}月</div>}
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-semibold ${isWeekendOrHoliday ? 'text-gray-500' : 'text-gray-800'}`}>
                        {date.getDate()}
                      </span>
                      <span className={`text-sm ${dayOfWeek === 0 || dayOfWeek === 6 ? 'text-gray-400' : 'text-gray-500'}`}>
                        {dayNames[dayOfWeek]}
                      </span>
                    </div>
                    {dateStatus.holidayName && <span className="text-xs text-red-500">{dateStatus.holidayName}</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    {!isWeekendOrHoliday ? (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className={cn('text-sm font-medium', gapCount > 0 ? 'text-green-600' : 'text-red-600')}>
                          {gapCount > 0 ? `余 ${gapCount} 个` : '排期满载'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">休息日</span>
                    )}
                  </div>
                </div>
              );
            }

            // 普通用户移动端
            return (
              <div
                key={index}
                className={`flex items-center gap-4 p-4 border rounded-lg transition-colors cursor-pointer group ${
                  isWeekendOrHoliday
                    ? 'bg-gray-100 border-gray-300'
                    : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
                } ${todayClass ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                onClick={() => {
                  setSelectedDate(date);
                  setSelectedCustomerId('');
                  setCustomerSearch('');
                  setNotes('');
                  setShowAddDialog(true);
                }}
              >
                <div className="w-24 shrink-0">
                  {isFirst && <div className="text-lg font-bold text-blue-600 mb-1">{month}月</div>}
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-semibold ${isWeekendOrHoliday ? 'text-gray-500' : 'text-gray-800'}`}>
                      {date.getDate()}
                    </span>
                    <span className={`text-sm ${dayOfWeek === 0 || dayOfWeek === 6 ? 'text-gray-400' : 'text-gray-500'}`}>
                      {dayNames[dayOfWeek]}
                    </span>
                  </div>
                  {dateStatus.holidayName && <span className="text-xs text-red-500">{dateStatus.holidayName}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  {dateSchedules.length === 0 ? (
                    <span className="text-sm text-gray-400 group-hover:text-gray-500">暂无日程</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dateSchedules.map(schedule => (
                        <div
                          key={schedule.id}
                          className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full flex items-center gap-2 group/schedule"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>{schedule.customer_name || '未知客户'}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(schedule.id); }}
                            className="opacity-0 group-hover/schedule:opacity-100 hover:text-red-500 transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 管理员：日期排期详情对话框 */}
      <Dialog open={showSummaryDetail} onOpenChange={setShowSummaryDetail}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              排期详情 - {summaryDetailDate}
            </DialogTitle>
            <DialogDescription>
              查看所有顾问的排期情况
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            {activeConsultants.map((consultant) => {
              const consultantSchedules = getSchedulesForDateAndUser(summaryDetailDate, consultant.id);
              const count = consultantSchedules.length;
              const isExpanded = expandedConsultant === consultant.id;

              return (
                <div key={consultant.id} className="border rounded-lg overflow-hidden">
                  <div
                    className={cn(
                      'flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors',
                      count >= 2 ? 'bg-green-50' : count > 0 ? 'bg-yellow-50' : 'bg-red-50'
                    )}
                    onClick={() => setExpandedConsultant(isExpanded ? null : consultant.id)}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="font-medium text-gray-800">{consultant.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-medium',
                        count >= 2 ? 'text-green-600' : count > 0 ? 'text-yellow-600' : 'text-red-500'
                      )}>
                        {count}/2
                      </span>
                      {count < 2 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">
                          余{2 - count}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="p-3 bg-white border-t space-y-1.5">
                      {consultantSchedules.length === 0 ? (
                        <p className="text-sm text-gray-400">暂无排期</p>
                      ) : (
                        consultantSchedules.map(s => (
                          <div key={s.id} className="flex items-center justify-between text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded">
                            <span>{s.customer_name || '未知客户'}</span>
                            {s.notes && <span className="text-gray-400 ml-2 text-xs">{s.notes}</span>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* 添加日程对话框（普通用户） */}
      {!isAdmin && (
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>添加日程 - {selectedDate?.toLocaleDateString('zh-CN')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>选择客户</Label>
                <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={customerPopoverOpen} className="w-full justify-between">
                      {selectedCustomer ? selectedCustomer.name : "请选择客户..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="搜索客户..." value={customerSearch} onValueChange={setCustomerSearch} />
                      <CommandList>
                        <CommandEmpty>未找到客户</CommandEmpty>
                        <CommandGroup>
                          {filteredCustomers.map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={customer.name}
                              onSelect={() => {
                                setSelectedCustomerId(customer.id === selectedCustomerId ? '' : customer.id);
                                setCustomerPopoverOpen(false);
                                setCustomerSearch('');
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedCustomerId === customer.id ? "opacity-100" : "opacity-0")} />
                              {customer.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>备注（可选）</Label>
                <Input placeholder="输入备注信息..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="flex gap-4">
              <Button variant="outline" className="flex-1" onClick={() => handleAddSchedule(false)} disabled={!selectedCustomerId || loading}>
                {loading ? '添加中...' : '添加'}
              </Button>
              <Button className="flex-1" onClick={() => handleAddSchedule(true)} disabled={!selectedCustomerId || loading}>
                <Video className="w-4 h-4 mr-1" />
                {loading ? '添加中...' : '添加并预订会议'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 会议预订对话框 */}
      <Dialog 
        open={showMeetingDialog} 
        onOpenChange={(open) => { if (!open) { setShowMeetingDialog(false); setMeetingResult(null); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>预订会议</DialogTitle>
            <DialogDescription>为日程创建腾讯会议</DialogDescription>
          </DialogHeader>

          {!meetingResult ? (
            <>
              <div className="py-2">
                <Button className="w-full" onClick={openLocalTencentMeeting} size="lg">
                  <Video className="w-4 h-4 mr-2" />
                  使用腾讯会议预订
                </Button>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">或使用 API 创建</span>
                </div>
              </div>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>会议主题</Label>
                  <Input value={meetingSubject} onChange={(e) => setMeetingSubject(e.target.value)} placeholder="请输入会议主题" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>会议日期</Label>
                    <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>开始时间</Label>
                    <Input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>会议时长</Label>
                  <Select value={meetingDuration.toString()} onValueChange={(v) => setMeetingDuration(parseInt(v))}>
                    <SelectTrigger><SelectValue placeholder="选择会议时长" /></SelectTrigger>
                    <SelectContent position="popper" side="bottom" align="start">
                      <SelectItem value="30">30 分钟</SelectItem>
                      <SelectItem value="60">1 小时</SelectItem>
                      <SelectItem value="90">1.5 小时</SelectItem>
                      <SelectItem value="120">2 小时</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowMeetingDialog(false)}>取消</Button>
                <Button onClick={handleCreateMeeting} disabled={meetingLoading || !meetingSubject || !meetingDate || !meetingTime}>
                  {meetingLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />创建中...</> : '创建会议'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                      <Video className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">会议创建成功</p>
                      <p className="text-sm text-gray-500">会议码: {meetingResult.meetingCode}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">会议主题</span><span className="font-medium">{meetingResult.subject}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">会议时间</span><span className="font-medium">{format(new Date(meetingResult.startTime * 1000), 'yyyy-MM-dd HH:mm')}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">会议时长</span><span className="font-medium">{meetingResult.duration} 分钟</span></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>会议链接</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={meetingResult.meetingUrl} className="flex-1" />
                    <Button variant="outline" onClick={() => navigator.clipboard.writeText(meetingResult.meetingUrl)}>复制</Button>
                  </div>
                </div>
                <Button className="w-full" onClick={() => window.open(meetingResult.meetingUrl, '_blank')}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  打开腾讯会议
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setShowMeetingDialog(false)}>关闭</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
