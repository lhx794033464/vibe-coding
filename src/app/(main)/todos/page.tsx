'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, Clock, Search, Calendar, Link2, Trash2, Loader2, Edit3, ChevronDown, ChevronRight, Plus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface Customer {
  id: string;
  name: string;
}

interface Todo {
  id: string;
  content: string;
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
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDelayDialog, setShowDelayDialog] = useState(false);
  const [delayTodoId, setDelayTodoId] = useState<string | null>(null);
  const [delayDays, setDelayDays] = useState(1);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTodoId, setEditTodoId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [collapsedDateGroups, setCollapsedDateGroups] = useState<Set<string>>(new Set());
  const [editCustomerId, setEditCustomerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'completed'>('pending');

  // Create form state (right panel)
  const [newContent, setNewContent] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => {
    const now = new Date();
    const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return utc8.toISOString().slice(0, 10);
  });
  const [newPriority, setNewPriority] = useState('medium');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [creating, setCreating] = useState(false);

  // Animation tracking
  const [newTodoIds, setNewTodoIds] = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [newlyCompletedIds, setNewlyCompletedIds] = useState<Set<string>>(new Set());
  const [reopeningIds, setReopeningIds] = useState<Set<string>>(new Set());

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
    const dueDate = new Date(todo.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  const pendingTodos = useMemo(() => {
    let result = todos.filter(t => !t.completed);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.content.toLowerCase().includes(q) ||
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
        t.content.toLowerCase().includes(q) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => {
      const dateA = a.completed_at ? new Date(a.completed_at).getTime() : new Date(a.created_at).getTime();
      const dateB = b.completed_at ? new Date(b.completed_at).getTime() : new Date(a.created_at).getTime();
      return dateB - dateA;
    });
  }, [todos, searchQuery]);

  // Group completed todos by date
  const completedGroupedByDate = useMemo(() => {
    const groups: { dateKey: string; label: string; items: Todo[] }[] = [];
    completedTodos.forEach(todo => {
      const dateVal = todo.completed_at || todo.created_at;
      const d = new Date(dateVal);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      let label: string;
      if (dateKey === todayKey) label = '今天';
      else if (dateKey === yesterdayKey) label = '昨天';
      else label = dateKey;

      const existing = groups.find(g => g.dateKey === dateKey);
      if (existing) {
        existing.items.push(todo);
      } else {
        groups.push({ dateKey, label, items: [todo] });
      }
    });
    return groups;
  }, [completedTodos]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          content: newContent.trim(),
          due_date: newDueDate || null,
          priority: newPriority,
          customer_id: newCustomerId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '创建失败');
      }
      const result = await res.json();
      const newTodo: Todo = result.data;

      // Reset form
      setNewContent('');
      const now = new Date();
      const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      setNewDueDate(utc8.toISOString().slice(0, 10));
      setNewPriority('medium');
      setNewCustomerId('');

      // Optimistically add to state with animation
      if (newTodo) {
        const customerName = newCustomerId
          ? customers.find(c => c.id === newCustomerId)?.name || null
          : null;
        const todoWithCustomerName = { ...newTodo, customer_name: customerName || undefined };
        setTodos(prev => [todoWithCustomerName, ...prev]);
        setNewTodoIds(prev => new Set(prev).add(newTodo.id));
        // Remove animation class after animation completes
        setTimeout(() => {
          setNewTodoIds(prev => {
            const next = new Set(prev);
            next.delete(newTodo.id);
            return next;
          });
        }, 500);
      } else {
        loadData();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '创建失败';
      console.error('创建失败:', msg);
      toast.error('创建失败: ' + msg);
    } finally {
      setCreating(false);
    }
  };

  const handleComplete = async (id: string) => {
    try {
      // Start fade-out animation in pending list
      setCompletingIds(prev => new Set(prev).add(id));

      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ completed: true }),
      });
      if (!res.ok) throw new Error('操作失败');

      // After animation completes (300ms), update state
      setTimeout(() => {
        setTodos(prev => prev.map(t =>
          t.id === id ? { ...t, completed: true, completed_at: new Date().toISOString() } : t
        ));
        setCompletingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // Trigger appear animation in completed list
        setNewlyCompletedIds(prev => new Set(prev).add(id));
        setTimeout(() => {
          setNewlyCompletedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 500);
      }, 300);
    } catch (error) {
      console.error('完成待办失败:', error);
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelay = async () => {
    if (!delayTodoId) return;
    try {
      const todo = todos.find(t => t.id === delayTodoId);
      const currentDate = todo?.due_date ? new Date(todo.due_date) : new Date();
      const newDate = new Date(currentDate.getTime() + delayDays * 24 * 60 * 60 * 1000);
      const res = await fetch(`/api/todos/${delayTodoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ due_date: newDate.toISOString().split('T')[0] }),
      });
      if (!res.ok) throw new Error('延期失败');
      setShowDelayDialog(false);
      setDelayTodoId(null);
      setDelayDays(1);
      // Optimistic update
      setTodos(prev => prev.map(t =>
        t.id === delayTodoId ? { ...t, due_date: newDate.toISOString().split('T')[0] } : t
      ));
    } catch (error) {
      console.error('延期待办失败:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: '确定删除此待办？', variant: 'destructive' }))) return;
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error('删除失败');
      setTodos(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error('删除待办失败:', error);
    }
  };

  const handleReopen = async (id: string) => {
    try {
      // Start animation in completed list
      setReopeningIds(prev => new Set(prev).add(id));

      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ completed: false, completed_at: null }),
      });
      if (!res.ok) throw new Error('撤销失败');

      // After animation, update state
      setTimeout(() => {
        setTodos(prev => prev.map(t =>
          t.id === id ? { ...t, completed: false, completed_at: null } : t
        ));
        setReopeningIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // Trigger appear animation in pending list
        setNewTodoIds(prev => new Set(prev).add(id));
        setTimeout(() => {
          setNewTodoIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 500);
      }, 300);
    } catch (error) {
      console.error('撤销待办失败:', error);
      setReopeningIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const openEditDialog = (todo: Todo) => {
    setEditTodoId(todo.id);
    setEditContent(todo.content);
    setEditDueDate(todo.due_date || '');
    setEditPriority(todo.priority);
    setEditCustomerId(todo.customer_id || '');
    setShowEditDialog(true);
  };

  const handleEditSave = async () => {
    if (!editTodoId || !editContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/todos/${editTodoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          content: editContent.trim(),
          due_date: editDueDate || null,
          priority: editPriority,
          customer_id: editCustomerId || null,
        }),
      });
      if (!res.ok) throw new Error('修改失败');
      const result = await res.json();
      setShowEditDialog(false);
      setEditTodoId(null);
      // Optimistic update with server data
      if (result.data) {
        setTodos(prev => prev.map(t => t.id === editTodoId ? { ...t, ...result.data } : t));
      } else {
        const customerName = editCustomerId
          ? customers.find(c => c.id === editCustomerId)?.name || null
          : null;
        setTodos(prev => prev.map(t =>
          t.id === editTodoId
            ? { ...t, content: editContent.trim(), due_date: editDueDate || null, priority: editPriority, customer_id: editCustomerId || null, customer_name: customerName || undefined }
            : t
        ));
      }
    } catch (error) {
      console.error('修改待办失败:', error);
    } finally {
      setSaving(false);
    }
  };

  const priorityConfig = {
    high: { label: '高', color: 'text-red-600 bg-red-50 border-red-200' },
    medium: { label: '中', color: 'text-amber-600 bg-amber-50 border-amber-200' },
    low: { label: '低', color: 'text-green-600 bg-green-50 border-green-200' },
  };

  const completedPriorityConfig = {
    high: { label: '高', color: 'text-muted-foreground bg-muted border-border' },
    medium: { label: '中', color: 'text-muted-foreground bg-muted border-border' },
    low: { label: '低', color: 'text-muted-foreground bg-muted border-border' },
  };

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const dueDate = new Date(dateStr);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (86400000));
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '明天';
    if (diffDays === 2) return '后天';
    return dateStr.slice(0, 10);
  };

  const handleUndoComplete = async (todoId: string) => {
    handleReopen(todoId);
  };

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return null;
    return customers.find(c => c.id === customerId)?.name || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-6 pt-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <h1 className="text-2xl font-bold text-gray-900">待办事项</h1>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索待办..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter buttons */}
      <div className="flex items-center gap-2 mb-4">
        <button
          className={cn(
            'px-3 py-1.5 text-sm rounded-md border font-medium transition-colors',
            filter === 'pending'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-background border-border hover:bg-muted'
          )}
          onClick={() => setFilter('pending')}
        >
          待办 ({pendingTodos.length})
        </button>
        <button
          className={cn(
            'px-3 py-1.5 text-sm rounded-md border font-medium transition-colors',
            filter === 'completed'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-background border-border hover:bg-muted'
          )}
          onClick={() => setFilter('completed')}
        >
          已办 ({completedTodos.length})
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Todo List */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-card shadow-sm">
            {/* Pending section */}
            {filter === 'pending' && (
            <div className="p-4">
              {pendingTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  暂无待办事项
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingTodos.map(todo => {
                    const pConfig = priorityConfig[todo.priority as keyof typeof priorityConfig] || priorityConfig.medium;
                    const customerName = todo.customer_name || getCustomerName(todo.customer_id);
                    const overdue = isOverdue(todo);
                    const isNew = newTodoIds.has(todo.id);
                    const isCompleting = completingIds.has(todo.id);

                    return (
                      <div
                        key={todo.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-md border transition-colors hover:bg-muted/50',
                          overdue && 'border-red-200 bg-red-50/50',
                          isNew && 'anim-new-todo',
                          isCompleting && 'anim-completing'
                        )}
                      >
                        {/* Content area */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded border font-medium shrink-0',
                              pConfig.color
                            )}>
                              {pConfig.label}
                            </span>
                            <p className="text-sm font-medium text-foreground truncate">
                              {todo.content}
                            </p>
                            {overdue && (
                              <span className="text-xs text-red-600 font-medium shrink-0">已逾期</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {todo.due_date && (
                              <span className={cn(overdue && 'text-red-600')}>
                                {formatDueDate(todo.due_date)}
                              </span>
                            )}
                            {customerName && (
                              <span className="flex items-center gap-1">
                                <Link2 className="w-3 h-3" />
                                {customerName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleComplete(todo.id)}
                            title="完成"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={() => {
                              setDelayTodoId(todo.id);
                              setDelayDays(1);
                              setShowDelayDialog(true);
                            }}
                            title="延期"
                          >
                            <Clock className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => openEditDialog(todo)}
                            title="修改"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(todo.id)}
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Completed section */}
            {filter === 'completed' && (
            <div className="p-4">
              {completedGroupedByDate.length > 0 ? (
              <div>
                    {completedGroupedByDate.map((group, gi) => {
                      const isCollapsed = collapsedDateGroups.has(group.dateKey);
                      return (
                      <div key={gi} className="pb-4 last:pb-0">
                        {/* Date header - clickable to collapse */}
                        <button
                          className="flex items-center gap-1.5 mb-2 cursor-pointer select-none group-date"
                          onClick={() => setCollapsedDateGroups(prev => {
                            const next = new Set(prev);
                            if (next.has(group.dateKey)) next.delete(group.dateKey);
                            else next.add(group.dateKey);
                            return next;
                          })}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60" />
                          )}
                          <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                          {isCollapsed && (
                            <span className="text-xs text-muted-foreground/40">{group.items.length}项</span>
                          )}
                        </button>
                        {/* Items */}
                        {!isCollapsed && (
                        <div className="space-y-1.5">
                          {group.items.map(todo => {
                            const customerName = todo.customer_name || getCustomerName(todo.customer_id);
                            const isNewlyCompleted = newlyCompletedIds.has(todo.id);
                            const isReopening = reopeningIds.has(todo.id);

                            return (
                              <div
                                key={todo.id}
                                className={cn(
                                  'flex items-center gap-3 py-1.5 px-3 rounded-md hover:bg-muted/30 group',
                                  isNewlyCompleted && 'anim-completed-in',
                                  isReopening && 'anim-reopening'
                                )}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {todo.priority && (
                                      <span className={cn(
                                        'text-xs px-1.5 py-0.5 rounded border font-medium shrink-0',
                                        completedPriorityConfig[todo.priority as keyof typeof completedPriorityConfig]?.color || completedPriorityConfig.medium.color
                                      )}>
                                        {completedPriorityConfig[todo.priority as keyof typeof completedPriorityConfig]?.label || '中'}
                                      </span>
                                    )}
                                    <p className="text-sm text-muted-foreground line-through truncate">
                                      {todo.content}
                                    </p>
                                  </div>
                                  {customerName && (
                                    <span className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                                      <Link2 className="w-3 h-3" />
                                      {customerName}
                                    </span>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-muted-foreground/40 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleReopen(todo.id)}
                                  title="撤销完成"
                                >
                                  <Undo2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-muted-foreground/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleDelete(todo.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                        )}
                      </div>
                    )})}
                  </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">暂无已办事项</p>
              )}
            </div>
            )}

            {pendingTodos.length === 0 && completedGroupedByDate.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <p>暂无待办事项</p>
                <p className="text-xs mt-1">在右侧添加新的待办</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: New Todo Form */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-card shadow-sm p-4 sticky top-6">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              新增待办
            </h3>
            <div className="space-y-4">
              <div>
                <Label>待办内容 <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="请输入待办内容..."
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label>截止日期</Label>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>优先级</Label>
                <div className="flex gap-2 mt-1">
                  {(['high', 'medium', 'low'] as const).map(p => {
                    const cfg = priorityConfig[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        className={cn(
                          'flex-1 text-xs py-1.5 rounded-md border font-medium transition-colors',
                          newPriority === p
                            ? cfg.color + ' ring-1 ring-current'
                            : 'text-muted-foreground bg-muted/30 border-border hover:bg-muted'
                        )}
                        onClick={() => setNewPriority(p)}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>关联客户</Label>
                <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal mt-1">
                      {newCustomerId
                        ? (customers.find(c => c.id === newCustomerId)?.name || '选择客户')
                        : '选择客户（可选）'}
                      <ChevronRight className="w-4 h-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[260px]" align="start">
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

              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={!newContent.trim() || creating}
              >
                {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                添加待办
              </Button>
            </div>
          </div>
        </div>
      </div>

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
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelayDialog(false)}>取消</Button>
            <Button onClick={handleDelay}>确认延期</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改待办</DialogTitle>
            <DialogDescription>编辑待办内容和属性</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>待办内容</Label>
              <Textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <Label>截止日期</Label>
              <Input
                type="date"
                value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>优先级</Label>
              <div className="flex gap-2 mt-1">
                {(['high', 'medium', 'low'] as const).map(p => {
                  const cfg = priorityConfig[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      className={cn(
                        'flex-1 text-xs py-1.5 rounded-md border font-medium transition-colors',
                        editPriority === p
                          ? cfg.color + ' ring-1 ring-current'
                          : 'text-muted-foreground bg-muted/30 border-border hover:bg-muted'
                      )}
                      onClick={() => setEditPriority(p)}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>关联客户</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal mt-1">
                    {editCustomerId
                      ? (customers.find(c => c.id === editCustomerId)?.name || '选择客户')
                      : '选择客户（可选）'}
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[260px]" align="start">
                  <Command>
                    <CommandInput placeholder="搜索客户..." />
                    <CommandList>
                      <CommandEmpty>未找到客户</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={() => setEditCustomerId('')}>
                          不关联客户
                        </CommandItem>
                        {customers.map(c => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => setEditCustomerId(c.id)}
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
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleEditSave} disabled={!editContent.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
