'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  User,
  ArrowLeft,
  Megaphone,
} from 'lucide-react';

interface ShareRecord {
  id: string;
  share_date: string;
  user_name: string;
  topic: string | null;
  created_at: string;
  updated_at: string;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function MorningSharingPage() {
  const router = useRouter();
  const { getAuthHeader } = useAuth();

  // 当前显示的月份
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // 弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<string>('');
  const [formUserName, setFormUserName] = useState('');
  const [formTopic, setFormTopic] = useState('');

  // 可用用户列表（从 shares 和当前用户中提取）
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);

  // 计算月份范围
  const monthRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate, year, month, lastDay };
  }, [currentDate]);

  // 获取用户列表
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users', { headers: { ...getAuthHeader() } });
        if (res.ok) {
          const data = await res.json();
          const names = (data.users || data || []).map((u: Record<string, unknown>) => u.username as string).filter(Boolean);
          setAvailableUsers(names);
        }
      } catch {
        // ignore
      }
    };
    fetchUsers();
  }, [getAuthHeader]);

  // 获取分享数据
  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/morning-sharing?start_date=${monthRange.startDate}&end_date=${monthRange.endDate}`,
        { headers: { ...getAuthHeader() } }
      );
      if (res.ok) {
        const data = await res.json();
        setShares(data.data || []);
      }
    } catch {
      toast.error('获取晨会分享数据失败');
    } finally {
      setLoading(false);
    }
  }, [monthRange.startDate, monthRange.endDate, getAuthHeader]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  // 按日期分组
  const sharesByDate = useMemo(() => {
    const map = new Map<string, ShareRecord[]>();
    for (const s of shares) {
      const dateKey = s.share_date.split('T')[0];
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(s);
    }
    return map;
  }, [shares]);

  // 生成月份中每一天
  const daysInMonth = useMemo(() => {
    const days: { date: string; dayOfWeek: number; isWeekend: boolean; isToday: boolean; isFuture: boolean }[] = [];
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let d = 1; d <= monthRange.lastDay; d++) {
      const date = new Date(monthRange.year, monthRange.month, d);
      const dateStr = `${monthRange.year}-${String(monthRange.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = date.getDay();
      days.push({
        date: dateStr,
        dayOfWeek: dow,
        isWeekend: dow === 0 || dow === 6,
        isToday: dateStr === todayStr,
        isFuture: dateStr > todayStr,
      });
    }
    return days;
  }, [monthRange]);

  // 添加/编辑分享
  const handleSave = async () => {
    if (!formUserName.trim()) {
      toast.error('请输入分享人姓名');
      return;
    }

    try {
      const res = await fetch('/api/morning-sharing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          share_date: editingDate,
          user_name: formUserName.trim(),
          topic: formTopic.trim() || null,
        }),
      });

      if (res.ok) {
        toast.success('保存成功');
        setDialogOpen(false);
        setFormUserName('');
        setFormTopic('');
        fetchShares();
      } else {
        const data = await res.json();
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    }
  };

  // 删除分享
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/morning-sharing?id=${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        toast.success('已删除');
        fetchShares();
      } else {
        toast.error('删除失败');
      }
    } catch {
      toast.error('删除失败');
    }
  };

  // 打开添加弹窗
  const openAddDialog = (date: string) => {
    setEditingDate(date);
    setFormUserName('');
    setFormTopic('');
    setDialogOpen(true);
  };

  // 月份切换
  const prevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // 随机分配（快速排期）
  const handleAutoFill = () => {
    // 收集工作日中没有分配的日期
    const emptyWorkdays = daysInMonth.filter(
      (d) => !d.isWeekend && !sharesByDate.has(d.date)
    );
    if (emptyWorkdays.length === 0) {
      toast.info('当前月份所有工作日均已分配');
      return;
    }
    if (availableUsers.length === 0) {
      toast.info('暂无可用用户');
      return;
    }

    // 打开逐日分配弹窗
    openAddDialog(emptyWorkdays[0].date);
  };

  const monthLabel = `${monthRange.year}年${monthRange.month + 1}月`;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-4 sm:p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => router.push('/tools')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-slate-800">晨会分享</h1>
          </div>
          <p className="text-slate-500 mt-1 ml-6">管理晨会分享排期，交付助手将在分享前一天推送提醒</p>
        </div>

        {/* 月份切换 */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="outline" size="sm" onClick={prevMonth} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold text-slate-700 min-w-[120px] text-center">
            {monthLabel}
          </span>
          <Button variant="outline" size="sm" onClick={nextMonth} className="gap-1">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            今天
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleAutoFill} className="gap-1">
            <CalendarDays className="h-4 w-4" />
            快速排期
          </Button>
        </div>

        {/* 纵向日历视图 */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">加载中...</div>
        ) : (
          <div className="space-y-2">
            {daysInMonth.map((day) => {
              const dayShares = sharesByDate.get(day.date) || [];
              const weekdayLabel = `周${WEEKDAYS[day.dayOfWeek]}`;

              return (
                <Card
                  key={day.date}
                  className={`rounded-xl transition-all duration-200 ${
                    day.isToday
                      ? 'border-blue-400 bg-blue-50/40 shadow-sm'
                      : day.isWeekend
                      ? 'border-slate-200 bg-slate-50/60'
                      : 'border-slate-200 bg-white hover:shadow-sm'
                  }`}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      {/* 日期列 */}
                      <div className="shrink-0 w-16 sm:w-20 flex flex-col items-center">
                        <span className={`text-xl sm:text-2xl font-bold ${
                          day.isToday ? 'text-blue-600' : day.isWeekend ? 'text-slate-400' : 'text-slate-700'
                        }`}>
                          {parseInt(day.date.split('-')[2])}
                        </span>
                        <span className={`text-xs font-medium ${
                          day.isToday ? 'text-blue-500' : day.isWeekend ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          {weekdayLabel}
                        </span>
                        {day.isToday && (
                          <Badge className="mt-1 text-[10px] px-1.5 py-0 h-5 bg-blue-500 text-white">
                            今天
                          </Badge>
                        )}
                      </div>

                      {/* 分隔线 */}
                      <div className={`w-px self-stretch ${
                        day.isToday ? 'bg-blue-300' : 'bg-slate-200'
                      }`} />

                      {/* 分享人列 */}
                      <div className="flex-1 min-w-0">
                        {dayShares.length === 0 ? (
                          <div className="flex items-center gap-2 py-1">
                            <span className="text-sm text-slate-400">未安排</span>
                            {!day.isWeekend && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-blue-500 hover:text-blue-600 px-2"
                                onClick={() => openAddDialog(day.date)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                添加
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {dayShares.map((share) => (
                              <div
                                key={share.id}
                                className="flex items-center gap-2 group"
                              >
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm ${
                                  day.isToday
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  <User className="h-3.5 w-3.5 shrink-0" />
                                  <span className="font-medium">{share.user_name}</span>
                                </div>
                                {share.topic && (
                                  <span className="text-xs text-slate-500 truncate">
                                    {share.topic}
                                  </span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500"
                                  onClick={() => handleDelete(share.id)}
                                  title="删除"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 添加按钮 */}
                      {!day.isWeekend && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-7 text-xs gap-1"
                          onClick={() => openAddDialog(day.date)}
                        >
                          <Plus className="h-3 w-3" />
                          添加
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-blue-500" />
              添加晨会分享
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 分享日期 */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">分享日期</label>
              <div className="h-10 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                {editingDate}
              </div>
            </div>

            {/* 分享人 */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">分享人</label>
              <Select value={formUserName} onValueChange={setFormUserName}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择或输入分享人" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* 如果不在列表中，可以手动输入 */}
              <Input
                placeholder="或直接输入姓名"
                value={formUserName}
                onChange={(e) => setFormUserName(e.target.value)}
                className="mt-2"
              />
            </div>

            {/* 分享主题（可选） */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                分享主题 <span className="text-slate-400 font-normal">（可选）</span>
              </label>
              <Input
                placeholder="例如：如何提升交付效率"
                value={formTopic}
                onChange={(e) => setFormTopic(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
