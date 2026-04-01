'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  GripVertical,
} from 'lucide-react';
import { format, isToday, isTomorrow, addDays, subDays, startOfDay } from 'date-fns';
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

// 随机占位符，来自 twidge 的设计
const PLACEHOLDERS = [
  '给客户打电话确认需求',
  '准备明天的演示文稿',
  '跟进上周的报价单',
  '整理会议纪要',
  '预约客户拜访时间',
];

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
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [dueDatePopoverOpen, setDueDatePopoverOpen] = useState(false);
  
  // 当前选中日期
  const [currentDate, setCurrentDate] = useState(startOfDay(new Date()));
  
  // 编辑状态
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editPriority, setEditPriority] = useState<'high' | 'medium' | 'low'>('low');
  
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 随机占位符
  const [placeholder] = useState(() => 
    PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
  );

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
  
  const numberOfPendingTasks = pendingTodos.length;
  const numberOfCompletedTasks = completedTodos.length;
  const noTasks = numberOfPendingTasks === 0;
  const multipleTasks = numberOfPendingTasks > 1;

  // 键盘导航
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    isNewTodo: boolean = false
  ) => {
    const inputs = document.querySelectorAll('input[type="text"]');
    const currentIndex = Array.from(inputs).indexOf(event.currentTarget);
    const lastIndex = inputs.length - 1;
    const firstIndex = 0;

    // Ctrl/Cmd + Enter 完成
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !isNewTodo) {
      event.preventDefault();
      const todo = pendingTodos[index];
      if (todo) handleCompleteTodo(todo);
      return;
    }

    // 上下箭头导航
    if (event.key === 'ArrowUp' && !event.altKey) {
      event.preventDefault();
      const prevIndex = currentIndex === firstIndex ? lastIndex : currentIndex - 1;
      (inputs[prevIndex] as HTMLInputElement)?.focus();
      return;
    }

    if (event.key === 'ArrowDown' && !event.altKey) {
      event.preventDefault();
      const nextIndex = currentIndex === lastIndex ? firstIndex : currentIndex + 1;
      (inputs[nextIndex] as HTMLInputElement)?.focus();
      return;
    }

    // Enter 新建或移动
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      if (isNewTodo && newContent.trim()) {
        handleAddTodo();
      } else if (!isNewTodo) {
        event.preventDefault();
        const nextIndex = currentIndex === lastIndex ? firstIndex : currentIndex + 1;
        (inputs[nextIndex] as HTMLInputElement)?.focus();
      }
      return;
    }
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-black flex flex-col items-center py-8 px-4">
      {/* 头部标题 */}
      <div className="flex flex-col items-center gap-2 mb-6 text-center">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(subDays(currentDate, 1))}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-500" />
          </button>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isToday(currentDate) ? '今天' : format(currentDate, 'M月d日', { locale: zhCN })}
          </p>
          <button
            onClick={() => setCurrentDate(addDays(currentDate, 1))}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <p className="text-2xl text-black dark:text-white font-normal">
          {noTasks ? '今天想做些什么？' : '待办事项'}
        </p>
      </div>

      {/* 新增待办输入 - twidge 风格 */}
      <div className="w-full max-w-md mb-4">
        <div className="relative flex group">
          <input
            ref={inputRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={`${placeholder}`}
            autoFocus
            autoComplete="off"
            spellCheck="false"
            onKeyDown={(e) => handleKeyDown(e, 0, true)}
            className="flex-1 bg-white dark:bg-zinc-900 border-2 border-black dark:border-white rounded-l-2xl rounded-r-none px-4 py-3 text-black dark:text-white placeholder:text-gray-400 outline-none transition-all"
          />
          <button
            onClick={handleAddTodo}
            disabled={!newContent.trim() || adding}
            className="bg-sky-300 dark:bg-cyan-800 dark:text-white border-2 border-l-0 border-black dark:border-white rounded-r-2xl px-4 py-3 font-medium hover:bg-sky-400 dark:hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        
        {/* 选项行 - 关联客户、日期、优先级 */}
        <div className="flex items-center gap-3 mt-2 px-1">
          <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors">
                <span className={selectedCustomer ? 'font-medium text-black dark:text-white' : ''}>
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
                    <CommandItem onSelect={() => { setNewCustomerId(''); setCustomerPopoverOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", !newCustomerId ? "opacity-100" : "opacity-0")} />
                      不关联
                    </CommandItem>
                    {customers.map((customer) => (
                      <CommandItem
                        key={customer.id}
                        onSelect={() => { setNewCustomerId(customer.id); setCustomerPopoverOpen(false); }}
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

          <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors">
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

          <button
            onClick={() => setNewPriority(newPriority === 'high' ? 'low' : newPriority === 'medium' ? 'high' : 'medium')}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[newPriority]}`} />
            {newPriority === 'high' ? '重要' : newPriority === 'medium' ? '次要' : '常规'}
          </button>
        </div>
      </div>

      {/* 待办列表 - twidge 风格 */}
      <div className="w-full max-w-md">
        {loading ? (
          <div className="py-12 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-black mx-auto" />
          </div>
        ) : (
          <ul className="rounded-2xl border-2 border-black dark:border-white overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
            {/* 未完成待办 */}
            {pendingTodos.map((todo, index) => {
              const isEditing = editingTodoId === todo.id;
              const isFirst = index === 0;
              const isLast = index === pendingTodos.length - 1;
              
              return (
                <li
                  key={todo.id}
                  className={cn(
                    "relative flex group bg-white dark:bg-zinc-900",
                    !isLast && "border-b-2 border-black dark:border-white"
                  )}
                >
                  {isEditing ? (
                    <div className="flex-1 flex flex-col p-3 gap-2">
                      <Input
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="border-2 border-black dark:border-white"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs border-2 border-black dark:border-white">
                              {editSelectedCustomer?.name || '关联客户'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0">
                            <Command>
                              <CommandInput placeholder="搜索客户..." />
                              <CommandList>
                                <CommandGroup>
                                  <CommandItem onSelect={() => setEditCustomerId('')}>
                                    不关联
                                  </CommandItem>
                                  {customers.map((c) => (
                                    <CommandItem key={c.id} onSelect={() => setEditCustomerId(c.id)}>
                                      {c.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <Button size="sm" className="h-7 bg-sky-300 hover:bg-sky-400 text-black border-2 border-black" onClick={() => handleSaveEdit(todo.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={handleCancelEdit}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        value={todo.content}
                        readOnly
                        onClick={() => handleStartEdit(todo)}
                        className={cn(
                          "flex-1 bg-transparent px-4 py-3 text-black dark:text-white outline-none cursor-pointer",
                          isFirst && "rounded-tl-2xl",
                          isLast && pendingTodos.length > 0 && "rounded-bl-2xl"
                        )}
                      />
                      
                      {/* 客户标签 */}
                      {todo.customer_id && (
                        <div className="flex items-center pr-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded">
                            {customers.find(c => c.id === todo.customer_id)?.name}
                          </span>
                        </div>
                      )}
                      
                      {/* 优先级点 */}
                      <div className="flex items-center px-2">
                        <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[todo.priority]}`} />
                      </div>

                      {/* 编辑按钮 */}
                      <button
                        onClick={() => handleStartEdit(todo)}
                        className="hidden lg:group-hover:flex items-center justify-center px-3 text-gray-400 hover:text-black dark:hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>

                      {/* Done 按钮 - twidge 风格 */}
                      <button
                        onClick={() => handleCompleteTodo(todo)}
                        className={cn(
                          "hidden lg:group-hover:flex items-center justify-center bg-sky-300 dark:bg-cyan-800 dark:text-white border-l-2 border-black dark:border-white px-4 py-3 font-medium text-black hover:bg-sky-400 dark:hover:bg-cyan-700 transition-transform active:scale-95",
                          isFirst && "rounded-tr-2xl",
                          isLast && "rounded-br-2xl"
                        )}
                      >
                        完成
                      </button>
                      
                      {/* 移动端操作 */}
                      <div className="flex lg:hidden items-center gap-1 px-2">
                        <button onClick={() => handleStartEdit(todo)} className="p-2 text-gray-400">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleCompleteTodo(todo)}
                          className="p-2 bg-sky-300 rounded text-black"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* 已完成分隔 */}
        {numberOfCompletedTasks > 0 && (
          <div className="mt-6 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-0.5 bg-gray-300 dark:bg-zinc-700" />
              <span className="text-sm text-gray-400 dark:text-gray-500">
                已完成 {numberOfCompletedTasks}
              </span>
              <div className="flex-1 h-0.5 bg-gray-300 dark:bg-zinc-700" />
            </div>
          </div>
        )}

        {/* 已完成列表 */}
        {numberOfCompletedTasks > 0 && (
          <ul className="rounded-2xl border-2 border-gray-300 dark:border-zinc-700 overflow-hidden opacity-60">
            {completedTodos.map((todo, index) => {
              const isFirst = index === 0;
              const isLast = index === completedTodos.length - 1;
              
              return (
                <li
                  key={todo.id}
                  className={cn(
                    "relative flex group bg-gray-50 dark:bg-zinc-900",
                    !isLast && "border-b-2 border-gray-300 dark:border-zinc-700"
                  )}
                >
                  <button
                    onClick={() => handleUncompleteTodo(todo)}
                    className={cn(
                      "flex items-center justify-center bg-emerald-400 dark:bg-emerald-700 border-r-2 border-gray-300 dark:border-zinc-700 px-3",
                      isFirst && "rounded-tl-2xl",
                      isLast && "rounded-bl-2xl"
                    )}
                  >
                    <Check className="h-4 w-4 text-white" />
                  </button>
                  
                  <input
                    value={todo.content}
                    readOnly
                    className={cn(
                      "flex-1 bg-transparent px-4 py-3 text-gray-500 line-through outline-none",
                      isFirst && "rounded-tr-2xl",
                      isLast && "rounded-br-2xl"
                    )}
                  />
                  
                  {todo.customer_id && (
                    <div className="flex items-center pr-2">
                      <span className="text-xs text-gray-400 bg-gray-200 dark:bg-zinc-800 px-2 py-1 rounded">
                        {customers.find(c => c.id === todo.customer_id)?.name}
                      </span>
                    </div>
                  )}
                  
                  <button
                    onClick={() => handleDelete(todo.id)}
                    className="hidden group-hover:flex items-center justify-center px-3 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* 提示信息 */}
        {multipleTasks && (
          <div className="flex items-center gap-2 mt-4 text-gray-400 dark:text-gray-500 text-sm justify-center">
            <span className="text-xs">Ctrl/Cmd + Enter 完成 · ↑↓ 导航</span>
          </div>
        )}
      </div>
    </div>
  );
}
