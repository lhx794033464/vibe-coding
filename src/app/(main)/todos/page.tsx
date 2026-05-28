'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Check, Clock, Search, ChevronDown, ChevronRight, Calendar, Link2, Trash2, AlertCircle, Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
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
import { useAuth } from '@/contexts/AuthContext';

interface Customer {
  id: string;
  name: string;
}

interface Todo {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  priority: string;
  customer_id: string | null;
  customer_name?: string;
  created_at: string;
}

type FilterType = 'all' | 'pending' | 'completed' | 'overdue';

export default function TodosPage() {
  const { getAuthHeader } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDelayDialog, setShowDelayDialog] = useState(false);
  const [delayTodoId, setDelayTodoId] = useState<string | null>(null);
  const [delayDays, setDelayDays] = useState(1);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [creating, setCreating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [todosRes, customersRes] = await Promise.all([
        fetch('/api/todos', { headers: { ...getAuthHeader() } }),
        fetch('/api/customers', { headers: { ...getAuthHeader() } }),
      ]);
      const todosData = await todosRes.json();
      const customersData = await customersRes.json();
      setTodos(todosData.data || []);
      setCustomers(customersData.customers || []);
    } catch (error) {
      console.error('加载待办失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isOverdue = (todo: Todo) => {
    if (todo.completed || !todo.due_date) return false;
    return new Date(todo.due_date) < new Date();
  };

  const filteredTodos = useMemo(() => {
    let result = todos;
    switch (filter) {
      case 'pending':
        result = todos.filter(t => !t.completed);
        break;
      case 'completed':
        result = todos.filter(t => t.completed);
        break;
      case 'overdue':
        result = todos.filter(t => isOverdue(t));
        break;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
      const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [todos, filter, searchQuery]);

  const stats = useMemo(() => ({
    total: todos.length,
    pending: todos.filter(t => !t.completed).length,
    completed: todos.filter(t => t.completed).length,
    overdue: todos.filter(t => isOverdue(t)).length,
  }), [todos]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          due_date: newDueDate || null,
          priority: newPriority,
          customer_id: newCustomerId || null,
        }),
      });
      if (!res.ok) throw new Error('创建失败');
      setShowCreateDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('创建待办失败:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleComplete = async (todo: Todo) => {
    try {
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ completed: !todo.completed }),
      });
      loadData();
    } catch (error) {
      console.error('更新待办失败:', error);
    }
  };

  const handleDelay = async () => {
    if (!delayTodoId || delayDays < 1) return;
    try {
      await fetch(`/api/todos/${delayTodoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ delay_days: delayDays }),
      });
      setShowDelayDialog(false);
      setDelayTodoId(null);
      setDelayDays(1);
      loadData();
    } catch (error) {
      console.error('延期失败:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除此待办？')) return;
    try {
      await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      loadData();
    } catch (error) {
      console.error('删除待办失败:', error);
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewDueDate('');
    setNewPriority('medium');
    setNewCustomerId('');
  };

  const selectedCustomer = customers.find(c => c.id === newCustomerId);

  const priorityConfig = {
    high: { label: '高', color: 'bg-destructive text-destructive-foreground' },
    medium: { label: '中', color: 'bg-yellow-500 text-white' },
    low: { label: '低', color: 'bg-muted text-muted-foreground' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">待办事项</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-1" /> 新增待办
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '全部', value: stats.total, key: 'all' as FilterType },
          { label: '待处理', value: stats.pending, key: 'pending' as FilterType },
          { label: '已完成', value: stats.completed, key: 'completed' as FilterType },
          { label: '已逾期', value: stats.overdue, key: 'overdue' as FilterType },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={cn(
              'rounded-lg border p-4 text-left transition-colors',
              filter === s.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            )}
          >
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className={cn('text-2xl font-bold', s.key === 'overdue' && stats.overdue > 0 && 'text-destructive')}>
              {s.value}
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索待办标题、描述、关联客户..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Todo List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTodos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {filter === 'all' ? '暂无待办事项' : `暂无${filter === 'pending' ? '待处理' : filter === 'completed' ? '已完成' : '已逾期'}的待办`}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTodos.map(todo => (
            <div
              key={todo.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 transition-colors',
                todo.completed ? 'bg-muted/30 opacity-60' : 'bg-card',
                isOverdue(todo) && 'border-destructive/50 bg-destructive/5'
              )}
            >
              {/* Checkbox */}
              <button
                onClick={() => handleToggleComplete(todo)}
                className={cn(
                  'mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                  todo.completed
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/30 hover:border-primary'
                )}
              >
                {todo.completed && <Check className="w-3 h-3" />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('font-medium', todo.completed && 'line-through text-muted-foreground')}>
                    {todo.title}
                  </span>
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded',
                    priorityConfig[todo.priority as keyof typeof priorityConfig]?.color || priorityConfig.medium.color
                  )}>
                    {priorityConfig[todo.priority as keyof typeof priorityConfig]?.label || '中'}
                  </span>
                </div>
                {todo.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{todo.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {todo.due_date && (
                    <span className={cn('flex items-center gap-1', isOverdue(todo) && 'text-destructive font-medium')}>
                      <Calendar className="w-3 h-3" />
                      {new Date(todo.due_date).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                  {todo.customer_name && (
                    <span className="flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      {todo.customer_name}
                    </span>
                  )}
                  {todo.completed_at && (
                    <span>完成于 {new Date(todo.completed_at).toLocaleDateString('zh-CN')}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              {!todo.completed && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {todo.due_date && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDelayTodoId(todo.id);
                        setShowDelayDialog(true);
                      }}
                      title="延期"
                    >
                      <Clock className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(todo.id)}
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {todo.completed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(todo.id)}
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增待办</DialogTitle>
            <DialogDescription>登记新的待办事项</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>标题 *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="待办事项标题" />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="详细说明（可选）" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>截止日期</Label>
                <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
              </div>
              <div>
                <Label>优先级</Label>
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
            </div>
            <div>
              <Label>关联客户</Label>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {selectedCustomer ? selectedCustomer.name : '选择客户（可选）'}
                    <ChevronDown className="w-4 h-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[300px]" align="start">
                  <Command>
                    <CommandInput placeholder="搜索客户..." />
                    <CommandList>
                      <CommandEmpty>未找到客户</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => { setNewCustomerId(''); setCustomerPopoverOpen(false); }}
                        >
                          不关联客户
                        </CommandItem>
                        {customers.map(c => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => { setNewCustomerId(c.id); setCustomerPopoverOpen(false); }}
                          >
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || creating}>
              {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delay Dialog */}
      <Dialog open={showDelayDialog} onOpenChange={setShowDelayDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>延期待办</DialogTitle>
            <DialogDescription>将截止日期向后推迟</DialogDescription>
          </DialogHeader>
          <div>
            <Label>延期天数</Label>
            <Input
              type="number"
              min={1}
              value={delayDays}
              onChange={e => setDelayDays(parseInt(e.target.value) || 1)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelayDialog(false)}>取消</Button>
            <Button onClick={handleDelay}>确认延期</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
