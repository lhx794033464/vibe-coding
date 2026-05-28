'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Check, Clock, Search, ChevronDown, Calendar, Link2, Trash2, Loader2 } from 'lucide-react';
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

export default function TodosPage() {
  const { getAuthHeader } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
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

  const pendingTodos = useMemo(() => {
    let result = todos.filter(t => !t.completed);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
      const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [todos, searchQuery]);

  const completedTodos = useMemo(() => {
    let result = todos.filter(t => t.completed);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => {
      const dateA = a.completed_at ? new Date(a.completed_at).getTime() : new Date(a.created_at).getTime();
      const dateB = b.completed_at ? new Date(b.completed_at).getTime() : new Date(b.created_at).getTime();
      return dateB - dateA;
    });
  }, [todos, searchQuery]);

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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Group completed todos by date
  const completedGroupedByDate = useMemo(() => {
    const groups: { date: string; label: string; items: Todo[] }[] = [];
    const groupMap = new Map<string, Todo[]>();

    completedTodos.forEach(todo => {
      const dateStr = todo.completed_at || todo.created_at;
      const dateKey = new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, []);
      }
      groupMap.get(dateKey)!.push(todo);
    });

    groupMap.forEach((items, label) => {
      const dateStr = items[0].completed_at || items[0].created_at;
      groups.push({ date: dateStr, label, items });
    });

    return groups;
  }, [completedTodos]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">待办事项</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-1" /> 新增待办
        </Button>
      </div>

      {/* Search */}
      <div className="relative px-6">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索待办标题、描述、关联客户..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="px-2">
          {/* Pending Section */}
          {pendingTodos.length > 0 ? (
            <div className="space-y-2">
              {pendingTodos.map(todo => (
                <div
                  key={todo.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 transition-all duration-300',
                    'bg-card hover:shadow-sm',
                    isOverdue(todo) && 'border-destructive/50 bg-destructive/5'
                  )}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggleComplete(todo)}
                    className={cn(
                      'mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                      'border-muted-foreground/30 hover:border-primary hover:bg-primary/10',
                      isOverdue(todo) && 'border-destructive/50 hover:border-destructive hover:bg-destructive/10'
                    )}
                  >
                    <Check className="w-3 h-3 opacity-0 hover:opacity-50" />
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{todo.title}</span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded font-medium',
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
                          {formatDate(todo.due_date)}
                          {isOverdue(todo) && ' (已逾期)'}
                        </span>
                      )}
                      {todo.customer_name && (
                        <span className="flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          {todo.customer_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
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
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Clock className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(todo.id)}
                      title="删除"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !searchQuery && (
              <div className="text-center py-8 text-muted-foreground">
                暂无待办事项，点击右上角新增
              </div>
            )
          )}

          {/* Divider */}
          {completedTodos.length > 0 && (
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-4 text-sm text-muted-foreground">
                  已完成 ({completedTodos.length})
                </span>
              </div>
            </div>
          )}

          {/* Completed Section - Timeline */}
          {completedTodos.length > 0 && (
            <div className="space-y-6">
              {completedGroupedByDate.map((group) => (
                <div key={group.label} className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[7px] top-6 bottom-0 w-px bg-border" />

                  {/* Date header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-primary/20 border-2 border-primary flex-shrink-0" />
                    <span className="text-sm font-medium text-muted-foreground">{group.label}</span>
                  </div>

                  {/* Items under this date */}
                  <div className="ml-5 space-y-2">
                    {group.items.map(todo => (
                      <div
                        key={todo.id}
                        className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 transition-all duration-300 group"
                      >
                        {/* Checkbox - checked */}
                        <button
                          onClick={() => handleToggleComplete(todo)}
                          className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 bg-primary border-primary text-primary-foreground flex items-center justify-center transition-all hover:opacity-80"
                        >
                          <Check className="w-3 h-3" />
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-muted-foreground line-through">{todo.title}</span>
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded opacity-60',
                              priorityConfig[todo.priority as keyof typeof priorityConfig]?.color || priorityConfig.medium.color
                            )}>
                              {priorityConfig[todo.priority as keyof typeof priorityConfig]?.label || '中'}
                            </span>
                          </div>
                          {todo.description && (
                            <p className="text-sm text-muted-foreground/60 mt-0.5 line-clamp-1">{todo.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground/60">
                            {todo.customer_name && (
                              <span className="flex items-center gap-1">
                                <Link2 className="w-3 h-3" />
                                {todo.customer_name}
                              </span>
                            )}
                            {todo.completed_at && (
                              <span>{new Date(todo.completed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>
                        </div>

                        {/* Delete action */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(todo.id)}
                          title="删除"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search empty state */}
          {searchQuery && pendingTodos.length === 0 && completedTodos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              未找到匹配的待办事项
            </div>
          )}
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
