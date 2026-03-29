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
  TrendingUp,
  Clock,
  Save,
  LogOut,
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
  // 保存当前流程图 XML，切换页面时不丢失
  const [savedXml, setSavedXml] = useState<string>(EMPTY_XML);
  // 流程图生成统计
  const [flowChartStats, setFlowChartStats] = useState({ totalGenerated: 0 });
  // 计时器
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastGenTime, setLastGenTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 获取流程图统计
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/tools/flow-chart/stats');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setFlowChartStats(result.data);
        }
      }
    } catch (err) {
      console.error('获取统计失败:', err);
    }
  }, []);

  // 页面加载时获取统计
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 清理计时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // 开始计时
  const startTimer = () => {
    setElapsedTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 0.1);
    }, 100);
  };

  // 停止计时
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 向 draw.io 发送配置消息
  const sendConfigure = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        action: 'configure',
        config: {
          autosave: false,
          saveAndExit: true,
          noExitBtn: false,
          noSaveBtn: false,
          chrome: true,
          toolbar: true,
          noCloseBtn: false,
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

  // 处理 draw.io 的导出（保存）
  const handleDrawioExport = useCallback((data: any) => {
    console.log('draw.io 导出数据:', data);
    
    if (data.xml) {
      const timestamp = new Date().toISOString();
      const saveData = {
        xml: data.xml,
        timestamp,
        name: data.name || `流程图_${new Date().toLocaleString()}`,
      };
      
      // 保存到 localStorage
      localStorage.setItem('flowchart_current', JSON.stringify(saveData));
      
      // 添加到历史记录
      const history = JSON.parse(localStorage.getItem('flowchart_history') || '[]');
      history.unshift(saveData);
      if (history.length > 10) history.pop();
      localStorage.setItem('flowchart_history', JSON.stringify(history));
      
      // 更新状态
      setSavedXml(data.xml);
      
      alert('流程图已保存到本地存储');
    }
  }, []);

  // 处理 draw.io 的退出
  const handleDrawioExit = useCallback(() => {
    console.log('draw.io 退出');
    const confirmExit = window.confirm('确定要退出编辑器吗？未保存的更改将丢失。');
    if (confirmExit) {
      sendLoad(EMPTY_XML);
      setPrompt('');
      alert('已退出编辑器');
    }
  }, [sendLoad]);

  // 手动保存当前流程图
  const handleManualSave = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !drawioReady) return;
    
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        action: 'export',
        format: 'xml',
      }),
      'https://embed.diagrams.net'
    );
  }, [drawioReady]);

  // 监听 draw.io 消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://embed.diagrams.net') return;
      
      let data = event.data;
      
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          // 如果不是 JSON，保持原样
        }
      }
      
      console.log('收到 draw.io 消息:', data);
      
      // 处理 init 消息
      if (data === 'init' || (typeof data === 'object' && data?.event === 'init')) {
        console.log('draw.io 编辑器已就绪');
        setDrawioReady(true);
        
        if (!isConfigured) {
          sendConfigure();
          setIsConfigured(true);
        }
        
        setTimeout(() => {
          sendLoad(savedXml);
        }, 100);
      }
      
      // 处理加载完成
      if (typeof data === 'object' && data?.event === 'load') {
        console.log('流程图加载完成');
        stopTimer();
        setLastGenTime(elapsedTime);
        setLoading(false);
      }
      
      // 处理保存/导出事件
      if (typeof data === 'object' && data?.event === 'export') {
        handleDrawioExport(data);
      }
      
      // 处理退出事件
      if (typeof data === 'object' && data?.event === 'exit') {
        handleDrawioExit();
      }
      
      // 处理自动保存
      if (typeof data === 'object' && (data?.event === 'save' || data?.event === 'autosave')) {
        console.log('流程图已保存');
        if (data.xml) {
          setSavedXml(data.xml);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isConfigured, sendConfigure, sendLoad, elapsedTime, handleDrawioExport, handleDrawioExit]);

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
    startTimer();

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
        stopTimer();
        setLoading(false);
        const errorMsg = result.error || '生成失败，请稍后重试';
        const detailMsg = result.detail ? ` (${result.detail})` : '';
        setError(`${errorMsg}${detailMsg}`);
        return;
      }

      if (result.xml && result.success) {
        sendLoad(result.xml);
        fetchStats();
      } else {
        stopTimer();
        setLoading(false);
        setError(result.error || '生成的流程图数据为空或格式错误');
      }
    } catch (err) {
      stopTimer();
      setLoading(false);
      console.error('生成流程图错误:', err);
      setError('网络错误，请检查网络连接后重试');
    }
  };

  // 清空编辑器
  const handleClear = useCallback(() => {
    if (!drawioReady) return;
    
    sendLoad(EMPTY_XML);
    setPrompt('');
    setLastGenTime(0);
    setElapsedTime(0);
  }, [drawioReady, sendLoad]);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 页面标题 */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">业务流程图</h1>
              <p className="text-sm text-slate-500">使用自然语言描述，AI 自动生成可编辑的流程图</p>
            </div>
          </div>
          {/* 统计信息 */}
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-700">
              已交付 <span className="font-bold text-blue-800">{flowChartStats.totalGenerated}</span> 张业务流程图
            </span>
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
                className="h-[250px] resize-none overflow-y-auto"
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
                    {elapsedTime < 5 ? 'AI生成中' : '渲染中'} {elapsedTime.toFixed(1)}s
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    生成流程图
                  </>
                )}
              </Button>

              {/* 上次用时显示 */}
              {lastGenTime > 0 && !loading && (
                <div className="mt-2 flex items-center justify-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  上次生成用时: {lastGenTime.toFixed(1)} 秒
                </div>
              )}
            </div>

            {/* Tips 区域 */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <h4 className="text-xs font-medium text-amber-700 mb-2">💡 使用提示</h4>
                <ul className="text-xs text-amber-600 space-y-1">
                  <li>• 拖拽画布：Space+左键</li>
                  <li>• 支持多种箭头格式：--&gt;、→、-&gt;</li>
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
            </div>
            <div className="flex items-center gap-2">
              {/* 手动保存按钮 */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualSave}
                disabled={!drawioReady}
              >
                <Save className="w-4 h-4 mr-1" />
                保存
              </Button>
              {/* 退出按钮 */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDrawioExit}
                disabled={!drawioReady}
              >
                <LogOut className="w-4 h-4 mr-1" />
                退出
              </Button>
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
