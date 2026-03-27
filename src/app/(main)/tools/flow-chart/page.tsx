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
  PanelLeftClose,
  PanelLeftOpen,
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
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  // 保存当前流程图 XML，切换页面时不丢失
  const [savedXml, setSavedXml] = useState<string>(EMPTY_XML);
  
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
    // 更新保存的 XML
    setSavedXml(xml);
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
        
        // 加载保存的流程图（如果有）或空白画布
        setTimeout(() => {
          sendLoad(savedXml);
        }, 100);
      }
      
      // 处理加载完成
      if (typeof data === 'object' && data?.event === 'load') {
        console.log('流程图加载完成');
      }
      
      // 处理自动保存 - 实时保存当前 XML
      if (typeof data === 'object' && (data?.event === 'save' || data?.event === 'autosave')) {
        console.log('流程图已保存');
        if (data.xml) {
          setSavedXml(data.xml);
        }
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

    // 创建超时控制器
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000); // 65 秒超时

    try {
      const response = await fetch('/api/tools/flow-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          direction,
          simplified: simplifiedMode,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 处理超时或网络错误
      if (!response.ok) {
        const result = await response.json();
        
        if (response.status === 504 || response.status === 408) {
          setError('生成时间过长已超时。建议：\n1. 开启"简化模式"后重试\n2. 分段描述流程，每次不超过15个节点');
          return;
        }
        
        if (result.truncated) {
          setError('流程图内容过长被截断。建议：\n1. 开启"简化模式"后重试\n2. 分段描述流程\n3. 减少分支节点数量');
          return;
        }
        
        setError(result.error || '生成失败，请稍后重试');
        return;
      }

      const result = await response.json();

      if (result.xml) {
        // 向 draw.io iframe 发送加载消息
        sendLoad(result.xml);
      } else {
        setError('生成的流程图数据为空');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('生成流程图错误:', err);
      
      if (err instanceof Error) {
        if (err.name === 'AbortError' || err.message.includes('timeout')) {
          setError('请求已超时。建议简化流程描述，或分批生成复杂流程。');
        } else {
          setError('网络错误，请稍后重试');
        }
      } else {
        setError('网络错误，请稍后重试');
      }
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
        {isLeftPanelOpen && (
          <div className="w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 ease-in-out">
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

            {/* 简化模式 */}
            <div className="mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simplifiedMode}
                  onChange={(e) => setSimplifiedMode(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-600">简化模式（适合复杂流程）</span>
              </label>
              <p className="text-[10px] text-slate-400 mt-0.5 ml-6">
                缩短提示词以获得更快响应，但可能降低布局精确度
              </p>
            </div>

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

          {/* Tips 区域 */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <h4 className="text-xs font-medium text-red-600 mb-2">💡 使用提示</h4>
              <p className="text-xs text-red-500 mb-1">
                • 拖拽画布：Space+左键
              </p>
              <p className="text-xs text-red-500 mb-1">
                • 复杂流程（20+节点）建议开启"简化模式"
              </p>
              <p className="text-xs text-red-500 mb-1">
                • 生成失败时，请分段描述流程
              </p>
              <p className="text-xs text-red-500">
                • 例："先描述采购流程，再描述销售流程"
              </p>
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
        </div>)}

        {/* 右侧编辑器区域 */}
        <div className="flex-1 flex flex-col">
          {/* 工具栏 */}
          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                className="h-9 px-2.5"
                title={isLeftPanelOpen ? '收起侧边栏' : '展开侧边栏'}
              >
                {isLeftPanelOpen ? (
                  <PanelLeftClose className="w-5 h-5" />
                ) : (
                  <PanelLeftOpen className="w-5 h-5" />
                )}
              </Button>
              <span className="text-sm font-medium text-slate-700">draw.io 编辑器</span>
            </div>
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
