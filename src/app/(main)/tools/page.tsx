'use client';

import { Card, CardContent } from '@/components/ui/card';
import { GitBranch, ArrowRight, ArrowLeftRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useFlowChart } from '@/contexts/FlowChartContext';
import { useAuth } from '@/contexts/AuthContext';

// 交付工具列表
const baseTools = [
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
    id: 'data-transfer',
    title: '导账工具',
    description: 'YonSuite转精斗云',
    icon: ArrowLeftRight,
    href: '/tools/data-transfer',
    color: 'bg-green-50 text-green-600',
    iconBg: 'bg-green-100',
  },
];

// 管理员专属工具
const adminTools = [
  {
    id: 'user-management',
    title: '用户管理',
    description: '管理系统用户和权限，添加/编辑/禁用用户账号',
    icon: Users,
    href: '/delivery-tools/users',
    color: 'bg-purple-50 text-purple-600',
    iconBg: 'bg-purple-100',
  },
];

export default function ToolsPage() {
  const { hasNotification } = useFlowChart();
  const { isAdmin } = useAuth();
  
  // 根据权限显示不同的工具列表
  const tools = isAdmin ? [...baseTools, ...adminTools] : baseTools;
  
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
            const showNotification = tool.id === 'flow-chart' && hasNotification;
            
            return (
              <Link key={tool.id} href={tool.href}>
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
      </div>
    </div>
  );
}
