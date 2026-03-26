'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  GitBranch, 
  Loader2, 
  Sparkles,
  AlertCircle,
  RotateCcw,
  ArrowDown,
  ArrowRight,
} from 'lucide-react';

// 空白画布 XML
const EMPTY_XML = `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
  </root>
</mxGraphModel>`;

export default function FlowChartPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawioReady, setDrawioReady] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical');
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 向 draw.io 发送配置消息
  const sendConfigure = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        action: 'configure',
        config: {
          autosave: false,
          saveAndExit: false,
          noExitBtn: true,
          noSaveBtn: true,
          chrome: true,
          toolbar: true,
          noCloseBtn: true,
        }
      }),
      'https://embed.diagrams.net'
    );
  }, []);

  // 向 draw.io 发送加载消息
  const sendLoad = useCallback((xml: string) => {
    if (!iframeRef.current?.contentWindow) return;
    
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        action: 'load',
        xml: xml,
        autosave: 1
      }),
      'https://embed.diagrams.net'
    );
  }, []);

  // 监听 draw.io 消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 验证消息来源
      if (event.origin !== 'https://embed.diagrams.net') return;
      
      let data = event.data;
      
      // 处理字符串消息（可能是 JSON 字符串）
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          // 如果不是 JSON，保持原样
        }
      }
      
      console.log('收到 draw.io 消息:', data);
      
      // 处理 init 消息 - 编辑器已准备好
      if (data === 'init' || (typeof data === 'object' && data?.event === 'init')) {
        console.log('draw.io 编辑器已就绪');
        setDrawioReady(true);
        
        // 发送配置
        if (!isConfigured) {
          sendConfigure();
          setIsConfigured(true);
        }
        
        // 加载空白画布（必须发送 load 消息才能结束转圈）
        setTimeout(() => {
          sendLoad(EMPTY_XML);
        }, 100);
      }
      
      // 处理加载完成
      if (typeof data === 'object' && data?.event === 'load') {
        console.log('流程图加载完成');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isConfigured, sendConfigure, sendLoad]);

  // 生成流程图
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入流程图描述');
      return;
    }

    if (!drawioReady) {
      setError('编辑器尚未就绪，请稍后重试');
      return;
    }

    setLoading(true);
    setError('');

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

      if (result.xml) {
        // 向 draw.io iframe 发送加载消息
        sendLoad(result.xml);
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

  // 清空编辑器
  const handleClear = useCallback(() => {
    if (!drawioReady) return;
    
    sendLoad(EMPTY_XML);
    setPrompt('');
  }, [drawioReady, sendLoad]);

  // 示例提示词
  const examples = [
    '用户登录流程：输入账号密码 → 验证信息 → 登录成功/失败',
    '采购审批流程：提交申请 → 部门经理审批 → 财务审批 → 通过/驳回',
    '订单处理流程：接收订单 → 库存检查 → 发货 → 物流跟踪 → 完成',
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
            <p className="text-sm text-slate-500">使用自然语言描述，AI 自动生成可编辑的流程图</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧面板 */}
        <div className="w-96 bg-white border-r border-slate-200 flex flex-col">
          {/* 输入区域 */}
          <div className="p-4 border-b border-slate-200">
            {/* 方向选择 */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-2">布局方向</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDirection('vertical')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    direction === 'vertical'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  纵向
                </button>
                <button
                  onClick={() => setDirection('horizontal')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    direction === 'horizontal'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  横向
                </button>
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-700 mb-2">
              流程描述
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="请描述您想要的流程图，例如：用户登录流程，包括输入账号密码、验证、登录成功或失败..."
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
                <li>• 在编辑器中可拖拽节点、修改文本、调整布局</li>
              </ul>
            </div>
          </div>

          {/* 编辑器状态 */}
          <div className="p-3 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${drawioReady ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span className="text-slate-600">
                {drawioReady ? '编辑器已就绪' : '编辑器加载中...'}
              </span>
            </div>
          </div>
        </div>

        {/* 右侧编辑器区域 */}
        <div className="flex-1 flex flex-col">
          {/* 工具栏 */}
          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">draw.io 编辑器</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={!drawioReady}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                清空
              </Button>
            </div>
          </div>

          {/* draw.io iframe */}
          <div className="flex-1 bg-slate-100">
            <iframe
              ref={iframeRef}
              src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
