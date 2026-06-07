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

interface FormRow {
  indicator: string;
  weight: string;
  target: string;
  targetRole: string;
}

const DEFAULT_ROLES: Record<string, string> = {
  online_rate: '交付顾问',
  completion_rate: '交付顾问',
  knowledge_count: '答疑顾问',
  customer_satisfaction: '答疑顾问',
};

const INDICATOR_ORDER = ['online_rate', 'completion_rate', 'knowledge_count', 'customer_satisfaction'];

function getDefaultFormRows(): FormRow[] {
  return INDICATOR_ORDER.map(indicator => ({
    indicator,
    weight: '25',
    target: '',
    targetRole: DEFAULT_ROLES[indicator],
  }));
}

const INDICATOR_LABELS: Record<string, string> = {
  online_rate: '上线率',
  completion_rate: '验收率',
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
  const [formRows, setFormRows] = useState<FormRow[]>(getDefaultFormRows());
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
    setFormRows(getDefaultFormRows());
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (tmpl: KpiTemplate) => {
    setEditingTemplate(tmpl);
    setFormRows([{
      indicator: tmpl.indicator,
      weight: tmpl.weight,
      target: tmpl.target_value || '',
      targetRole: tmpl.target_role || '交付顾问',
    }]);
    setTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    // 验证
    for (const row of formRows) {
      if (!row.weight || parseFloat(row.weight) <= 0) {
        toast.error(`"${INDICATOR_LABELS[row.indicator]}"的权重不能为空`);
        return;
      }
    }
    setSavingTemplate(true);
    try {
      if (editingTemplate) {
        // 编辑单条
        const row = formRows[0];
        const res = await fetch(`/api/kpi/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({
            year,
            content: INDICATOR_LABELS[row.indicator] || row.indicator,
            indicator: row.indicator,
            weight: parseFloat(row.weight),
            target_value: row.target ? parseFloat(row.target) : null,
            target_role: row.targetRole,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        toast.success('KPI已更新');
      } else {
        // 批量新增
        const results = await Promise.all(
          formRows.map((row, idx) =>
            fetch('/api/kpi/templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
              body: JSON.stringify({
                year,
                content: INDICATOR_LABELS[row.indicator] || row.indicator,
                indicator: row.indicator,
                weight: parseFloat(row.weight),
                target_value: row.target ? parseFloat(row.target) : null,
                target_role: row.targetRole,
                sort_order: idx,
              }),
            })
          )
        );
        const failed = results.filter(r => !r.ok);
        if (failed.length > 0) {
          const errs = await Promise.all(failed.map(r => r.json()));
          throw new Error(errs[0]?.error || '部分保存失败');
        }
        toast.success(`已添加${formRows.length}项KPI`);
      }

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
        return progress?.manual_value ? parseFloat(progress.manual_value) : 100;
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
              {/* 表头 */}
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 rounded-lg">
                <div className="w-[70px] flex-shrink-0">考核对象</div>
                <div className="w-[90px] flex-shrink-0">考核内容</div>
                <div className="w-[50px] flex-shrink-0">权重</div>
                <div className="flex-1 min-w-[80px]">考核指标</div>
                <div className="w-28 flex-shrink-0">当前完成值</div>
                <div className="w-28 flex-shrink-0">累计完成率</div>
                {isAdmin && <div className="flex items-center gap-0.5 flex-shrink-0 w-[60px]">操作</div>}
              </div>

              {kpiData.templates.map((tmpl) => {
                const myProgress = kpiData.progress.find(p => p.template_id === tmpl.id);
                const actual = getActualValue(tmpl, myProgress);
                const completion = getCompletionRate(tmpl, myProgress);
                const isAutoCalculated = tmpl.indicator === 'online_rate' || tmpl.indicator === 'completion_rate';
                const isEditable = tmpl.indicator === 'knowledge_count' || tmpl.indicator === 'customer_satisfaction';

                return (
                  <div key={tmpl.id} className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50/50 transition-colors">
                    {/* 考核对象 */}
                    <div className="w-[70px] flex-shrink-0">
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        tmpl.target_role === '交付顾问' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {tmpl.target_role || '交付顾问'}
                      </span>
                    </div>

                    {/* 考核内容（指标名称） */}
                    <div className="w-[90px] flex-shrink-0">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', INDICATOR_COLORS[tmpl.indicator] || 'bg-gray-100')}>
                        {INDICATOR_LABELS[tmpl.indicator] || tmpl.indicator}
                      </span>
                    </div>

                    {/* 考核权重 */}
                    <div className="w-[50px] flex-shrink-0 text-xs text-gray-500 font-medium">
                      {tmpl.weight}%
                    </div>

                    {/* 考核指标（目标值） */}
                    <div className="flex-1 min-w-[80px]">
                      <span className="text-sm font-semibold text-gray-800">
                        {tmpl.target_value !== null && tmpl.target_value !== undefined ? `${tmpl.target_value}${tmpl.indicator === 'knowledge_count' ? '篇' : '%'}` : '-'}
                      </span>
                    </div>

                    {/* 当前完成值 */}
                    <div className="w-28 flex-shrink-0">
                      {isAutoCalculated ? (
                        <span className="text-sm font-semibold text-gray-800">{actual !== null ? `${actual}%` : '-'}</span>
                      ) : isEditable ? (
                        editingProgress?.templateId === tmpl.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              className="w-32 h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={editingProgress.value}
                              onChange={(e) => setEditingProgress({ templateId: tmpl.id, value: e.target.value })}
                              autoFocus
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSaveProgress(tmpl.id)} disabled={savingProgress}>
                              {savingProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingProgress(null)}>
                              <X className="h-4 w-4 text-gray-400" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
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

                    {/* 累计完成率 */}
                    <div className="w-28 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          {completion ? (
                            <div
                              className="h-1.5 rounded-full transition-all duration-500"
                              style={{
                                width: `${completion.rate}%`,
                                backgroundColor: completion.rate >= 100 ? '#22c55e' : '#ef4444',
                              }}
                            />
                          ) : (
                            <div className="h-1.5 w-0 rounded-full" />
                          )}
                        </div>
                        <span className={cn(
                          'text-xs font-medium w-9 text-right',
                          completion ? (completion.rate >= 100 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'
                        )}>
                          {completion?.label || '-'}
                        </span>
                      </div>
                    </div>

                    {/* 管理员操作 */}
                    {isAdmin && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
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

            {overall && (() => {
              const sumAllWeights = kpiData.templates.reduce((s, t) => s + (parseFloat(t.weight) || 0), 0);
              return sumAllWeights < 100 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  <Info className="h-3.5 w-3.5 flex-shrink-0" />
                  当前权重合计{sumAllWeights}%，建议调整为100%
                </div>
              );
            })()}
          </div>
        )}
      </CardContent>

      {/* 设置/编辑KPI弹窗 */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? '编辑考核项' : '新增考核项'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700 text-xs">考核对象</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700 text-xs">考核内容</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700 text-xs">指标类型</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700 text-xs">目标值</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700 text-xs">考核权重</th>
                </tr>
              </thead>
              <tbody>
                {formRows.map((row, index) => (
                  <tr key={index} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <Select
                        value={row.targetRole}
                        onValueChange={(v) => {
                          const newRows = [...formRows];
                          newRows[index] = { ...newRows[index], targetRole: v };
                          setFormRows(newRows);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" side="bottom">
                          <SelectItem value="交付顾问">交付顾问</SelectItem>
                          <SelectItem value="答疑顾问">答疑顾问</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('text-xs font-medium px-2 py-1 rounded-full border inline-block', INDICATOR_COLORS[row.indicator] || 'bg-gray-100')}>
                        {INDICATOR_LABELS[row.indicator] || row.indicator}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={row.indicator}
                        onValueChange={(v) => {
                          const newRows = [...formRows];
                          newRows[index] = { ...newRows[index], indicator: v };
                          setFormRows(newRows);
                        }}
                        disabled={!!editingTemplate}
                      >
                        <SelectTrigger className="h-8 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" side="bottom">
                          <SelectItem value="online_rate">上线率</SelectItem>
                          <SelectItem value="completion_rate">验收率</SelectItem>
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
                          value={row.target}
                          onChange={(e) => {
                            const newRows = [...formRows];
                            newRows[index] = { ...newRows[index], target: e.target.value };
                            setFormRows(newRows);
                          }}
                          placeholder="目标值"
                          min={0}
                          max={100}
                        />
                        <span className="text-xs text-gray-400">{row.indicator === 'knowledge_count' ? '篇' : '%'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          className="w-20 h-8 text-xs"
                          value={row.weight}
                          onChange={(e) => {
                            const newRows = [...formRows];
                            newRows[index] = { ...newRows[index], weight: e.target.value };
                            setFormRows(newRows);
                          }}
                          min={0}
                          max={100}
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">取消</Button>
            </DialogClose>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={saveTemplate} disabled={savingTemplate}>
              {savingTemplate && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingTemplate ? '保存修改' : `添加${formRows.length}项`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}