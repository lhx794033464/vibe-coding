'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Video, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
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
import { format, addHours } from 'date-fns';

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
  notes: string | null;
  customer_name?: string;
}

// 法定节假日数据
const WORKDAYS_ON_WEEKEND: Set<string> = new Set([
  // 2024年调休
  '2024-02-04', '2024-02-18', '2024-04-07', '2024-04-28', '2024-05-11',
  '2024-09-14', '2024-09-29', '2024-10-12',
  // 2025年调休
  '2025-01-26', '2025-02-08', '2025-04-27',
  // 2026年调休
  '2026-02-14', '2026-02-28', '2026-04-26', '2026-05-09', '2026-09-27', '2026-10-10',
]);

const HOLIDAYS: Record<string, string> = {
  '2024-01-01': '元旦',
  '2024-02-10': '春节', '2024-02-11': '春节', '2024-02-12': '春节', '2024-02-13': '春节',
  '2024-02-14': '春节', '2024-02-15': '春节', '2024-02-16': '春节', '2024-02-17': '春节',
  '2024-04-04': '清明', '2024-04-05': '清明', '2024-04-06': '清明',
  '2024-05-01': '劳动节', '2024-05-02': '劳动节', '2024-05-03': '劳动节',
  '2024-05-04': '劳动节', '2024-05-05': '劳动节',
  '2024-06-08': '端午', '2024-06-09': '端午', '2024-06-10': '端午',
  '2024-09-15': '中秋', '2024-09-16': '中秋', '2024-09-17': '中秋',
  '2024-10-01': '国庆', '2024-10-02': '国庆', '2024-10-03': '国庆',
  '2024-10-04': '国庆', '2024-10-05': '国庆', '2024-10-06': '国庆', '2024-10-07': '国庆',
  // 2025年
  '2025-01-01': '元旦',
  '2025-01-28': '春节', '2025-01-29': '春节', '2025-01-30': '春节', '2025-01-31': '春节',
  '2025-02-01': '春节', '2025-02-02': '春节', '2025-02-03': '春节', '2025-02-04': '春节',
  '2025-04-04': '清明', '2025-04-05': '清明', '2025-04-06': '清明',
  '2025-05-01': '劳动节', '2025-05-02': '劳动节', '2025-05-03': '劳动节',
  '2025-05-04': '劳动节', '2025-05-05': '劳动节',
  '2025-05-31': '端午', '2025-06-01': '端午', '2025-06-02': '端午',
  '2025-10-01': '国庆', '2025-10-02': '国庆', '2025-10-03': '国庆',
  '2025-10-04': '国庆', '2025-10-05': '国庆', '2025-10-06': '国庆&中秋', '2025-10-07': '国庆',
  // 2026年
  '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
  '2026-02-17': '春节', '2026-02-18': '春节', '2026-02-19': '春节',
  '2026-02-20': '春节', '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
  '2026-04-05': '清明', '2026-04-06': '清明', '2026-04-07': '清明',
  '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
  '2026-05-04': '劳动节', '2026-05-05': '劳动节',
  '2026-06-19': '端午', '2026-06-20': '端午', '2026-06-21': '端午',
  '2026-10-01': '国庆', '2026-10-02': '国庆', '2026-10-03': '国庆',
  '2026-10-04': '国庆', '2026-10-05': '国庆', '2026-10-06': '国庆', '2026-10-07': '国庆',
  '2026-10-08': '国庆',
};

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateStatus(date: Date): { 
  isHoliday: boolean; 
  isWorkday: boolean; 
  holidayName: string | null;
  isWeekend: boolean;
} {
  const dateStr = formatDate(date);
  const dayOfWeek = date.getDay();
  const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
  
  const holidayName = HOLIDAYS[dateStr] || null;
  if (holidayName) {
    return { isHoliday: true, isWorkday: false, holidayName, isWeekend: false };
  }
  
  if (WORKDAYS_ON_WEEKEND.has(dateStr)) {
    return { isHoliday: false, isWorkday: true, holidayName: '调休', isWeekend: false };
  }
  
  if (isWeekendDay) {
    return { isHoliday: false, isWorkday: false, holidayName: null, isWeekend: true };
  }
  
  return { isHoliday: false, isWorkday: true, holidayName: null, isWeekend: false };
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
  const { session } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [centerDate, setCenterDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  
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
      if (!session?.access_token) return;
      
      try {
        const response = await fetch('/api/customers', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        
        if (response.ok) {
          const result = await response.json();
          setCustomers(result.data || []);
        }
      } catch (error) {
        console.error('获取客户列表失败:', error);
      }
    };

    fetchCustomers();
  }, [session?.access_token]);

  // 获取日程数据
  useEffect(() => {
    const fetchSchedules = async () => {
      if (!session?.access_token) return;
      
      try {
        const startDate = calendarDates[0];
        const endDate = calendarDates[calendarDates.length - 1];
        
        const response = await fetch(
          `/api/schedule?start=${formatDate(startDate)}&end=${formatDate(endDate)}`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          setSchedules(data.schedules || []);
        }
      } catch (error) {
        console.error('获取日程失败:', error);
      }
    };

    fetchSchedules();
  }, [session?.access_token, calendarDates]);

  const getSchedulesForDate = (date: Date): Schedule[] => {
    const dateStr = formatDate(date);
    return schedules.filter(s => s.schedule_date.split('T')[0] === dateStr);
  };

  // 添加日程
  const handleAddSchedule = async (openMeeting: boolean = false) => {
    if (!selectedCustomerId || !selectedDate || !session?.access_token) return;

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    if (!selectedCustomer) return;

    setLoading(true);
    try {
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          scheduleDate: formatDate(selectedDate),
          notes: notes || null,
        }),
      });

      if (response.ok) {
        const newSchedule = await response.json();
        setSchedules(prev => [...prev, { 
          ...newSchedule.schedule, 
          customer_name: selectedCustomer.name 
        }]);
        
        // 关闭添加对话框
        setShowAddDialog(false);
        setSelectedCustomerId('');
        setNotes('');
        
        // 如果需要打开会议对话框
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
    if (!session?.access_token) return;

    try {
      const response = await fetch(`/api/schedule/${scheduleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          subject: meetingSubject,
          startTime,
          duration: meetingDuration,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMeetingResult(data.data);
        // 2秒后自动关闭弹窗
        setTimeout(() => {
          setShowMeetingDialog(false);
          setMeetingResult(null);
        }, 2000);
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

  // 导航
  const goToPrevMonth = () => {
    const newDate = new Date(centerDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCenterDate(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(centerDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCenterDate(newDate);
  };

  const goToToday = () => {
    setCenterDate(new Date());
  };

  const getDisplayMonthRange = (): string => {
    const months = new Set<number>();
    const years = new Set<number>();
    
    calendarDates.forEach(date => {
      months.add(date.getMonth() + 1);
      years.add(date.getFullYear());
    });
    
    const yearList = Array.from(years).sort();
    const monthList = Array.from(months).sort((a, b) => a - b);
    
    if (yearList.length === 1) {
      return `${yearList[0]}年 ${monthList.map(m => `${m}月`).join(' - ')}`;
    } else {
      return `${yearList[0]}年${monthList[0]}月 - ${yearList[yearList.length - 1]}年${monthList[monthList.length - 1]}月`;
    }
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  };

  const isFirstOfMonth = (date: Date): { isFirst: boolean; month: number } => {
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    return {
      isFirst: date.getDate() === 1 || prevDate.getMonth() !== date.getMonth(),
      month: date.getMonth() + 1,
    };
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 头部 */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-gray-900">日程排期</h1>
            <span className="text-sm text-gray-500">{getDisplayMonthRange()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              今天
            </Button>
            <div className="flex items-center border border-gray-200 rounded-lg">
              <Button variant="ghost" size="sm" onClick={goToPrevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToNextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 日历区域 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* 星期标题 */}
          <div className="grid grid-cols-7 mb-2">
            {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, index) => (
              <div
                key={day}
                className={`text-center py-2 text-sm font-medium ${
                  index >= 5 ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
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

              return (
                <div
                  key={index}
                  className={`relative min-h-[100px] border rounded-lg transition-colors cursor-pointer group ${
                    dateStatus.isHoliday
                      ? 'bg-gray-100 border-gray-300'
                      : dateStatus.isWorkday
                      ? 'bg-white border-gray-200 hover:border-blue-300'
                      : dateStatus.isWeekend
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  } ${todayClass ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  onMouseEnter={() => setHoveredDate(dateStr)}
                  onMouseLeave={() => setHoveredDate(null)}
                  onClick={() => {
                    setSelectedDate(date);
                    setSelectedCustomerId('');
                    setNotes('');
                    setShowAddDialog(true);
                  }}
                >
                  <div className="p-2 flex items-start justify-between">
                    <div>
                      {isFirst ? (
                        <span className="text-lg font-bold text-blue-600">{month}月</span>
                      ) : (
                        <span className={`text-sm ${
                          dateStatus.isHoliday ? 'text-gray-600' : 
                          dateStatus.isWeekend ? 'text-gray-400' : 'text-gray-700'
                        }`}>
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
                        <span className="truncate flex-1">
                          {schedule.customer_name || '未知客户'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSchedule(schedule.id);
                          }}
                          className="ml-1 opacity-0 group-hover/schedule:opacity-100 hover:text-red-500 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {dateSchedules.length > 3 && (
                      <div className="text-xs text-gray-500 px-2">
                        +{dateSchedules.length - 3} 更多
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 添加日程对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              添加日程 - {selectedDate?.toLocaleDateString('zh-CN')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 客户选择 - 下拉菜单 */}
            <div className="space-y-2">
              <Label>选择客户</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择客户" />
                </SelectTrigger>
                <SelectContent>
                  {customers.length === 0 ? (
                    <div className="px-2 py-4 text-center text-gray-500 text-sm">
                      暂无客户数据
                    </div>
                  ) : (
                    customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* 备注 */}
            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input
                placeholder="输入备注信息..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleAddSchedule(false)}
              disabled={!selectedCustomerId || loading}
            >
              {loading ? '添加中...' : '添加'}
            </Button>
            <Button
              className="flex-1"
              onClick={() => handleAddSchedule(true)}
              disabled={!selectedCustomerId || loading}
            >
              <Video className="w-4 h-4 mr-1" />
              {loading ? '添加中...' : '添加并预订会议'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 会议预订对话框 */}
      <Dialog 
        open={showMeetingDialog} 
        onOpenChange={(open) => {
          if (!open) {
            setShowMeetingDialog(false);
            setMeetingResult(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>预订会议</DialogTitle>
            <DialogDescription>
              为日程创建腾讯会议
            </DialogDescription>
          </DialogHeader>

          {!meetingResult ? (
            <>
              {/* 快捷方式 */}
              <div className="py-2">
                <Button className="w-full" onClick={openLocalTencentMeeting} size="lg">
                  <Video className="w-4 h-4 mr-2" />
                  使用腾讯会议预订
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">或使用 API 创建</span>
                </div>
              </div>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>会议主题</Label>
                  <Input
                    value={meetingSubject}
                    onChange={(e) => setMeetingSubject(e.target.value)}
                    placeholder="请输入会议主题"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>会议日期</Label>
                    <Input
                      type="date"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>开始时间</Label>
                    <Input
                      type="time"
                      value={meetingTime}
                      onChange={(e) => setMeetingTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>会议时长</Label>
                  <Select
                    value={meetingDuration.toString()}
                    onValueChange={(v) => setMeetingDuration(parseInt(v))}
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
                <Button variant="outline" onClick={() => setShowMeetingDialog(false)}>
                  取消
                </Button>
                <Button 
                  onClick={handleCreateMeeting}
                  disabled={meetingLoading || !meetingSubject || !meetingDate || !meetingTime}
                >
                  {meetingLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    '创建会议'
                  )}
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
                    <div className="flex justify-between">
                      <span className="text-gray-500">会议主题</span>
                      <span className="font-medium">{meetingResult.subject}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">会议时间</span>
                      <span className="font-medium">
                        {format(new Date(meetingResult.startTime * 1000), 'yyyy-MM-dd HH:mm')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">会议时长</span>
                      <span className="font-medium">{meetingResult.duration} 分钟</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>会议链接</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={meetingResult.meetingUrl} className="flex-1" />
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(meetingResult.meetingUrl)}
                    >
                      复制
                    </Button>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => window.open(meetingResult.meetingUrl, '_blank')}
                >
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
