'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Target, Loader2, X, Check, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface KpiTemplate {
  id: string;
  year: number;
  content: string;
  indicator: string;
  weight: string;
  target_value: string | null;
  target_role: string;
  created_by: string;
}

interface KpiProgress {
  id: string;
  template_id: string;
  user_id: string;
  year: number;
  manual_value: string | null;
}

interface KpiData {
  templates: KpiTemplate[];
  progress: KpiProgress[];
}

const INDICATOR_LABELS: Record<string, string> = {
  online_rate: '上线率',
  completion_rate: '完成率',
  knowledge_count: '知识沉淀数量',
  customer_satisfaction: '客户满意度',
};

const INDICATOR_COLORS: Record<string, string> = {
  online_rate: 'bg-green-100 text-green-700 border-green-200',
  completion_rate: 'bg-blue-100 text-blue-700 border-blue-200',
  knowledge_count: 'bg-purple-100 text-purple-700 border-purple-200',
  customer_satisfaction: 'bg-amber-100 text-amber-700 border-amber-200',
};

export default function KpiSection({ currentYear = new Date().getFullYear() }: { currentYear?: number }) {
  const { getAuthHeader, user, isAdmin } = useAuth();
  const [kpiData, setKpiData] = useState<KpiData>({ templates: [], progress: [] });
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(currentYear);

  // 管理员：新增/编辑模板
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<KpiTemplate | null>(null);
  const [formIndicator, setFormIndicator] = useState('online_rate');
  const [formWeight, setFormWeight] = useState('30');
  const [formTarget, setFormTarget] = useState('');
  const [formTargetRole, setFormTargetRole] = useState('交付顾问');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // 顾问：编辑进度
  const [editingProgress, setEditingProgress] = useState<{ templateId: string; value: string } | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);

  // 看板数据（用于自动计算上线率/完成率）
  const [dashboardStats, setDashboardStats] = useState<{ onlineRate: number; acceptanceRate: number } | null>(null);

  const fetchKpiData = useCallback(async () => {
    try {
      const res = await fetch(`/api/kpi/progress?year=${year}`, {
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        const data = await res.json();
        setKpiData({
          templates: Array.isArray(data.templates) ? data.templates : [],
          progress: Array.isArray(data.progress) ? data.progress : [],
        });
      }
    } catch (error) {
      console.error('获取KPI数据失败:', error);
    }
  }, [year, getAuthHeader]);

  // 获取看板数据（用于上线率/完成率）
  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard?timeRange=assessment', {
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      if (res.ok) {
        setDashboardStats({
          onlineRate: data.onlineRate ?? 0,
          acceptanceRate: data.acceptanceRate ?? 0,
        });
      }
    } catch {
      // ignore
    }
  }, [getAuthHeader]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchKpiData(), fetchDashboardData()]).finally(() => setLoading(false));
  }, [fetchKpiData, fetchDashboardData]);

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setFormIndicator('online_rate');
    setFormWeight('30');
    setFormTarget('');
    setFormTargetRole('交付顾问');
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (tmpl: KpiTemplate) => {
    setEditingTemplate(tmpl);
    setFormIndicator(tmpl.indicator);
    setFormWeight(tmpl.weight);
    setFormTarget(tmpl.target_value || '');
    setFormTargetRole(tmpl.target_role || '交付顾问');
    setTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    if (!formWeight) {
      toast.error('请填写权重');
      return;
    }
    setSavingTemplate(true);
    try {
      const payload = {
        year,
        content: INDICATOR_LABELS[formIndicator] || formIndicator,
        indicator: formIndicator,
        weight: parseFloat(formWeight),
        target_value: formTarget ? parseFloat(formTarget) : null,
        target_role: formTargetRole,
      };

      let res;
      if (editingTemplate) {
        res = await fetch(`/api/kpi/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/kpi/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      toast.success(editingTemplate ? 'KPI已更新' : 'KPI已添加');
      setTemplateDialogOpen(false);
      fetchKpiData();
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('确定删除该KPI项？')) return;
    try {
      const res = await fetch(`/api/kpi/templates/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error('删除失败');
      toast.success('已删除');
      fetchKpiData();
    } catch {
      toast.error('删除失败');
    }
  };

  // 获取实际值
  const getActualValue = (tmpl: KpiTemplate, progress: KpiProgress | undefined): number | null => {
    switch (tmpl.indicator) {
      case 'online_rate':
        return dashboardStats?.onlineRate ?? null;
      case 'completion_rate':
        return dashboardStats?.acceptanceRate ?? null;
      case 'knowledge_count':
        return progress?.manual_value ? parseFloat(progress.manual_value) : null;
      case 'customer_satisfaction':
        return progress?.manual_value ? parseFloat(progress.manual_value) : null;
      default:
        return null;
    }
  };

  // 计算单项完成率
  const getCompletionRate = (tmpl: KpiTemplate, progress: KpiProgress | undefined): { rate: number; label: string } | null => {
    const actual = getActualValue(tmpl, progress);
    if (actual === null) return null;

    const target = tmpl.target_value ? parseFloat(tmpl.target_value) : 100;
    if (target <= 0) return { rate: 0, label: '0%' };

    const rate = Math.min(Math.round((actual / target) * 100), 100);
    return { rate, label: `${rate}%` };
  };

  // 计算总体完成率
  const getOverallRate = (): { rate: number; weightedSum: number; totalWeight: number } | null => {
    const templates = kpiData.templates;
    if (templates.length === 0) return null;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const tmpl of templates) {
      const weight = parseFloat(tmpl.weight);
      if (isNaN(weight) || weight <= 0) continue;

      const myProgress = kpiData.progress.find(p => p.template_id === tmpl.id);
      const completion = getCompletionRate(tmpl, myProgress);
      if (completion !== null) {
        weightedSum += weight * completion.rate;
        totalWeight += weight;
      }
    }

    if (totalWeight <= 0) return null;

    return {
      rate: Math.round(weightedSum / totalWeight),
      weightedSum,
      totalWeight,
    };
  };

  // 编辑进度
  const handleSaveProgress = async (templateId: string) => {
    if (!editingProgress || editingProgress.value === '') return;
    setSavingProgress(true);
    try {
      const res = await fetch('/api/kpi/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          template_id: templateId,
          value: parseFloat(editingProgress.value),
          year,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success('进度已更新');
      setEditingProgress(null);
      fetchKpiData();
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setSavingProgress(false);
    }
  };

  const overall = getOverallRate();

  // 判断当前用户是否有权编辑
  const canEdit = user && (isAdmin || user.role === '交付顾问' || user.role === '答疑顾问');

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-5 w-5 text-gray-400" />
          KPI 完成率
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={year.toString()}
            onValueChange={(v) => setYear(parseInt(v))}
          >
            <SelectTrigger className="w-24 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" side="bottom">
              {[2024, 2025, 2026].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}年</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openNewTemplate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> 设置KPI
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : kpiData.templates.length === 0 ? (
          <div className="text-center py-8">
            <Target className="h-10 w-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {isAdmin ? '点击"设置KPI"添加考核项' : '管理员尚未设置考核项'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 总体完成率 */}
            {overall && (
              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                    <circle
                      cx="32" cy="32" r="28"
                      fill="none"
                      stroke="url(#kpiGradient)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${(overall.rate / 100) * 176} 176`}
                    />
                    <defs>
                      <linearGradient id="kpiGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-700">
                    {overall.rate}%
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">总体 KPI 完成率</p>
                  <p className="text-xs text-gray-400">{year}年度 · 共{kpiData.templates.length}项考核</p>
                </div>
              </div>
            )}

            {/* KPI列表 */}
            <div className="space-y-2">
              {kpiData.templates.map((tmpl) => {
                const myProgress = kpiData.progress.find(p => p.template_id === tmpl.id);
                const actual = getActualValue(tmpl, myProgress);
                const completion = getCompletionRate(tmpl, myProgress);
                const isAutoCalculated = tmpl.indicator === 'online_rate' || tmpl.indicator === 'completion_rate';
                const isEditable = tmpl.indicator === 'knowledge_count' || (tmpl.indicator === 'customer_satisfaction' && isAdmin);

                return (
                  <div key={tmpl.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50/50 transition-colors">
                    {/* 考核对象 */}
                    <span className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      tmpl.target_role === '交付顾问' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {tmpl.target_role || '交付顾问'}
                    </span>

                    {/* 考核内容（指标名称） */}
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', INDICATOR_COLORS[tmpl.indicator] || 'bg-gray-100')}>
                      {INDICATOR_LABELS[tmpl.indicator] || tmpl.indicator}
                    </span>

                    {/* 权重 */}
                    <span className="text-xs text-gray-500">{tmpl.weight}%</span>

                    {/* 实际值/完成率 */}
                    <div className="text-right flex-shrink-0 min-w-[100px]">
                      {isAutoCalculated ? (
                        <>
                          <p className="text-sm font-semibold text-gray-800">
                            {actual !== null ? `${actual}%` : '-'}
                          </p>
                          {completion && (
                            <p className="text-xs text-gray-400">完成率 {completion.label}</p>
                          )}
                        </>
                      ) : isEditable ? (
                        editingProgress?.templateId === tmpl.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              className="w-20 h-7 text-xs"
                              value={editingProgress.value}
                              onChange={(e) => setEditingProgress({ templateId: tmpl.id, value: e.target.value })}
                              autoFocus
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveProgress(tmpl.id)} disabled={savingProgress}>
                              {savingProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingProgress(null)}>
                              <X className="h-3 w-3 text-gray-400" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-sm font-semibold text-gray-800">
                              {actual !== null ? `${actual}${tmpl.indicator === 'knowledge_count' ? '篇' : '%'}` : '-'}
                            </span>
                            {canEdit && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingProgress({ templateId: tmpl.id, value: actual?.toString() || '' })}>
                                <Pencil className="h-3 w-3 text-gray-400" />
                              </Button>
                            )}
                          </div>
                        )
                      ) : (
                        <span className="text-sm font-semibold text-gray-800">{actual !== null ? `${actual}%` : '-'}</span>
                      )}
                    </div>

                    {/* 完成率进度条 */}
                    <div className="w-24 flex-shrink-0">
                      {completion ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full transition-all duration-500"
                              style={{
                                width: `${completion.rate}%`,
                                backgroundColor: completion.rate >= 80 ? '#22c55e' : completion.rate >= 60 ? '#eab308' : '#ef4444',
                              }}
                            />
                          </div>
                          <span className={cn(
                            'text-xs font-medium w-8 text-right',
                            completion.rate >= 80 ? 'text-green-600' : completion.rate >= 60 ? 'text-yellow-600' : 'text-red-600'
                          )}>
                            {completion.label}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">暂无数据</span>
                      )}
                    </div>

                    {/* 管理员操作 */}
                    {isAdmin && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTemplate(tmpl)}>
                          <Pencil className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteTemplate(tmpl.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {overall && overall.totalWeight < 100 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                当前权重合计{overall.totalWeight}%，建议调整为100%
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* 设置/编辑KPI弹窗 */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? '编辑考核项' : '新增考核项'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700">考核对象</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700">考核内容</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700">考核指标</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700">考核权重</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-2">
                    <Select value={formTargetRole} onValueChange={setFormTargetRole}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom">
                        <SelectItem value="交付顾问">交付顾问</SelectItem>
                        <SelectItem value="答疑顾问">答疑顾问</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn('text-xs font-medium px-2 py-1 rounded-full border', INDICATOR_COLORS[formIndicator] || 'bg-gray-100')}>
                      {INDICATOR_LABELS[formIndicator] || formIndicator}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Select value={formIndicator} onValueChange={setFormIndicator}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom">
                        <SelectItem value="online_rate">上线率</SelectItem>
                        <SelectItem value="completion_rate">完成率</SelectItem>
                        <SelectItem value="knowledge_count">知识沉淀数量</SelectItem>
                        <SelectItem value="customer_satisfaction">客户满意度</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="w-20 h-8 text-xs"
                        value={formWeight}
                        onChange={(e) => setFormWeight(e.target.value)}
                        min={0}
                        max={100}
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </td>
                </tr>
                {formTarget && (
                  <tr className="border-b">
                    <td colSpan={4} className="px-3 py-1.5">
                      <p className="text-xs text-gray-400">
                        目标值：{formTarget}{['knowledge_count'].includes(formIndicator) ? '篇' : '%'}
                        {formIndicator === 'knowledge_count' && <span className="ml-2 text-gray-300">（知识沉淀数量由顾问编辑）</span>}
                        {formIndicator === 'customer_satisfaction' && <span className="ml-2 text-gray-300">（客户满意度由管理员编辑，默认100%）</span>}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">取消</Button>
            </DialogClose>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={saveTemplate} disabled={savingTemplate}>
              {savingTemplate && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingTemplate ? '保存修改' : '添加'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}