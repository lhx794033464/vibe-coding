'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

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

// 2024-2025年法定节假日（可根据需要扩展）
const HOLIDAYS_2024_2025: Record<string, string> = {
  // 2024年
  '2024-01-01': '元旦',
  '2024-02-10': '春节',
  '2024-02-11': '春节',
  '2024-02-12': '春节',
  '2024-02-13': '春节',
  '2024-02-14': '春节',
  '2024-02-15': '春节',
  '2024-02-16': '春节',
  '2024-02-17': '春节',
  '2024-04-04': '清明节',
  '2024-04-05': '清明节',
  '2024-04-06': '清明节',
  '2024-05-01': '劳动节',
  '2024-05-02': '劳动节',
  '2024-05-03': '劳动节',
  '2024-05-04': '劳动节',
  '2024-05-05': '劳动节',
  '2024-06-08': '端午节',
  '2024-06-09': '端午节',
  '2024-06-10': '端午节',
  '2024-09-15': '中秋节',
  '2024-09-16': '中秋节',
  '2024-09-17': '中秋节',
  '2024-10-01': '国庆节',
  '2024-10-02': '国庆节',
  '2024-10-03': '国庆节',
  '2024-10-04': '国庆节',
  '2024-10-05': '国庆节',
  '2024-10-06': '国庆节',
  '2024-10-07': '国庆节',
  // 2025年
  '2025-01-01': '元旦',
  '2025-01-28': '春节',
  '2025-01-29': '春节',
  '2025-01-30': '春节',
  '2025-01-31': '春节',
  '2025-02-01': '春节',
  '2025-02-02': '春节',
  '2025-02-03': '春节',
  '2025-02-04': '春节',
  '2025-04-04': '清明节',
  '2025-04-05': '清明节',
  '2025-04-06': '清明节',
  '2025-05-01': '劳动节',
  '2025-05-02': '劳动节',
  '2025-05-03': '劳动节',
  '2025-05-04': '劳动节',
  '2025-05-05': '劳动节',
  '2025-05-31': '端午节',
  '2025-06-01': '端午节',
  '2025-06-02': '端午节',
  '2025-10-01': '国庆节',
  '2025-10-02': '国庆节',
  '2025-10-03': '国庆节',
  '2025-10-04': '国庆节',
  '2025-10-05': '国庆节',
  '2025-10-06': '国庆节&中秋',
  '2025-10-07': '国庆节',
};

// 检查是否是周末
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// 检查是否是节假日
function isHoliday(date: Date): string | null {
  const dateStr = date.toISOString().split('T')[0];
  return HOLIDAYS_2024_2025[dateStr] || null;
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// 生成以当天为中心的月历数据
function generateCalendarData(centerDate: Date): Date[] {
  const dates: Date[] = [];
  const today = new Date(centerDate);
  today.setHours(0, 0, 0, 0);
  
  // 当天固定在第一行第三个（索引2，即周三）
  // 需要计算偏移量
  const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
  // 周一=0, 周二=1, ..., 周日=6
  const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  // 当天应该在第0行第2列（周三位置）
  // 所以需要计算从当天到周三的偏移
  const targetPosition = 2; // 周三位置
  const offset = adjustedDayOfWeek - targetPosition;
  
  // 计算起始日期（第一行第一个位置）
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - adjustedDayOfWeek + targetPosition);
  
  // 生成6周的日期（42天）
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

// 获取日期所在的月份
function getMonthFromDate(date: Date): number {
  return date.getMonth() + 1;
}

export default function SchedulePage() {
  const { session } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [centerDate, setCenterDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // 生成日历数据
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
          const data = await response.json();
          setCustomers(data.customers || []);
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
        // 获取当前显示月份的范围
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

  // 过滤客户列表
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 获取某日期的日程
  const getSchedulesForDate = (date: Date): Schedule[] => {
    const dateStr = formatDate(date);
    return schedules.filter(s => s.schedule_date.split('T')[0] === dateStr);
  };

  // 处理添加日程
  const handleAddSchedule = async () => {
    if (!selectedCustomer || !selectedDate || !session?.access_token) return;

    setLoading(true);
    try {
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
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
        setShowAddDialog(false);
        setSelectedCustomer(null);
        setNotes('');
        setSearchQuery('');
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

  // 上一个月
  const goToPrevMonth = () => {
    const newDate = new Date(centerDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCenterDate(newDate);
  };

  // 下一个月
  const goToNextMonth = () => {
    const newDate = new Date(centerDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCenterDate(newDate);
  };

  // 回到今天
  const goToToday = () => {
    setCenterDate(new Date());
  };

  // 获取当前显示的月份范围
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

  // 判断是否是当天
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  };

  // 判断是否是1号（需要显示月份）
  const isFirstOfMonth = (date: Date): { isFirst: boolean; month: number } => {
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    return {
      isFirst: date.getDate() === 1 || prevDate.getMonth() !== date.getMonth(),
      month: date.getMonth() + 1,
    };
  };

  const today = new Date();

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
                  index >= 5 ? 'text-red-400' : 'text-gray-500'
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
              const holidayName = isHoliday(date);
              const weekend = isWeekend(date);
              const todayClass = isToday(date);
              const { isFirst, month } = isFirstOfMonth(date);
              const dateSchedules = getSchedulesForDate(date);
              const isHovered = hoveredDate === dateStr;

              return (
                <div
                  key={index}
                  className={`relative min-h-[100px] border rounded-lg transition-colors cursor-pointer group ${
                    holidayName
                      ? 'bg-red-50 border-red-200'
                      : weekend
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  } ${todayClass ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  onMouseEnter={() => setHoveredDate(dateStr)}
                  onMouseLeave={() => setHoveredDate(null)}
                  onClick={() => {
                    setSelectedDate(date);
                    setShowAddDialog(true);
                  }}
                >
                  {/* 日期显示 */}
                  <div className="p-2 flex items-start justify-between">
                    <div>
                      {isFirst ? (
                        <span className="text-lg font-bold text-blue-600">{month}月</span>
                      ) : (
                        <span className={`text-sm ${weekend || holidayName ? 'text-red-500' : 'text-gray-700'}`}>
                          {date.getDate()}
                        </span>
                      )}
                    </div>
                    {/* 添加按钮 */}
                    {isHovered && (
                      <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* 节假日名称 */}
                  {holidayName && (
                    <div className="px-2 pb-1">
                      <span className="text-xs text-red-500">{holidayName}</span>
                    </div>
                  )}

                  {/* 日程列表 */}
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
            {/* 客户选择 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">选择客户</label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span className="font-medium text-blue-700">{selectedCustomer.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCustomer(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder="搜索客户名称..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <ScrollArea className="h-[200px] border rounded-lg">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        {searchQuery ? '未找到匹配的客户' : '暂无客户数据'}
                      </div>
                    ) : (
                      <div className="p-1">
                        {filteredCustomers.map(customer => (
                          <button
                            key={customer.id}
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setSearchQuery('');
                            }}
                            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 text-sm"
                          >
                            {customer.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* 备注 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">备注（可选）</label>
              <Input
                placeholder="输入备注信息..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* 按钮 */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => {
                setShowAddDialog(false);
                setSelectedCustomer(null);
                setNotes('');
                setSearchQuery('');
              }}>
                取消
              </Button>
              <Button
                onClick={handleAddSchedule}
                disabled={!selectedCustomer || loading}
              >
                {loading ? '添加中...' : '确认添加'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
