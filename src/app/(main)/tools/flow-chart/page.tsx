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
  Brain,
  Workflow,
  Layout,
  CheckCircle2,
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
  const [generatingStep, setGeneratingStep] = useState(0);
  const [error, setError] = useState('');
  const [drawioReady, setDrawioReady] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 生成步骤配置
  const generatingSteps = [
    { icon: Brain, text: '理解业务语义...', duration: 800 },
    { icon: Workflow, text: '匹配金蝶标准流程...', duration: 1200 },
    { icon: Layout, text: '构建流程图结构...', duration: 1500 },
    { icon: CheckCircle2, text: '优化布局与样式...', duration: 1000 },
  ];

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
    setGeneratingStep(0);
    setError('');

    // 模拟步骤进度
    let currentStep = 0;
    const stepInterval = setInterval(() => {
      if (currentStep < generatingSteps.length - 1) {
        currentStep++;
        setGeneratingStep(currentStep);
      }
    }, 1000);

    try {
      const response = await fetch('/api/tools/flow-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      clearInterval(stepInterval);

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || '生成失败，请稍后重试');
        return;
      }

      if (result.xml) {
        // 完成最后一步
        setGeneratingStep(generatingSteps.length - 1);
        // 短暂延迟后加载，让用户看到完成状态
        setTimeout(() => {
          sendLoad(result.xml);
          setLoading(false);
          setGeneratingStep(0);
        }, 500);
      } else {
        setError('生成的流程图数据为空');
        setLoading(false);
      }
    } catch (err) {
      clearInterval(stepInterval);
      console.error('生成流程图错误:', err);
      setError('网络错误，请稍后重试');
      setLoading(false);
      setGeneratingStep(0);
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

            {/* 生成进度显示 */}
            {loading && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="space-y-3">
                  {generatingSteps.map((step, index) => {
                    const StepIcon = step.icon;
                    const isActive = index === generatingStep;
                    const isCompleted = index < generatingStep;
                    
                    return (
                      <div 
                        key={index}
                        className={`flex items-center gap-3 transition-all duration-300 ${
                          isActive ? 'opacity-100' : isCompleted ? 'opacity-60' : 'opacity-30'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          isActive ? 'bg-blue-500 text-white' : 
                          isCompleted ? 'bg-green-500 text-white' : 'bg-slate-200'
                        }`}>
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <StepIcon className={`w-3.5 h-3.5 ${isActive ? 'animate-pulse' : ''}`} />
                          )}
                        </div>
                        <span className={`text-sm ${
                          isActive ? 'text-blue-700 font-medium' : 
                          isCompleted ? 'text-green-700' : 'text-slate-500'
                        }`}>
                          {step.text}
                        </span>
                        {isActive && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 ml-auto" />
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* 进度条 */}
                <div className="mt-4 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${((generatingStep + 1) / generatingSteps.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
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
          <div className="flex-1 bg-slate-100 relative">
            <iframe
              ref={iframeRef}
              src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
            />
            
            {/* 生成中遮罩 */}
            {loading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    {/* 外圈动画 */}
                    <div className="absolute inset-0 border-4 border-blue-100 rounded-full" />
                    <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin" />
                    {/* 中心图标 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {(() => {
                        const CurrentIcon = generatingSteps[generatingStep]?.icon || Brain;
                        return <CurrentIcon className="w-8 h-8 text-blue-500 animate-pulse" />;
                      })()}
                    </div>
                  </div>
                  <p className="text-slate-600 font-medium">
                    {generatingSteps[generatingStep]?.text || '生成中...'}
                  </p>
                  <p className="text-slate-400 text-sm mt-1">
                    步骤 {generatingStep + 1} / {generatingSteps.length}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
