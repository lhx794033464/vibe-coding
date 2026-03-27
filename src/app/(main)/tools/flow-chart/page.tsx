'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  GitBranch, 
  Loader2, 
  Sparkles,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

export default function FlowChartPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  // 生成流程图
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入流程图描述');
      return;
    }

    setLoading(true);
    setError('');
    setGeneratedUrl(null);

    try {
      const response = await fetch('/api/tools/flow-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          direction,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || '生成失败，请稍后重试');
        return;
      }

      if (result.mermaid) {
        // 构造 draw.io URL
        const encodedMermaid = encodeURIComponent(result.mermaid);
        const drawioUrl = `https://app.diagrams.net/?mermaid=${encodedMermaid}&create=1`;
        
        // 新窗口打开
        window.open(drawioUrl, '_blank');
        
        // 保存 URL 供用户再次点击
        setGeneratedUrl(drawioUrl);
      } else {
        setError('生成的流程图数据为空');
      }
    } catch (err) {
      console.error('生成流程图错误:', err);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 重新打开上次生成的流程图
  const handleReopen = () => {
    if (generatedUrl) {
      window.open(generatedUrl, '_blank');
    }
  };

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
            <p className="text-sm text-slate-500">使用自然语言描述，AI 自动生成可编辑的流程图</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          {/* 方向选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-3">布局方向</label>
            <div className="flex gap-3">
              <button
                onClick={() => setDirection('vertical')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'vertical'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ArrowDown className="w-4 h-4" />
                纵向（自上而下）
              </button>
              <button
                onClick={() => setDirection('horizontal')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'horizontal'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ArrowRight className="w-4 h-4" />
                横向（从左到右）
              </button>
            </div>
          </div>

          {/* 输入区域 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              流程描述
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !loading && prompt.trim()) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="请描述您想要的流程图，例如：用户登录流程，包括输入账号密码、验证、登录成功或失败..."
              className="min-h-[160px] resize-none text-base"
            />
            
            {/* 错误提示 */}
            {error && (
              <div className="mt-3 flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>

          {/* 生成按钮 */}
          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full h-12 text-base bg-blue-500 hover:bg-blue-600"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                AI 生成中...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                生成流程图
              </>
            )}
          </Button>

          {/* 重新打开按钮 */}
          {generatedUrl && !loading && (
            <Button
              onClick={handleReopen}
              variant="outline"
              className="w-full mt-3 h-12 text-base"
            >
              <ExternalLink className="w-5 h-5 mr-2" />
              重新打开流程图
            </Button>
          )}

          {/* 使用说明 */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-sm font-medium text-blue-700 mb-2">💡 使用说明</h4>
            <ul className="text-sm text-blue-600 space-y-1">
              <li>• 输入业务流程描述，AI 将生成 Mermaid 流程图</li>
              <li>• 流程图将在新窗口的 draw.io 编辑器中打开</li>
              <li>• 您可以在 draw.io 中自由编辑、调整布局、导出图片</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
