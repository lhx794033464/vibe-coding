'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  GitBranch, 
  Loader2, 
  Sparkles,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';

export default function FlowChartPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flowchart, setFlowchart] = useState('');
  const [copied, setCopied] = useState(false);

  // 生成流程图
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入流程图描述');
      return;
    }

    setLoading(true);
    setError('');
    setFlowchart('');

    try {
      const response = await fetch('/api/tools/flow-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || '生成失败，请稍后重试');
        return;
      }

      if (result.flowchart) {
        setFlowchart(result.flowchart);
      } else {
        setError('生成的流程图为空');
      }
    } catch (err) {
      console.error('生成流程图错误:', err);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 复制到剪贴板
  const handleCopy = async () => {
    if (!flowchart) return;
    
    try {
      await navigator.clipboard.writeText(flowchart);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 示例提示词
  const examples = [
    'MRP运算后，缺料走采购流程，不缺料直接领料，最终都到生产领料',
    '销售订单下推生产任务单，物料齐套后生产入库，最后销售出库',
    '采购申请单审批通过后下推采购订单，收货后质检，合格入库',
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 页面标题 */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">业务流程图</h1>
            <p className="text-sm text-slate-500">使用自然语言描述，AI 自动生成结构化流程图</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧面板 */}
        <div className="w-96 bg-white border-r border-slate-200 flex flex-col">
          {/* 输入区域 */}
          <div className="p-4 border-b border-slate-200">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              流程描述
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="请描述您想要的流程图，例如：MRP运算后，缺料走采购流程，不缺料直接领料..."
              className="min-h-[120px] resize-none"
            />
            
            {/* 错误提示 */}
            {error && (
              <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* 生成按钮 */}
            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="w-full mt-3 bg-blue-500 hover:bg-blue-600"
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

          {/* 示例区域 */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">快速示例</h3>
            <div className="space-y-2">
              {examples.map((example, index) => (
                <button
                  key={index}
                  onClick={() => setPrompt(example)}
                  className="w-full text-left p-3 text-sm bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors border border-slate-200 hover:border-blue-200"
                >
                  {example}
                </button>
              ))}
            </div>

            {/* 使用说明 */}
            <div className="mt-6 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <h4 className="text-xs font-medium text-amber-700 mb-2">💡 使用说明</h4>
              <ul className="text-xs text-amber-600 space-y-1">
                <li>• 输入业务流程描述，AI 将自动生成流程图</li>
                <li>• 支持采购、生产、MRP、委外、销售等模块</li>
                <li>• 可描述分支逻辑（如缺料/不缺料）</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 右侧显示区域 */}
        <div className="flex-1 flex flex-col bg-slate-100">
          {/* 工具栏 */}
          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">流程图预览</span>
            {flowchart && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" />
                    复制
                  </>
                )}
              </Button>
            )}
          </div>

          {/* 流程图显示区域 */}
          <div className="flex-1 overflow-auto p-6">
            {flowchart ? (
              <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                <pre className="whitespace-pre-wrap font-mono text-sm text-slate-700 leading-relaxed">
                  {flowchart}
                </pre>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <GitBranch className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-sm">输入业务流程描述后点击生成</p>
                <p className="text-xs mt-1">AI 将自动生成结构化流程图</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
