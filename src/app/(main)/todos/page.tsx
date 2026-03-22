'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { format, isToday, isTomorrow, addDays, subDays, startOfDay, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Todo {
  id: string;
  content: string;
  customer_id: string | null;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
}

// 过渡中的待办状态
interface TransitionTodo {
  id: string;
  content: string;
  customer_id: string | null;
  priority: 'high' | 'medium' | 'low';
  phase: 'check' | 'slideOut' | 'slideIn'; // 打勾阶段 | 滑出阶段 | 滑入阶段
}

const PRIORITY_CONFIG = {
  high: { label: '重要', color: 'bg-red-100 text-red-700 border-red-200', order: 3 },
  medium: { label: '次要', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', order: 2 },
  low: { label: '常规', color: 'bg-gray-100 text-gray-600 border-gray-200', order: 1 },
};

// 生成日期列表（前后各30天）
const generateDateList = (centerDate: Date) => {
  const dates: Date[] = [];
  for (let i = -30; i <= 30; i++) {
    dates.push(addDays(centerDate, i));
  }
  return dates;
};

export default function TodosPage() {
  const { session } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCustomerId, setNewCustomerId] = useState<string>('');
  const [newDueDate, setNewDueDate] = useState<Date>(() => {
    const now = new Date();
    const hour = now.getHours();
    const today = startOfDay(now);
    return hour < 17 ? today : addDays(today, 1);
  });
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('low');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(startOfDay(new Date()));
  const [dateList] = useState(() => generateDateList(new Date()));
  
  // 动画状态 - 完成动画
  const [completingTodo, setCompletingTodo] = useState<TransitionTodo | null>(null);
  // 动画状态 - 取消完成动画
  const [uncompletingTodo, setUncompletingTodo] = useState<TransitionTodo | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session?.access_token) {
      fetchTodos();
      fetchCustomers();
    }
  }, [session, currentDate]);

  // 滚动到当前日期
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        const todayElement = scrollRef.current.querySelector('[data-date="today"]');
        if (todayElement) {
          todayElement.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const fetchTodos = async () => {
    if (!session?.access_token) return;
    
    setLoading(true);
    try {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const response = await fetch(`/api/todos?status=all&date=${dateStr}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setTodos(data.data || []);
      }
    } catch (error) {
      console.error('获取待办列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    if (!session?.access_token) return;
    
    try {
      const response = await fetch('/api/customers', {
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
    }
  };

  const handleAddTodo = async () => {
    if (!session?.access_token || !newContent.trim()) return;

    setAdding(true);
    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newContent.trim(),
          customer_id: newCustomerId || null,
          due_date: newDueDate.toISOString(),
          priority: newPriority,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setNewContent('');
        setNewCustomerId('');
        setNewPriority('low');
        const now = new Date();
        const hour = now.getHours();
        const today = startOfDay(now);
        setNewDueDate(hour < 17 ? today : addDays(today, 1));
        fetchTodos();
        inputRef.current?.focus();
      } else {
        alert(data.error || '添加失败');
      }
    } catch (error) {
      console.error('创建待办失败:', error);
      alert('创建待办失败，请重试');
    } finally {
      setAdding(false);
    }
  };

  // 完成待办（带动画）
  const handleCompleteTodo = useCallback(async (todo: Todo) => {
    if (!session?.access_token || completingTodo) return;

    // 开始动画 - 打勾阶段
    setCompletingTodo({
      id: todo.id,
      content: todo.content,
      customer_id: todo.customer_id,
      priority: todo.priority,
      phase: 'check',
    });

    // 200ms 后进入滑出阶段
    setTimeout(() => {
      setCompletingTodo(prev => prev ? { ...prev, phase: 'slideOut' } : null);
    }, 200);

    // 500ms 后更新状态并进入滑入阶段
    setTimeout(async () => {
      try {
        const response = await fetch(`/api/todos/${todo.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ completed: true }),
        });

        if (response.ok) {
          // 更新本地状态
          setTodos(prev => prev.map(t => 
            t.id === todo.id ? { ...t, completed: true } : t
          ));
          // 进入滑入阶段
          setCompletingTodo(prev => prev ? { ...prev, phase: 'slideIn' } : null);
          
          // 300ms 后清除过渡状态
          setTimeout(() => {
            setCompletingTodo(null);
          }, 300);
        }
      } catch (error) {
        console.error('更新待办失败:', error);
        setCompletingTodo(null);
      }
    }, 500);
  }, [session?.access_token, completingTodo]);

  // 取消完成（带动画）
  const handleUncompleteTodo = useCallback(async (todo: Todo) => {
    if (!session?.access_token || uncompletingTodo) return;

    // 开始动画 - 打勾阶段（反向）
    setUncompletingTodo({
      id: todo.id,
      content: todo.content,
      customer_id: todo.customer_id,
      priority: todo.priority,
      phase: 'check',
    });

    // 200ms 后进入滑出阶段（向上滑出）
    setTimeout(() => {
      setUncompletingTodo(prev => prev ? { ...prev, phase: 'slideOut' } : null);
    }, 200);

    // 500ms 后更新状态并进入滑入阶段
    setTimeout(async () => {
      try {
        const response = await fetch(`/api/todos/${todo.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ completed: false }),
        });

        if (response.ok) {
          // 更新本地状态
          setTodos(prev => prev.map(t => 
            t.id === todo.id ? { ...t, completed: false } : t
          ));
          // 进入滑入阶段
          setUncompletingTodo(prev => prev ? { ...prev, phase: 'slideIn' } : null);
          
          // 300ms 后清除过渡状态
          setTimeout(() => {
            setUncompletingTodo(null);
          }, 300);
        }
      } catch (error) {
        console.error('更新待办失败:', error);
        setUncompletingTodo(null);
      }
    }, 500);
  }, [session?.access_token, uncompletingTodo]);

  const handleDelete = async (id: string) => {
    if (!session?.access_token) return;

    try {
      const response = await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        setTodos(prev => prev.filter(t => t.id !== id));
      }
    } catch (error) {
      console.error('删除待办失败:', error);
    }
  };

  const handlePriorityChange = async (todo: Todo, newPriority: 'high' | 'medium' | 'low') => {
    if (!session?.access_token) return;

    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priority: newPriority,
        }),
      });

      if (response.ok) {
        setTodos(prev => prev.map(t => 
          t.id === todo.id ? { ...t, priority: newPriority } : t
        ));
      }
    } catch (error) {
      console.error('更新优先级失败:', error);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedCustomer = customers.find(c => c.id === newCustomerId);

  const formatDateDisplay = (date: Date) => {
    if (isToday(date)) return '今天';
    if (isTomorrow(date)) return '明天';
    return format(date, 'M/d', { locale: zhCN });
  };

  // 分离未完成和已完成的待办（排除正在过渡中的）
  const pendingTodos = todos
    .filter(t => !t.completed && t.id !== completingTodo?.id)
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

  const completedTodos = todos.filter(t => t.completed && t.id !== uncompletingTodo?.id);

  return (
    <div className="h-full flex flex-col p-6">
      {/* 页面标题 */}
      <div className="shrink-0 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">待办清单</h1>
        <p className="text-gray-500 mt-1">管理你的日常待办事项</p>
      </div>

      {/* 日期横向滚轴 */}
      <div className="shrink-0 mb-6">
        <ScrollArea className="w-full whitespace-nowrap">
          <div 
            ref={scrollRef}
            className="flex gap-1 px-4"
          >
            {dateList.map((date) => {
              const isSelected = isSameDay(date, currentDate);
              const isTodayDate = isToday(date);
              return (
                <button
                  key={date.toISOString()}
                  data-date={isTodayDate ? 'today' : undefined}
                  onClick={() => setCurrentDate(startOfDay(date))}
                  className={cn(
                    "flex flex-col items-center justify-center px-4 py-2 rounded-lg transition-all min-w-[60px]",
                    isSelected 
                      ? "bg-blue-500 text-white shadow-md" 
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    isTodayDate && !isSelected && "ring-2 ring-blue-300"
                  )}
                >
                  <span className="text-xs font-medium">
                    {format(date, 'EEE', { locale: zhCN })}
                  </span>
                  <span className="text-lg font-bold">
                    {format(date, 'd')}
                  </span>
                  {isTodayDate && (
                    <span className={cn(
                      "text-xs",
                      isSelected ? "text-blue-100" : "text-blue-500"
                    )}>
                      今天
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* 左右布局：左边待办事项，右边新增待办 */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* 左边：待办事项列表 */}
        <div className="flex-1 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                待办事项
                <Badge variant="secondary" className="font-normal">{pendingTodos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full px-6 pb-6">
                {loading ? (
                  <div className="py-8 text-center text-gray-500">加载中...</div>
                ) : todos.length === 0 && !completingTodo ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>暂无待办事项</EmptyTitle>
                      <EmptyDescription>在右侧添加一个新的待办开始吧</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div ref={listRef} className="space-y-3 pr-4">
                    {/* 未完成待办 */}
                    {pendingTodos.map((todo) => (
                      <div
                        key={todo.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-colors bg-white border-gray-200 hover:border-gray-300"
                        )}
                        style={{ 
                          borderLeftWidth: '4px', 
                          borderLeftStyle: 'solid', 
                          borderLeftColor: todo.priority === 'high' ? '#ef4444' : todo.priority === 'medium' ? '#eab308' : '#9ca3af' 
                        }}
                      >
                        {/* 完成勾选 */}
                        <Checkbox
                          checked={false}
                          onCheckedChange={() => handleCompleteTodo(todo)}
                          className="mt-0.5"
                        />

                        {/* 内容区域 */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{todo.content}</div>
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs">
                              {todo.customer_id ? (customers.find(c => c.id === todo.customer_id)?.name || '未知客户') : '个人事项'}
                            </Badge>
                          </div>
                        </div>

                        {/* 操作区域 */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Select
                            value={todo.priority}
                            onValueChange={(v) => handlePriorityChange(todo, v as 'high' | 'medium' | 'low')}
                          >
                            <SelectTrigger className="w-[80px] h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="high">重要</SelectItem>
                              <SelectItem value="medium">次要</SelectItem>
                              <SelectItem value="low">常规</SelectItem>
                            </SelectContent>
                          </Select>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-red-500"
                            onClick={() => handleDelete(todo.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* 正在完成中的待办（动画） */}
                    {completingTodo && (
                      <div
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border bg-white",
                          completingTodo.phase === 'check' && "animate-check-phase",
                          completingTodo.phase === 'slideOut' && "animate-slide-out-down"
                        )}
                        style={{ 
                          borderLeftWidth: '4px', 
                          borderLeftStyle: 'solid', 
                          borderLeftColor: completingTodo.phase === 'check' 
                            ? (completingTodo.priority === 'high' ? '#ef4444' : completingTodo.priority === 'medium' ? '#eab308' : '#9ca3af')
                            : '#22c55e',
                          backgroundColor: completingTodo.phase === 'check' ? 'inherit' : '#dcfce7'
                        }}
                      >
                        <Checkbox
                          checked={true}
                          className="mt-0.5 animate-checkmark"
                        />
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "font-medium",
                            completingTodo.phase !== 'check' && "line-through text-gray-400"
                          )}>
                            {completingTodo.content}
                          </div>
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs">
                              {completingTodo.customer_id ? (customers.find(c => c.id === completingTodo.customer_id)?.name || '未知客户') : '个人事项'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 已完成待办 */}
                    {completedTodos.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex-1 h-px bg-gray-200"></div>
                          <span className="text-sm text-gray-400">已完成</span>
                          <div className="flex-1 h-px bg-gray-200"></div>
                        </div>

                        {/* 正在滑入的已完成待办 */}
                        {completingTodo?.phase === 'slideIn' && (
                          <div
                            className="flex items-start gap-3 p-3 rounded-lg border bg-green-50 border-green-200 animate-slide-in-from-top"
                            style={{ 
                              borderLeftWidth: '4px', 
                              borderLeftStyle: 'solid', 
                              borderLeftColor: '#22c55e'
                            }}
                          >
                            <Checkbox
                              checked={true}
                              className="mt-0.5 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium line-through text-gray-400">
                                {completingTodo.content}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                                <Badge variant="outline" className="text-xs border-green-200 text-green-600">
                                  {completingTodo.customer_id ? (customers.find(c => c.id === completingTodo.customer_id)?.name || '未知客户') : '个人事项'}
                                </Badge>
                                <Badge variant="outline" className="text-xs border-green-200 text-green-600">
                                  <Check className="h-3 w-3 mr-1" />
                                  已完成
                                </Badge>
                              </div>
                            </div>
                          </div>
                        )}

                        {completedTodos.map((todo) => (
                          <div
                            key={todo.id}
                            className="flex items-start gap-3 p-3 rounded-lg border transition-colors bg-green-50 border-green-200"
                            style={{ 
                              borderLeftWidth: '4px', 
                              borderLeftStyle: 'solid', 
                              borderLeftColor: '#22c55e'
                            }}
                          >
                            <Checkbox
                              checked={true}
                              onCheckedChange={() => handleUncompleteTodo(todo)}
                              className="mt-0.5 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                            />

                            <div className="flex-1 min-w-0">
                              <div className="font-medium line-through text-gray-400">
                                {todo.content}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                                <Badge variant="outline" className="text-xs border-green-200 text-green-600">
                                  {todo.customer_id ? (customers.find(c => c.id === todo.customer_id)?.name || '未知客户') : '个人事项'}
                                </Badge>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-red-500"
                                onClick={() => handleDelete(todo.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* 正在取消完成中的待办（从已完成区域向上滑出） */}
                    {uncompletingTodo && uncompletingTodo.phase === 'slideOut' && (
                      <div
                        className="flex items-start gap-3 p-3 rounded-lg border bg-green-50 border-green-200 animate-slide-out-up"
                        style={{ 
                          borderLeftWidth: '4px', 
                          borderLeftStyle: 'solid', 
                          borderLeftColor: '#9ca3af'
                        }}
                      >
                        <Checkbox
                          checked={false}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            {uncompletingTodo.content}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 正在滑入的未完成待办（取消完成时） */}
                    {uncompletingTodo?.phase === 'slideIn' && (
                      <div
                        className="flex items-start gap-3 p-3 rounded-lg border bg-white border-gray-200 animate-slide-in-from-bottom"
                        style={{ 
                          borderLeftWidth: '4px', 
                          borderLeftStyle: 'solid', 
                          borderLeftColor: uncompletingTodo.priority === 'high' ? '#ef4444' : uncompletingTodo.priority === 'medium' ? '#eab308' : '#9ca3af'
                        }}
                      >
                        <Checkbox
                          checked={false}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            {uncompletingTodo.content}
                          </div>
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs">
                              {uncompletingTodo.customer_id ? (customers.find(c => c.id === uncompletingTodo.customer_id)?.name || '未知客户') : '个人事项'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* 右边：新增待办 */}
        <div className="w-80 shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">新增待办</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    待办内容
                  </label>
                  <Input
                    ref={inputRef}
                    placeholder="输入待办事项..."
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newContent.trim()) {
                        handleAddTodo();
                      }
                    }}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    关联客户
                  </label>
                  <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedCustomer ? (
                          <span className="truncate">{selectedCustomer.name}</span>
                        ) : (
                          <span className="text-gray-400">选择客户（可选）</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="搜索客户..." 
                          value={customerSearch}
                          onValueChange={setCustomerSearch}
                        />
                        <CommandList>
                          <CommandEmpty>未找到客户</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="none"
                              onSelect={() => {
                                setNewCustomerId('');
                                setCustomerPopoverOpen(false);
                              }}
                            >
                              <Check className={cn(
                                "mr-2 h-4 w-4",
                                !newCustomerId ? "opacity-100" : "opacity-0"
                              )} />
                              不关联客户
                            </CommandItem>
                            {filteredCustomers.map((customer) => (
                              <CommandItem
                                key={customer.id}
                                value={customer.name}
                                onSelect={() => {
                                  setNewCustomerId(customer.id);
                                  setCustomerPopoverOpen(false);
                                }}
                              >
                                <Check className={cn(
                                  "mr-2 h-4 w-4",
                                  newCustomerId === customer.id ? "opacity-100" : "opacity-0"
                                )} />
                                {customer.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    截止日期
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatDateDisplay(newDueDate)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={newDueDate}
                        onSelect={(date) => date && setNewDueDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    优先级
                  </label>
                  <Select value={newPriority} onValueChange={(v) => setNewPriority(v as 'high' | 'medium' | 'low')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500"></span>
                          重要
                        </div>
                      </SelectItem>
                      <SelectItem value="medium">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                          次要
                        </div>
                      </SelectItem>
                      <SelectItem value="low">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                          常规
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  className="w-full"
                  onClick={handleAddTodo}
                  disabled={!newContent.trim() || adding}
                >
                  {adding ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span>
                      添加中...
                    </span>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      添加待办
                    </>
                  )}
                </Button>

                <div className="text-xs text-gray-400 text-center">
                  未完成的待办将在第二天自动延期
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CSS 动画样式 */}
      <style jsx global>{`
        /* 打勾阶段动画 */
        @keyframes checkPhase {
          0% {
            background-color: rgb(255 255 255);
          }
          100% {
            background-color: rgb(220 252 231);
          }
        }

        /* 打勾动画 */
        @keyframes checkmark {
          0% {
            transform: scale(0);
          }
          50% {
            transform: scale(1.3);
          }
          100% {
            transform: scale(1);
          }
        }

        /* 向下滑出动画 */
        @keyframes slideOutDown {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(60px) scale(0.95);
          }
        }

        /* 从上方滑入动画 */
        @keyframes slideInFromTop {
          0% {
            opacity: 0;
            transform: translateY(-60px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* 向上滑出动画 */
        @keyframes slideOutUp {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-60px) scale(0.95);
          }
        }

        /* 从下方滑入动画 */
        @keyframes slideInFromBottom {
          0% {
            opacity: 0;
            transform: translateY(60px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .animate-check-phase {
          animation: checkPhase 0.2s ease-out forwards;
        }

        .animate-checkmark {
          animation: checkmark 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .animate-slide-out-down {
          animation: slideOutDown 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .animate-slide-in-from-top {
          animation: slideInFromTop 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .animate-slide-out-up {
          animation: slideOutUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .animate-slide-in-from-bottom {
          animation: slideInFromBottom 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>
    </div>
  );
}
