'use client';

import { useEffect } from 'react';
import { FileText } from 'lucide-react';

// localStorage 键名
const LAST_TOOL_KEY = 'last-active-tool';

export default function ToolsPage() {
  // 页面加载时清理localStorage中旧的工具状态
  useEffect(() => {
    const lastTool = localStorage.getItem(LAST_TOOL_KEY);
    if (lastTool) {
      // 清除已保存的工具状态
      localStorage.removeItem(LAST_TOOL_KEY);
      localStorage.removeItem('flow-chart-state');
    }
  }, []);
  return (
    <div className="h-full bg-slate-50">
      <div className="p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">交付工具</h1>
          <p className="text-slate-500 mt-1">提升交付效率的专业工具集</p>
        </div>

        {/* 空状态提示 */}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
            <FileText className="w-12 h-12 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700 mb-2">暂无可用工具</h3>
          <p className="text-slate-500 max-w-md">
            交付工具正在规划中，敬请期待...
          </p>
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
