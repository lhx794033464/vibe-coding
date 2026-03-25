'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { 
  GitBranch, 
  Loader2, 
  Download, 
  FileText, 
  Sparkles,
  AlertCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Edit3,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { FlowData, FlowEditorRef } from '@/components/flow-editor/FlowEditor';

// 动态导入编辑器组件，禁用 SSR
const FlowEditor = dynamic(
  () => import('@/components/flow-editor/FlowEditor'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-slate-500">正在加载编辑器...</p>
        </div>
      </div>
    ),
  }
);

// 示例业务流程
const EXAMPLE_FLOWS = [
  {
    title: '商贸企业采购流程',
    description: '采购申请 → 采购订单 → 采购入库 → 采购发票 → 付款',
    detail: '商贸企业标准采购流程：业务员发起采购申请，审批后生成采购订单，供应商送货后做采购入库，收到发票后做采购发票，最后付款结算。',
  },
  {
    title: '商贸企业销售流程',
    description: '销售报价 → 销售订单 → 销售出库 → 销售发票 → 收款',
    detail: '商贸企业标准销售流程：客户询价后做销售报价单，确认后生成销售订单，仓库发货做销售出库，开票后做销售发票，最后收款结算。',
  },
  {
    title: '工贸企业生产流程',
    description: '生产计划 → 生产工单 → 生产领料 → 生产入库',
    detail: '工贸企业生产流程：根据销售订单生成生产计划，下达生产工单，仓库领料做生产领料单，完工后做生产入库单。',
  },
];

export default function FlowChartPage() {
  const { session } = useAuth();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [error, setError] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  
  const editorRef = useRef<FlowEditorRef>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 生成流程图
  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('请输入业务流程描述');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/tools/flow-chart', {
        method: 'POST',
        headers,
        body: JSON.stringify({ description: description.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '生成失败，请稍后重试');
        return;
      }

      if (data.success && data.flowData) {
        console.log('流程图生成成功:', data.flowData);
        setFlowData(data.flowData);
        
        // 设置编辑器数据
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.setData(data.flowData);
          }
        }, 100);
      } else {
        setError('生成的流程图格式不正确');
      }
    } catch (err) {
      console.error('生成失败:', err);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 导出 PNG
  const handleExportPng = async () => {
    if (editorRef.current) {
      await editorRef.current.exportAsImage('业务流程图');
    }
  };

  // 导出 JSON
  const handleExportJson = () => {
    if (editorRef.current) {
      editorRef.current.exportAsJson('业务流程图');
    }
  };

  // 清空画布
  const handleClear = () => {
    if (confirm('确定要清空画布吗？')) {
      if (editorRef.current) {
        editorRef.current.clearCanvas();
      }
      setFlowData(null);
    }
  };

  // 使用示例
  const useExample = (example: typeof EXAMPLE_FLOWS[0]) => {
    setDescription(example.detail);
    textareaRef.current?.focus();
  };

  return (
    <div className="h-full flex bg-slate-50 overflow-hidden">
      {/* 左侧面板 */}
      <div 
        className={`${
          showSidebar ? 'w-80' : 'w-0'
        } flex-shrink-0 border-r border-slate-200 bg-white transition-all duration-300 overflow-hidden`}
      >
        <div className="h-full flex flex-col w-80">
          {/* 左侧标题 */}
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-slate-800">业务流程图</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">根据业务描述自动生成金蝶云星辰流程图</p>
          </div>

          {/* 滚动区域 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 示例卡片 */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                快速示例
              </h3>
              {EXAMPLE_FLOWS.map((example, index) => (
                <button
                  key={index}
                  onClick={() => useExample(example)}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700 group-hover:text-blue-600 text-sm">
                      {example.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{example.description}</p>
                </button>
              ))}
            </div>

            {/* 输入框 */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                业务流程描述
              </h3>
              <textarea
                ref={textareaRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请描述业务流程，例如：&#10;&#10;商贸企业标准采购流程：业务员发起采购申请，审批后生成采购订单，供应商送货后做采购入库，收到发票后做采购发票，最后付款结算。"
                className="w-full h-32 p-3 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-700 placeholder:text-slate-400"
              />
              
              {/* 错误提示 */}
              {error && (
                <div className="flex items-center gap-2 text-red-500 text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {error}
                </div>
              )}

              {/* 生成按钮 */}
              <Button
                onClick={handleGenerate}
                disabled={loading || !description.trim()}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    生成流程图
                  </>
                )}
              </Button>
            </div>

            {/* 使用说明 */}
            <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
              <h3 className="text-xs font-medium text-amber-700 mb-1.5">💡 编辑操作说明</h3>
              <ul className="text-xs text-amber-600 space-y-1">
                <li>• <strong>添加节点</strong>：点击左侧节点面板</li>
                <li>• <strong>编辑文字</strong>：双击节点后输入</li>
                <li>• <strong>修改颜色</strong>：选中节点后点击右侧颜色</li>
                <li>• <strong>连接节点</strong>：拖拽节点上下圆点</li>
                <li>• <strong>删除</strong>：选中后按 Delete 键</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 折叠按钮 */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="absolute z-10 bg-white border border-slate-200 rounded-r-lg p-1 shadow-sm hover:bg-slate-50 transition-colors"
        style={{ 
          left: showSidebar ? '320px' : '0',
          top: '50%',
          transform: 'translateY(-50%)'
        }}
      >
        {showSidebar ? (
          <ChevronLeft className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {/* 右侧编辑器区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">流程图编辑器</span>
            {editorReady && (
              <span className="text-xs text-green-500 ml-2">● 已就绪</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 清空按钮 */}
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空
            </button>
            
            {/* 导出按钮 */}
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </button>
            <button
              onClick={handleExportPng}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-green-500 text-white hover:bg-green-600 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              导出PNG
            </button>
          </div>
        </div>

        {/* LogicFlow 编辑器容器 */}
        <div className="flex-1 relative">
          <FlowEditor
            ref={editorRef}
            data={flowData || undefined}
            onReady={() => setEditorReady(true)}
            onDataChange={(data) => {
              console.log('流程图数据已更新');
            }}
          />
          
          {/* 空状态提示 */}
          {!flowData && editorReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-slate-400">
                <GitBranch className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-sm">输入业务流程描述后点击生成</p>
                <p className="text-xs mt-1">或从左侧拖拽节点到画布进行编辑</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
