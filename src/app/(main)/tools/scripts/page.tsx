'use client';

import { useState, useMemo, useCallback } from 'react';
import { scripts, scriptCategories, type ScriptItem } from '@/data/scripts';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Copy,
  Check,
  MessageSquareText,
  ChevronRight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ScriptsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedScript, setSelectedScript] = useState<ScriptItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 过滤话术
  const filteredScripts = useMemo(() => {
    let result = scripts;
    if (activeCategory) {
      result = result.filter((s) => s.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.content.toLowerCase().includes(q) ||
          s.scenario.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q) ||
          s.requirement.toLowerCase().includes(q)
      );
    }
    return result;
  }, [searchQuery, activeCategory]);

  // 按分类分组
  const groupedScripts = useMemo(() => {
    const groups: Record<string, ScriptItem[]> = {};
    for (const s of filteredScripts) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    }
    return groups;
  }, [filteredScripts]);

  // 各分类数量
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of scripts) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, []);

  const handleCopy = useCallback(async (script: ScriptItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(script.content);
      setCopiedId(script.id);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  }, []);

  const shortContent = (content: string, maxLen = 80) => {
    const oneLine = content.replace(/\n/g, ' ').trim();
    return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + '...' : oneLine;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-4 sm:p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">常用话术</h1>
          <p className="text-slate-500 mt-1">在线交付部标准话术，支持分类浏览与搜索</p>
        </div>

        {/* 搜索栏 */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜索话术内容、场景、角色..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-11 bg-white border-slate-200 rounded-xl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 分类标签 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <Badge
            variant={activeCategory === null ? 'default' : 'outline'}
            className="cursor-pointer whitespace-nowrap px-3 py-1.5 text-sm rounded-lg"
            onClick={() => setActiveCategory(null)}
          >
            全部 ({scripts.length})
          </Badge>
          {scriptCategories.map((cat) => (
            <Badge
              key={cat}
              variant={activeCategory === cat ? 'default' : 'outline'}
              className="cursor-pointer whitespace-nowrap px-3 py-1.5 text-sm rounded-lg"
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            >
              {cat} ({categoryCounts[cat] || 0})
            </Badge>
          ))}
        </div>

        {/* 话术列表 */}
        {filteredScripts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <MessageSquareText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>未找到匹配的话术</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedScripts).map(([category, items]) => (
              <div key={category}>
                {/* 分类标题 */}
                <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <span className="w-1 h-5 bg-blue-500 rounded-full" />
                  {category}
                  <span className="text-xs text-slate-400 font-normal">
                    {items.length} 条
                  </span>
                </h2>

                {/* 话术卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map((script) => (
                    <Card
                      key={script.id}
                      className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all duration-200 group rounded-xl"
                      onClick={() => setSelectedScript(script)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-slate-800 truncate">
                              {script.scenario}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => handleCopy(script, e)}
                            title="复制话术"
                          >
                            {copiedId === script.id ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-slate-400" />
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                          {shortContent(script.content)}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {script.role && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 rounded">
                              {script.role}
                            </Badge>
                          )}
                          {script.requirement && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 rounded border-amber-200 text-amber-600">
                              {shortContent(script.requirement, 20)}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex items-center text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          查看详情 <ChevronRight className="h-3 w-3" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 话术详情弹窗 */}
      <Dialog
        open={!!selectedScript}
        onOpenChange={(open) => !open && setSelectedScript(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh]">
          {selectedScript && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  {selectedScript.scenario}
                  <Badge variant="secondary" className="text-xs font-normal">
                    {selectedScript.category}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-2">
                <div className="space-y-4">
                  {/* 标准话术 */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      标准话术
                    </h4>
                    <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border border-slate-100">
                      {selectedScript.content}
                    </div>
                  </div>

                  {/* 要求及时效 */}
                  {selectedScript.requirement && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        要求及时效
                      </h4>
                      <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 whitespace-pre-wrap leading-relaxed border border-amber-100">
                        {selectedScript.requirement}
                      </div>
                    </div>
                  )}

                  {/* 使用角色 */}
                  {selectedScript.role && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        使用角色
                      </h4>
                      <div className="flex gap-2">
                        {selectedScript.role.split('/').map((r) => (
                          <Badge key={r} variant="outline" className="rounded-lg">
                            {r.trim()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="flex justify-end pt-2 border-t">
                <Button
                  onClick={() => handleCopy(selectedScript)}
                  className="gap-2"
                >
                  {copiedId === selectedScript.id ? (
                    <>
                      <Check className="h-4 w-4" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      复制话术
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
