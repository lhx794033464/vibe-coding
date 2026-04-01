'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  Check,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { format, isToday, isTomorrow, addDays, subDays, startOfDay, parseISO } from 'date-fns';
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

const PRIORITY_COLORS = {
  high: 'bg-rose-500',
  medium: 'bg-amber-400',
  low: 'bg-slate-300',
};

const PRIORITY_LABELS = {
  high: '重要',
  medium: '次要',
  low: '常规',
};

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  
  // 新增待办状态
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
  const [dueDatePopoverOpen, setDueDatePopoverOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  // 当前选中日期
  const [currentDate, setCurrentDate] = useState(startOfDay(new Date()));
  
  // 编辑状态
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editPriority, setEditPriority] = useState<'high' | 'medium' | 'low'>('low');
  const [editCustomerPopoverOpen, setEditCustomerPopoverOpen] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTodos();
    fetchCustomers();
  }, [currentDate]);

  const fetchTodos = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/todos?status=all`);
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
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      if (response.ok) {
        setCustomers(data.data || []);
      }
    } catch (error) {
      console.error('获取客户列表失败:', error);
    }
  };

  const handleAddTodo = async () => {
    if (!newContent.trim()) return;

    setAdding(true);
    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleCompleteTodo = useCallback(async (todo: Todo) => {
    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });

      if (response.ok) {
        setTodos(prev => prev.map(t => 
          t.id === todo.id ? { ...t, completed: true, completed_at: new Date().toISOString() } : t
        ));
      }
    } catch (error) {
      console.error('更新待办失败:', error);
    }
  }, []);

  const handleUncompleteTodo = useCallback(async (todo: Todo) => {
    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false }),
      });

      if (response.ok) {
        setTodos(prev => prev.map(t => 
          t.id === todo.id ? { ...t, completed: false, completed_at: null } : t
        ));
      }
    } catch (error) {
      console.error('更新待办失败:', error);
    }
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setTodos(prev => prev.filter(t => t.id !== id));
      }
    } catch (error) {
      console.error('删除待办失败:', error);
    }
  };

  const handlePriorityChange = async (todo: Todo, newPriority: 'high' | 'medium' | 'low') => {
    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority }),
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

  const handleStartEdit = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditContent(todo.content);
    setEditCustomerId(todo.customer_id || '');
    setEditPriority(todo.priority);
  };

  const handleCancelEdit = () => {
    setEditingTodoId(null);
    setEditContent('');
    setEditCustomerId('');
    setEditPriority('low');
  };

  const handleSaveEdit = async (todoId: string) => {
    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editContent.trim(),
          customer_id: editCustomerId || null,
          priority: editPriority,
        }),
      });

      if (response.ok) {
        setTodos(prev => prev.map(t => 
          t.id === todoId ? { 
            ...t, 
            content: editContent.trim(), 
            customer_id: editCustomerId || null,
            priority: editPriority 
          } : t
        ));
        handleCancelEdit();
      }
    } catch (error) {
      console.error('更新待办失败:', error);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedCustomer = customers.find(c => c.id === newCustomerId);
  const editSelectedCustomer = customers.find(c => c.id === editCustomerId);

  const formatDateDisplay = (date: Date) => {
    if (isToday(date)) return '今天';
    if (isTomorrow(date)) return '明天';
    return format(date, 'M/d', { locale: zhCN });
  };

  // 分离未完成和已完成的待办
  const pendingTodos = todos
    .filter(t => !t.completed)
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

  const completedTodos = todos.filter(t => t.completed);
  
  // 计算完成进度
  const totalTodos = todos.length;
  const completedCount = completedTodos.length;
  const progress = totalTodos > 0 ? Math.round((completedCount / totalTodos) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 p-4 lg:p-8">
      {/* 页面头部 - 极简设计 */}
      <div className="max-w-3xl mx-auto w-full mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light text-slate-800 tracking-tight">待办清单</h1>
            <p className="text-slate-400 mt-1 text-sm">
              {isToday(currentDate) ? '今天' : format(currentDate, 'M月d日', { locale: zhCN })} · {pendingTodos.length} 个待办
            </p>
          </div>
          {/* 进度环 */}
          {totalTodos > 0 && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-light text-slate-700">{progress}%</div>
                <div className="text-xs text-slate-400">已完成</div>
              </div>
              <div className="relative w-12 h-12">
                <svg className="w-12 h-12 transform -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-slate-200"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - progress / 100)}`}
                    className="text-emerald-500 transition-all duration-500 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col min-h-0">
        {/* 日期导航 */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={() => setCurrentDate(subDays(currentDate, 1))}
            className="p-2 rounded-full hover:bg-white hover:shadow-sm transition-all text-slate-400 hover:text-slate-600"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm">
            <CalendarIcon className="h-4 w-4 text-slate-400" />
            <span className="text-slate-700 font-medium min-w-[80px] text-center">
              {isToday(currentDate) ? '今天' : format(currentDate, 'M月d日', { locale: zhCN })}
            </span>
          </div>
          <button
            onClick={() => setCurrentDate(addDays(currentDate, 1))}
            className="p-2 rounded-full hover:bg-white hover:shadow-sm transition-all text-slate-400 hover:text-slate-600"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* 新增待办输入区 - 极简设计 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-slate-200 flex items-center justify-center">
              <Plus className="h-3 w-3 text-slate-300" />
            </div>
            <input
              ref={inputRef}
              type="text"
              placeholder="添加新的待办事项..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newContent.trim()) {
                  handleAddTodo();
                }
              }}
              className="flex-1 bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400"
            />
            {newContent.trim() && (
              <button
                onClick={handleAddTodo}
                disabled={adding}
                className="px-4 py-1.5 bg-slate-800 text-white text-sm rounded-full hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                添加
              </button>
            )}
          </div>
          
          {/* 选项行 */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-50">
            {/* 客户选择 */}
            <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                  <span className={selectedCustomer ? 'text-slate-700' : ''}>
                    {selectedCustomer ? selectedCustomer.name : '关联客户'}
                  </span>
                  <ChevronsUpDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="搜索客户..." />
                  <CommandList>
                    <CommandEmpty>未找到客户</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setNewCustomerId('');
                          setCustomerPopoverOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", !newCustomerId ? "opacity-100" : "opacity-0")} />
                        不关联
                      </CommandItem>
                      {customers.map((customer) => (
                        <CommandItem
                          key={customer.id}
                          onSelect={() => {
                            setNewCustomerId(customer.id);
                            setCustomerPopoverOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", newCustomerId === customer.id ? "opacity-100" : "opacity-0")} />
                          {customer.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* 日期选择 */}
            <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                  <CalendarIcon className="h-3 w-3" />
                  {formatDateDisplay(newDueDate)}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newDueDate}
                  onSelect={(date: Date | undefined) => {
                    if (date) {
                      setNewDueDate(date);
                      setDueDatePopoverOpen(false);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>

            {/* 优先级选择 */}
            <Select value={newPriority} onValueChange={(v) => setNewPriority(v as 'high' | 'medium' | 'low')}>
              <SelectTrigger className="h-auto w-auto border-none p-0 text-xs text-slate-500 hover:text-slate-700">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[newPriority]}`} />
                  {PRIORITY_LABELS[newPriority]}
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    重要
                  </div>
                </SelectItem>
                <SelectItem value="medium">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    次要
                  </div>
                </SelectItem>
                <SelectItem value="low">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    常规
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 待办列表 */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-slate-400 mx-auto mb-3" />
              加载中...
            </div>
          ) : todos.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无待办事项</EmptyTitle>
                <EmptyDescription>在上方添加一个新的待办开始吧</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2 pb-20">
              {/* 未完成待办 */}
              {pendingTodos.map((todo) => {
                const isEditing = editingTodoId === todo.id;
                
                return (
                  <div
                    key={todo.id}
                    className={cn(
                      "group bg-white rounded-xl p-4 transition-all duration-200",
                      "hover:shadow-md border border-transparent hover:border-slate-100"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* 复选框 */}
                      <button
                        onClick={() => handleCompleteTodo(todo)}
                        className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-300 hover:border-emerald-400 flex items-center justify-center transition-colors group/check"
                      >
                        <Check className="h-3 w-3 text-emerald-500 opacity-0 group-hover/check:opacity-100 transition-opacity" />
                      </button>

                      {/* 内容 */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="h-8"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <Popover open={editCustomerPopoverOpen} onOpenChange={setEditCustomerPopoverOpen}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-xs">
                                    {editSelectedCustomer?.name || '关联客户'}
                                    <ChevronsUpDown className="ml-1 h-3 w-3" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0">
                                  <Command>
                                    <CommandInput placeholder="搜索客户..." />
                                    <CommandList>
                                      <CommandEmpty>未找到客户</CommandEmpty>
                                      <CommandGroup>
                                        <CommandItem onSelect={() => { setEditCustomerId(''); setEditCustomerPopoverOpen(false); }}>
                                          不关联
                                        </CommandItem>
                                        {customers.map((c) => (
                                          <CommandItem
                                            key={c.id}
                                            onSelect={() => { setEditCustomerId(c.id); setEditCustomerPopoverOpen(false); }}
                                          >
                                            {c.name}
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              <Select value={editPriority} onValueChange={(v) => setEditPriority(v as 'high' | 'medium' | 'low')}>
                                <SelectTrigger className="w-[80px] h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="high">重要</SelectItem>
                                  <SelectItem value="medium">次要</SelectItem>
                                  <SelectItem value="low">常规</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-slate-700">{todo.content}</div>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[todo.priority]}`} />
                              <span className="text-xs text-slate-400">
                                {todo.customer_id ? (customers.find(c => c.id === todo.customer_id)?.name || '未知客户') : '个人事项'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* 操作 */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-emerald-500"
                              onClick={() => handleSaveEdit(todo.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-slate-600"
                              onClick={() => handleStartEdit(todo)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-rose-500"
                              onClick={() => handleDelete(todo.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 已完成分隔线 */}
              {completedTodos.length > 0 && (
                <div className="pt-6 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-xs text-slate-400">已完成 {completedTodos.length}</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                </div>
              )}

              {/* 已完成待办 */}
              {completedTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="group bg-slate-50 rounded-xl p-4 opacity-60 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleUncompleteTodo(todo)}
                      className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"
                    >
                      <Check className="h-3 w-3 text-white" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-500 line-through">{todo.content}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {todo.customer_id ? (customers.find(c => c.id === todo.customer_id)?.name || '未知客户') : '个人事项'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(todo.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 移动端悬浮添加按钮 */}
      <button
        onClick={() => setShowAddDialog(true)}
        className="lg:hidden fixed bottom-20 right-4 w-14 h-14 bg-slate-800 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-700 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* 移动端添加弹窗 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增待办</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="输入待办事项..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    {selectedCustomer?.name || '关联客户'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                  <Command>
                    <CommandInput placeholder="搜索客户..." />
                    <CommandList>
                      {customers.map((c) => (
                        <CommandItem key={c.id} onSelect={() => setNewCustomerId(c.id)}>
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Select value={newPriority} onValueChange={(v) => setNewPriority(v as 'high' | 'medium' | 'low')}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">重要</SelectItem>
                  <SelectItem value="medium">次要</SelectItem>
                  <SelectItem value="low">常规</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              className="w-full" 
              onClick={() => {
                handleAddTodo();
                if (newContent.trim()) setShowAddDialog(false);
              }}
              disabled={!newContent.trim() || adding}
            >
              添加待办
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
