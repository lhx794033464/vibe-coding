'use client';

import { Card, CardContent } from '@/components/ui/card';
import { GitBranch, ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useFlowChart } from '@/contexts/FlowChartContext';

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
  {
    id: 'external-tool',
    title: '导账工具',
    description: '星空转星辰',
    icon: ExternalLink,
    href: 'https://5hy57sc23v.coze.site',
    color: 'bg-amber-50 text-amber-600',
    iconBg: 'bg-amber-100',
    external: true,
  },
];

export default function ToolsPage() {
  const { hasNotification } = useFlowChart();
  
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-4 sm:p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">交付工具</h1>
          <p className="text-slate-500 mt-1">提升交付效率的专业工具集</p>
        </div>

        {/* 工具卡片网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const showNotification = tool.id === 'flow-chart' && hasNotification;
            const isExternal = 'external' in tool && tool.external;
            const cardContent = (
              <Card className="h-full cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all duration-200 group rounded-2xl overflow-hidden relative">
                {/* 气泡通知 - 卡片右上角 */}
                {showNotification && (
                  <span className="absolute top-3 right-3 w-3 h-3 bg-red-500 rounded-full z-10 animate-pulse" />
                )}
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center">
                    {/* 图标 */}
                    <div className={`w-16 h-16 rounded-2xl ${tool.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200 relative`}>
                      <Icon className={`w-8 h-8 ${tool.color.replace('bg-', 'text-')}`} />
                    </div>
                    {/* 标题 */}
                    <h3 className="font-semibold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">
                      {tool.title}
                      {isExternal && <ExternalLink className="w-3.5 h-3.5 inline-block ml-1 opacity-50" />}
                    </h3>
                    {/* 描述 */}
                    <p className="text-sm text-slate-500 line-clamp-2">
                      {tool.description}
                    </p>
                    {/* 箭头 */}
                    <div className="mt-4 flex items-center gap-1 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isExternal ? '打开应用' : '点击使用'}
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );

            return isExternal ? (
              <a key={tool.id} href={tool.href} target="_blank" rel="noopener noreferrer">
                {cardContent}
              </a>
            ) : (
              <Link key={tool.id} href={tool.href}>
                {cardContent}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
