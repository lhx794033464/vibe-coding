'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle2, AlertTriangle, Clock, X, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

// ========== 类型定义 ==========
interface TodoReminder {
  id: string;
  content: string;
  due_date: string;
  priority: string;
  customer_id: string | null;
  customer_name: string | null;
}

interface DeadlineReminder {
  id: string;
  name: string;
  delivery_deadline: string;
  days_remaining: number;
  status: string;
  implementation_type: string | null;
}

interface ReminderData {
  todoReminders: TodoReminder[];
  deadlineReminders: DeadlineReminder[];
}

// ========== 工具函数 ==========

function getPriorityStyle(priority: string) {
  switch (priority) {
    case 'high':
      return { label: '紧急', className: 'bg-red-100 text-red-700' };
    case 'medium':
      return { label: '一般', className: 'bg-amber-100 text-amber-700' };
    case 'low':
      return { label: '低', className: 'bg-slate-100 text-slate-600' };
    default:
      return { label: '一般', className: 'bg-amber-100 text-amber-700' };
  }
}

function getDeadlineUrgency(daysRemaining: number) {
  if (daysRemaining <= 0) return { label: '已到期', className: 'bg-red-100 text-red-700', icon: AlertTriangle };
  if (daysRemaining === 1) return { label: '明天到期', className: 'bg-red-100 text-red-700', icon: AlertTriangle };
  if (daysRemaining === 2) return { label: '后天到期', className: 'bg-amber-100 text-amber-700', icon: Clock };
  return { label: `${daysRemaining}天后到期`, className: 'bg-amber-50 text-amber-600', icon: Clock };
}

function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diff = date.getTime() - today.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return `逾期${Math.abs(days)}天`;
  if (days === 0) return '今天到期';
  if (days === 1) return '明天到期';
  return `${days}天后到期`;
}

// ========== 主组件 ==========

export function ProactiveReminder() {
  const router = useRouter();
  const { getAuthHeader, isAuthenticated } = useAuth();
  const [reminders, setReminders] = useState<ReminderData | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchCountRef = useRef(0);

  // 获取提醒数据
  const fetchReminders = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch('/api/reminders', {
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        const data: ReminderData = await res.json();
        const hasReminders = data.todoReminders.length > 0 || data.deadlineReminders.length > 0;
        setReminders(data);
        fetchCountRef.current += 1;

        // 首次获取到数据且有提醒 → 弹出通知
        if (hasReminders && !dismissed && fetchCountRef.current === 1) {
          // 延迟1.5秒后弹出，避免页面加载时的突兀感
          timerRef.current = setTimeout(() => {
            setVisible(true);
          }, 1500);
        }

        // 定时检测逻辑：下午5:30后自动弹出
        if (hasReminders && !dismissed) {
          scheduleAfternoonReminder();
        }
      }
    } catch (error) {
      console.error('获取提醒失败:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, getAuthHeader, dismissed]);

  // 定时检测：下午5:30自动弹出
  const scheduleAfternoonReminder = useCallback(() => {
    const now = new Date();
    const target = new Date(now);
    target.setHours(17, 30, 0, 0);

    // 如果已经过了17:30，立即弹出（前提是今天还没弹过）
    const todayKey = `reminder_dismissed_${now.toISOString().split('T')[0]}`;
    const alreadyDismissedToday = typeof window !== 'undefined' && localStorage.getItem(todayKey);

    if (now.getHours() >= 17 && now.getMinutes() >= 30 && !alreadyDismissedToday && !visible) {
      setVisible(true);
      return;
    }

    // 如果还没到17:30，设定定时器
    if (now < target) {
      const delay = target.getTime() - now.getTime();
      timerRef.current = setTimeout(() => {
        const key = `reminder_dismissed_${new Date().toISOString().split('T')[0]}`;
        const dismissed = localStorage.getItem(key);
        if (!dismissed) {
          fetchReminders(); // 刷新数据后再弹出
        }
      }, delay);
    }
  }, [visible, fetchReminders]);

  // 关闭/忽略提醒
  const handleDismiss = useCallback(() => {
    setVisible(false);
    setDismissed(true);
    const todayKey = `reminder_dismissed_${new Date().toISOString().split('T')[0]}`;
    localStorage.setItem(todayKey, 'true');
  }, []);

  // 最小化
  const handleMinimize = useCallback(() => {
    setMinimized(true);
  }, []);

  // 展开
  const handleExpand = useCallback(() => {
    setMinimized(false);
  }, []);

  // 跳转待办页
  const goToTodos = useCallback(() => {
    router.push('/todos');
  }, [router]);

  // 跳转客户详情
  const goToCustomer = useCallback((customerId: string) => {
    router.push(`/customers/${customerId}`);
  }, [router]);

  // 初始化
  useEffect(() => {
    fetchReminders();

    // 每5分钟轮询一次，检测新的提醒
    intervalRef.current = setInterval(() => {
      const todayKey = `reminder_dismissed_${new Date().toISOString().split('T')[0]}`;
      const alreadyDismissedToday = localStorage.getItem(todayKey);
      if (!alreadyDismissedToday) {
        fetchReminders();
      }
    }, 5 * 60 * 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchReminders]);

  // 无提醒不渲染
  if (!reminders || (reminders.todoReminders.length === 0 && reminders.deadlineReminders.length === 0)) {
    return null;
  }

  if (!visible && !minimized) return null;

  const totalTodoCount = reminders.todoReminders.length;
  const totalDeadlineCount = reminders.deadlineReminders.length;
  const totalCount = totalTodoCount + totalDeadlineCount;

  // ========== 最小化状态：浮动小图标 ==========
  if (minimized) {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 cursor-pointer animate-bounce-in"
        onClick={handleExpand}
      >
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-blue-500 shadow-lg shadow-blue-500/30 flex items-center justify-center hover:bg-blue-600 transition-colors">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-medium">
            {totalCount}
          </span>
        </div>
      </div>
    );
  }

  // ========== 展开状态：通知面板 ==========
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-h-[70vh] animate-slide-up">
      <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-slate-200 overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <span className="font-medium text-sm">交付助手提醒</span>
            <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
              {totalCount} 条
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleMinimize}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="最小化"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="忽略今日提醒"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {/* 待办事项提醒 */}
          {totalTodoCount > 0 && (
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-slate-700">
                    待办事项 · {totalTodoCount} 项到期
                  </span>
                </div>
                <button
                  onClick={goToTodos}
                  className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                >
                  查看全部
                </button>
              </div>
              <div className="space-y-2">
                {reminders.todoReminders.slice(0, 5).map((todo) => {
                  const priorityStyle = getPriorityStyle(todo.priority);
                  return (
                    <div
                      key={todo.id}
                      className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                      onClick={() => todo.customer_id ? goToCustomer(todo.customer_id) : goToTodos()}
                    >
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5', priorityStyle.className)}>
                        {priorityStyle.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate">{todo.content}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-slate-400">
                            {formatDueDate(todo.due_date)}
                          </span>
                          {todo.customer_name && (
                            <span className="text-[11px] text-blue-500 truncate">
                              {todo.customer_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {totalTodoCount > 5 && (
                  <button
                    onClick={goToTodos}
                    className="w-full text-center text-xs text-blue-500 hover:text-blue-600 py-1"
                  >
                    还有 {totalTodoCount - 5} 项待办...
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 交付截止日提醒 */}
          {totalDeadlineCount > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-slate-700">
                    交付截止 · {totalDeadlineCount} 个客户临近
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {reminders.deadlineReminders.map((customer) => {
                  const urgency = getDeadlineUrgency(customer.days_remaining);
                  const UrgencyIcon = urgency.icon;
                  return (
                    <div
                      key={customer.id}
                      className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                      onClick={() => goToCustomer(customer.id)}
                    >
                      <UrgencyIcon className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', customer.days_remaining <= 1 ? 'text-red-500' : 'text-amber-500')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate">{customer.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', urgency.className)}>
                            {urgency.label}
                          </span>
                          {customer.implementation_type && (
                            <span className="text-[11px] text-slate-400">{customer.implementation_type}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          </div>

        {/* 底部操作栏 */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            onClick={handleDismiss}
            className="text-xs text-slate-400 hover:text-slate-500 transition-colors"
          >
            今日不再提醒
          </button>
          <button
            onClick={goToTodos}
            className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors"
          >
            前往待办 <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
