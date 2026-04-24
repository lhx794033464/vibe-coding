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
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import Link from 'next/link';
import { useFlowChart } from '@/contexts/FlowChartContext';

// 空白画布 XML
const EMPTY_XML = `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
  </root>
</mxGraphModel>`;

export default function FlowChartPage() {
  // 从 Context 获取状态和方法
  const {
    isGenerating,
    prompt,
    direction,
    layoutStyle,
    error,
    elapsedTime,
    lastGenTime,
    generatedXml,
    setPrompt,
    setDirection,
    setLayoutStyle,
    setError,
    startGeneration,
    resetState,
    setGeneratedXml,
    getSavedXml,
    saveXml,
    clearNotification,
  } = useFlowChart();
  
  const [drawioReady, setDrawioReady] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastLoadedXmlRef = useRef<string>(''); // 追踪上次加载的 XML，避免重复加载

  // 进入页面时清除通知
  useEffect(() => {
    clearNotification();
  }, [clearNotification]);

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
    
    // 避免重复加载相同的 XML
    if (lastLoadedXmlRef.current === xml) return;
    lastLoadedXmlRef.current = xml;
    
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        action: 'load',
        xml: xml,
        autosave: 1
      }),
      'https://embed.diagrams.net'
    );
    saveXml(xml);
  }, [saveXml]);

  // 监听 generatedXml 变化，自动加载到编辑器
  useEffect(() => {
    if (generatedXml && drawioReady && generatedXml !== lastLoadedXmlRef.current) {
      sendLoad(generatedXml);
    }
  }, [generatedXml, drawioReady, sendLoad]);

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
        
        // 加载保存的流程图（如果有）或检查是否有正在生成的 XML
        setTimeout(() => {
          if (generatedXml) {
            sendLoad(generatedXml);
          } else {
            const savedXml = getSavedXml();
            if (savedXml) {
              sendLoad(savedXml);
            } else {
              sendLoad(EMPTY_XML);
            }
          }
        }, 100);
      }
      
      // 处理加载完成
      if (typeof data === 'object' && data?.event === 'load') {
        console.log('流程图加载完成');
      }
      
      // 处理自动保存 - 实时保存当前 XML 到 localStorage
      if (typeof data === 'object' && (data?.event === 'save' || data?.event === 'autosave')) {
        console.log('流程图已保存');
        if (data.xml) {
          saveXml(data.xml);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isConfigured, sendConfigure, sendLoad, generatedXml, getSavedXml, saveXml]);

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

    const xml = await startGeneration();
    if (xml) {
      // 向 draw.io iframe 发送加载消息
      sendLoad(xml);
    }
  };

  // 清空编辑器
  const handleClear = useCallback(() => {
    if (!drawioReady) return;
    
    sendLoad(EMPTY_XML);
    resetState();
  }, [drawioReady, sendLoad, resetState]);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 顶部导航栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Link href="/tools" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          返回
        </Link>
        <h1 className="text-lg font-semibold">业务流程图</h1>
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
                    disabled={isGenerating}
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
                    disabled={isGenerating}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    横向
                  </button>
                </div>
              </div>

              {/* 布局风格选择 */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600 mb-2">布局风格</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLayoutStyle('regular')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      layoutStyle === 'regular'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    disabled={isGenerating}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    常规
                  </button>
                  <button
                    onClick={() => setLayoutStyle('swimlane')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      layoutStyle === 'swimlane'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    disabled={isGenerating}
                  >
                    <Rows3 className="w-3.5 h-3.5" />
                    泳道图
                  </button>
                </div>
              </div>

              <label className="block text-sm font-medium text-slate-700 mb-2">
                流程描述
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isGenerating && prompt.trim()) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder="请简明扼要地描述您的业务流程，如有分支或返回结构请描述清楚。例如：如果质量有问题则退货，如果产品不合格则重新执行生产"
                className="h-[200px] resize-none overflow-y-auto"
                disabled={isGenerating}
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
                disabled={isGenerating || !prompt.trim()}
                className="w-full mt-3 bg-blue-500 hover:bg-blue-600"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    生成中 {elapsedTime.toFixed(1)}s
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    生成流程图
                  </>
                )}
              </Button>

              {/* 上次用时显示 */}
              {lastGenTime > 0 && !isGenerating && (
                <div className="mt-2 flex items-center justify-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  上次生成用时: {lastGenTime.toFixed(1)} 秒
                </div>
              )}
            </div>

            {/* Tips 区域 */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <h4 className="text-xs font-bold text-amber-700 mb-2">💡 Tips</h4>
                <ul className="text-xs text-amber-600 space-y-1">
                  <li>• 拖拽画布：Space+左键</li>
                  <li>• 支持异步生成，生成过程中可浏览其他界面</li>
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
                {isGenerating && (
                  <span className="text-blue-500 ml-2">· 正在生成...</span>
                )}
              </div>
            </div>
          </div>
        )}

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
              {isGenerating && (
                <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full animate-pulse">
                  后台生成中...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={!drawioReady || isGenerating}
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
