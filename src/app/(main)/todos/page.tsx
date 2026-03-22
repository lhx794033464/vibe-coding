'use client';

import { useState, useEffect, useRef } from 'react';
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
import { 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  Search,
  Check,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, isToday, isTomorrow, isYesterday, addDays, subDays, startOfDay } from 'date-fns';
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
  customers: { name: string } | null;
}

interface Customer {
  id: string;
  name: string;
}

const PRIORITY_CONFIG = {
  high: { label: '重要', color: 'bg-red-100 text-red-700 border-red-200', order: 3 },
  medium: { label: '次要', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', order: 2 },
  low: { label: '常规', color: 'bg-gray-100 text-gray-600 border-gray-200', order: 1 },
};

export default function TodosPage() {
  const { session } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
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
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session?.access_token) {
      fetchTodos();
      fetchCustomers();
    }
  }, [session, currentDate]);

  const fetchTodos = async () => {
    if (!session?.access_token) return;
    
    setLoading(true);
    try {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const response = await fetch(`/api/todos?status=pending&date=${dateStr}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        // 按优先级排序
        const sorted = (data.data || []).sort((a: Todo, b: Todo) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        setTodos(sorted);
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
        // 重置日期为默认值
        const now = new Date();
        const hour = now.getHours();
        const today = startOfDay(now);
        setNewDueDate(hour < 17 ? today : addDays(today, 1));
        fetchTodos();
        inputRef.current?.focus();
      }
    } catch (error) {
      console.error('创建待办失败:', error);
    }
  };

  const handleToggleComplete = async (todo: Todo) => {
    if (!session?.access_token) return;

    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          completed: !todo.completed,
        }),
      });

      if (response.ok) {
        fetchTodos();
      }
    } catch (error) {
      console.error('更新待办失败:', error);
    }
  };

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
        fetchTodos();
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
        fetchTodos();
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
    if (isYesterday(date)) return '昨天';
    return format(date, 'M月d日', { locale: zhCN });
  };

  const handlePrevDay = () => {
    setCurrentDate(subDays(currentDate, 1));
  };

  const handleNextDay = () => {
    setCurrentDate(addDays(currentDate, 1));
  };

  return (
    <div className="h-full p-6 overflow-auto">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">待办清单</h1>
        <p className="text-gray-500 mt-1">管理你的日常待办事项</p>
      </div>

      {/* 日期导航 */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={handlePrevDay}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center min-w-[120px]">
          <div className="text-lg font-semibold">
            {isToday(currentDate) ? '今天' : format(currentDate, 'M月d日', { locale: zhCN })}
          </div>
          <div className="text-sm text-gray-500">{format(currentDate, 'EEEE', { locale: zhCN })}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleNextDay}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        {!isToday(currentDate) && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentDate(startOfDay(new Date()))}
            className="ml-2"
          >
            回到今天
          </Button>
        )}
      </div>

      {/* 新增待办 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">新增待办</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* 待办内容 */}
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

            {/* 选项行 */}
            <div className="flex flex-wrap gap-3">
              {/* 客户选择 */}
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[180px] justify-between">
                    {selectedCustomer ? (
                      <span className="truncate">{selectedCustomer.name}</span>
                    ) : (
                      <span className="text-gray-400">选择客户（可选）</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
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

              {/* 日期选择 */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[140px] justify-start">
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

              {/* 优先级选择 */}
              <Select value={newPriority} onValueChange={(v) => setNewPriority(v as 'high' | 'medium' | 'low')}>
                <SelectTrigger className="w-[100px]" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">
                    <span className="text-red-600">重要</span>
                  </SelectItem>
                  <SelectItem value="medium">
                    <span className="text-yellow-600">次要</span>
                  </SelectItem>
                  <SelectItem value="low">
                    <span className="text-gray-500">常规</span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* 添加按钮 */}
              <Button 
                size="sm" 
                onClick={handleAddTodo}
                disabled={!newContent.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                添加
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 待办列表 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            待办事项
            <Badge variant="secondary" className="font-normal">{todos.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-gray-500">加载中...</div>
          ) : todos.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无待办事项</EmptyTitle>
                <EmptyDescription>添加一个新的待办开始吧</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-all",
                    todo.completed ? "bg-gray-50 border-gray-200" : "bg-white border-gray-200 hover:border-gray-300",
                    PRIORITY_CONFIG[todo.priority].color.replace('text-', 'border-l-4 border-l-')
                  )}
                  style={{ borderLeftWidth: '4px', borderLeftStyle: 'solid' }}
                >
                  {/* 完成勾选 */}
                  <Checkbox
                    checked={todo.completed}
                    onCheckedChange={() => handleToggleComplete(todo)}
                    className="mt-0.5"
                  />

                  {/* 内容区域 */}
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "font-medium",
                      todo.completed && "line-through text-gray-400"
                    )}>
                      {todo.content}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      {todo.customers && (
                        <Badge variant="outline" className="text-xs">
                          {todo.customers.name}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {PRIORITY_CONFIG[todo.priority].label}
                      </Badge>
                    </div>
                  </div>

                  {/* 操作区域 */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* 优先级快捷调整 */}
                    <Select
                      value={todo.priority}
                      onValueChange={(v) => handlePriorityChange(todo, v as 'high' | 'medium' | 'low')}
                    >
                      <SelectTrigger className="w-[70px] h-7 text-xs" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">重要</SelectItem>
                        <SelectItem value="medium">次要</SelectItem>
                        <SelectItem value="low">常规</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* 删除按钮 */}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* 提示信息 */}
      <div className="mt-4 text-sm text-gray-400 text-center">
        未完成的待办将在第二天自动延期
      </div>
    </div>
  );
}
