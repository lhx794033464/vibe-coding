'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  GitBranch, 
  Loader2, 
  Download, 
  FileText, 
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Copy,
  Edit3
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

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
  const [xmlContent, setXmlContent] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const xmlRef = useRef<string>(''); // 用 ref 存储最新的 XML，避免闭包问题
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 监听 draw.io 编辑器的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 验证消息来源 - 支持多个可能的 origin
      const validOrigins = [
        'https://embed.diagrams.net',
        'https://app.diagrams.net',
        'https://diagrams.net'
      ];
      if (!validOrigins.includes(event.origin)) return;

      const msg = event.data;
      console.log('收到 draw.io 消息:', msg);
      
      // draw.io 初始化完成
      if (msg.event === 'init') {
        console.log('draw.io 编辑器初始化完成');
        setEditorReady(true);
        setLoadTimeout(false);
        
        // 清除超时定时器
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        // 如果已有 XML 内容，加载它
        const currentXml = xmlRef.current;
        if (currentXml) {
          console.log('加载已存在的 XML');
          setTimeout(() => {
            sendXmlToEditor(currentXml);
          }, 100);
        }
      }
      
      // 导出完成
      if (msg.event === 'export') {
        // 下载导出的文件
        const link = document.createElement('a');
        link.href = msg.data;
        link.download = `业务流程图_${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
      }
      
      // 保存事件
      if (msg.event === 'save') {
        setXmlContent(msg.xml);
        xmlRef.current = msg.xml;
      }
    };

    window.addEventListener('message', handleMessage);
    console.log('已添加消息监听器');

    return () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // iframe 加载完成处理
  const handleIframeLoad = useCallback(() => {
    console.log('iframe 加载完成');
    setIframeLoaded(true);
    
    // 设置超时检测
    timeoutRef.current = setTimeout(() => {
      if (!editorReady) {
        console.log('编辑器加载超时');
        setLoadTimeout(true);
      }
    }, 15000); // 15秒超时
  }, [editorReady]);

  // 发送 XML 到编辑器
  const sendXmlToEditor = useCallback((xml: string) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      console.log('发送 XML 到编辑器');
      // 获取 iframe 的 origin
      const iframeSrc = iframeRef.current.src;
      const targetOrigin = new URL(iframeSrc).origin;
      iframeRef.current.contentWindow.postMessage(
        {
          action: 'load',
          xml: xml,
          autosave: 1,
        },
        targetOrigin
      );
    }
  }, []);

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

      if (data.success && data.xml) {
        console.log('流程图生成成功');
        setXmlContent(data.xml);
        xmlRef.current = data.xml; // 同时更新 ref
        
        // 如果编辑器已经准备好，直接加载
        if (editorReady) {
          sendXmlToEditor(data.xml);
        }
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

  // 下载.drawio文件
  const handleDownload = () => {
    if (!xmlContent) return;

    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `业务流程图_${new Date().toISOString().slice(0, 10)}.drawio`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 导出为图片
  const handleExportPng = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      const iframeSrc = iframeRef.current.src;
      const targetOrigin = new URL(iframeSrc).origin;
      iframeRef.current.contentWindow.postMessage(
        {
          action: 'export',
          format: 'png',
          embedXml: false,
        },
        targetOrigin
      );
    }
  };

  // 复制XML
  const handleCopy = async () => {
    if (!xmlContent) return;
    
    try {
      await navigator.clipboard.writeText(xmlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 使用示例
  const useExample = (example: typeof EXAMPLE_FLOWS[0]) => {
    setDescription(example.detail);
    textareaRef.current?.focus();
  };

  return (
    <div className="h-full bg-slate-50 overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">业务流程图</h1>
              <p className="text-slate-500 text-sm">根据业务描述自动生成金蝶云星辰业务流程图，支持在线编辑</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：输入区域 */}
          <div className="space-y-4">
            {/* 示例卡片 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                快速示例
              </h3>
              <div className="space-y-2">
                {EXAMPLE_FLOWS.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => useExample(example)}
                    className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700 group-hover:text-blue-600">
                        {example.title}
                      </span>
                      <span className="text-xs text-slate-400 group-hover:text-blue-500">
                        点击使用
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{example.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 输入框 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                业务流程描述
              </h3>
              <textarea
                ref={textareaRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请描述业务流程，例如：&#10;&#10;商贸企业标准采购流程：业务员发起采购申请，审批后生成采购订单，供应商送货后做采购入库，收到发票后做采购发票，最后付款结算。&#10;&#10;支持的单据：采购申请单、采购订单、采购入库单、采购发票、付款单等"
                className="w-full h-40 p-3 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-700 placeholder:text-slate-400"
              />
              
              {/* 错误提示 */}
              {error && (
                <div className="mt-3 flex items-center gap-2 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {/* 生成按钮 */}
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleGenerate}
                  disabled={loading || !description.trim()}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6"
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
            </div>

            {/* 使用说明 */}
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <h3 className="text-sm font-medium text-amber-700 mb-2">💡 使用说明</h3>
              <ul className="text-xs text-amber-600 space-y-1.5">
                <li>• 生成的流程图会直接显示在右侧编辑器中</li>
                <li>• 支持金蝶云星辰标准单据：采购、销售、库存、财务、生产等模块</li>
                <li>• 描述越详细，生成的流程图越准确</li>
                <li>• 可导出为 .drawio 文件或 PNG 图片</li>
              </ul>
            </div>
          </div>

          {/* 右侧：编辑器区域 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-slate-400" />
                流程图编辑器
                {editorReady && (
                  <span className="text-xs text-green-500 ml-2">● 已就绪</span>
                )}
              </h3>
              {xmlContent && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        复制
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    .drawio
                  </button>
                  {editorReady && (
                    <button
                      onClick={handleExportPng}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      导出PNG
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* draw.io 编辑器 iframe */}
            <div className="h-[500px] relative">
              <iframe
                ref={iframeRef}
                src="https://app.diagrams.net/?embed=1&proto=json&ui=minimal&spin=0&splash=0&noSaveBtn=1"
                className="w-full h-full border-0"
                title="Draw.io 编辑器"
                onLoad={handleIframeLoad}
                allow="clipboard-read; clipboard-write;"
              />
              {/* 加载状态遮罩 */}
              {!iframeLoaded && !loadTimeout && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p className="mt-2 text-sm text-slate-500">加载编辑器...</p>
                    <p className="mt-1 text-xs text-slate-400">首次加载可能需要几秒钟</p>
                  </div>
                </div>
              )}
              {/* 加载超时提示 */}
              {loadTimeout && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-95">
                  <div className="text-center px-6 max-w-md">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 text-amber-500" />
                    <p className="text-sm font-medium text-slate-700 mb-2">编辑器加载超时</p>
                    <p className="text-xs text-slate-500 mb-4">
                      可能是网络原因导致编辑器无法加载。您可以：
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setLoadTimeout(false);
                          setIframeLoaded(false);
                          setEditorReady(false);
                          // 重新加载 iframe
                          if (iframeRef.current) {
                            iframeRef.current.src = iframeRef.current.src;
                          }
                        }}
                        className="w-full px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        重试加载
                      </button>
                      {xmlContent && (
                        <button
                          onClick={handleDownload}
                          className="w-full px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          下载 .drawio 文件在本地编辑
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* 等待生成的提示 */}
              {iframeLoaded && !editorReady && !loadTimeout && !xmlContent && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
                  <div className="text-center text-slate-400">
                    <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">输入业务流程描述后点击生成</p>
                    <p className="text-xs mt-1">流程图将在此显示并可编辑</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
