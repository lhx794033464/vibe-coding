'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { GitBranch, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// localStorage 键名
const LAST_TOOL_KEY = 'last-active-tool';

// 交付工具列表
const tools = [
  {
    id: 'flow-chart',
    title: '业务流程图',
    description: '使用自然语言描述，AI 自动生成可编辑的业务流程图（集成 draw.io）',
    icon: GitBranch,
    href: '/tools/flow-chart',
    color: 'bg-blue-50 text-blue-600',
    iconBg: 'bg-blue-100',
  },
];

export default function ToolsPage() {
  const router = useRouter();

  // 页面加载时检查是否有活跃的工具
  useEffect(() => {
    const lastTool = localStorage.getItem(LAST_TOOL_KEY);
    if (lastTool) {
      // 如果有活跃工具，自动跳转到该工具
      const tool = tools.find(t => t.id === lastTool);
      if (tool) {
        router.replace(tool.href);
      }
    }
  }, [router]);

  return (
    <div className="h-full bg-slate-50">
      <div className="p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">交付工具</h1>
          <p className="text-slate-500 mt-1">提升交付效率的专业工具集</p>
        </div>

        {/* 工具卡片网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.id} href={tool.href}>
                <Card className="h-full cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all duration-200 group rounded-2xl overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center">
                      {/* 图标 */}
                      <div className={`w-16 h-16 rounded-2xl ${tool.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}>
                        <Icon className={`w-8 h-8 ${tool.color.replace('bg-', 'text-')}`} />
                      </div>
                      {/* 标题 */}
                      <h3 className="font-semibold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">
                        {tool.title}
                      </h3>
                      {/* 描述 */}
                      <p className="text-sm text-slate-500 line-clamp-2">
                        {tool.description}
                      </p>
                      {/* 箭头 */}
                      <div className="mt-4 flex items-center gap-1 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        点击使用
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* 提示信息 */}
        <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-sm text-blue-700">
            💡 更多交付工具正在开发中，如有需求建议请联系产品团队
          </p>
        </div>
      </div>
    </div>
  );
}
