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
  Edit3,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import mermaid from 'mermaid';

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

// 初始化 mermaid
if (typeof window !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
    },
    securityLevel: 'loose',
  });
}

export default function FlowChartPage() {
  const { session } = useAuth();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [mermaidCode, setMermaidCode] = useState('');
  const [drawioXml, setDrawioXml] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedType, setCopiedType] = useState<'mermaid' | 'drawio' | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showDrawioTip, setShowDrawioTip] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState(false);

  // 渲染 mermaid 图表
  const renderMermaid = useCallback(async (code: string) => {
    if (!mermaidRef.current || !code) return;
    
    try {
      setRenderError(false);
      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, code);
      mermaidRef.current.innerHTML = svg;
    } catch (err) {
      console.error('Mermaid 渲染错误:', err);
      setRenderError(true);
      mermaidRef.current.innerHTML = `
        <div class="text-center text-red-500 p-4">
          <p class="font-medium">流程图渲染失败</p>
          <p class="text-sm text-slate-500 mt-2">请尝试重新生成或修改描述</p>
        </div>
      `;
    }
  }, []);

  // 当 mermaidCode 变化时渲染
  useEffect(() => {
    if (mermaidCode) {
      renderMermaid(mermaidCode);
    }
  }, [mermaidCode, renderMermaid]);

  // 生成流程图
  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('请输入业务流程描述');
      return;
    }

    setLoading(true);
    setError('');
    setMermaidCode('');
    setDrawioXml('');

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

      if (data.success && data.mermaid) {
        setMermaidCode(data.mermaid);
        setDrawioXml(data.drawio || '');
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

  // 打开 draw.io 网页版编辑
  const handleOpenDrawio = () => {
    setShowDrawioTip(true);
    // 先复制 XML 到剪贴板
    if (drawioXml) {
      navigator.clipboard.writeText(drawioXml);
    }
    // 打开 draw.io
    window.open('https://app.diagrams.net/', '_blank');
  };

  // 下载 .drawio 文件
  const handleDownloadDrawio = () => {
    if (!drawioXml) return;

    const blob = new Blob([drawioXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `业务流程图_${new Date().toISOString().slice(0, 10)}.drawio`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 下载 PNG 图片
  const handleDownloadPng = async () => {
    if (!mermaidRef.current) return;
    
    const svgElement = mermaidRef.current.querySelector('svg');
    if (!svgElement) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const svgRect = svgElement.getBoundingClientRect();
    const scale = 2;
    canvas.width = svgRect.width * scale;
    canvas.height = svgRect.height * scale;
    ctx.scale(scale, scale);

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, svgRect.width, svgRect.height);
      
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `业务流程图_${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // 下载 SVG 文件
  const handleDownloadSvg = () => {
    if (!mermaidRef.current) return;
    
    const svgElement = mermaidRef.current.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `业务流程图_${new Date().toISOString().slice(0, 10)}.svg`;
    link.click();
    
    URL.revokeObjectURL(url);
  };

  // 复制代码
  const handleCopy = async (type: 'mermaid' | 'drawio') => {
    const content = type === 'mermaid' ? mermaidCode : drawioXml;
    if (!content) return;
    
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setCopiedType(type);
      setTimeout(() => {
        setCopied(false);
        setCopiedType(null);
      }, 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 缩放控制
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setZoom(1);

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
              <p className="text-slate-500 text-sm">根据业务描述自动生成金蝶云星辰业务流程图，支持 draw.io 编辑</p>
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
                <li>• 生成的流程图会直接显示在右侧预览区</li>
                <li>• 点击"draw.io编辑"可直接跳转到 draw.io 网页版编辑</li>
                <li>• 支持金蝶云星辰标准单据：采购、销售、库存、财务、生产</li>
                <li>• 可导出为 PNG、SVG 图片或下载 .drawio 文件</li>
              </ul>
            </div>
          </div>

          {/* 右侧：预览区域 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-slate-400" />
                流程图预览
              </h3>
              {mermaidCode && (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* draw.io 编辑按钮 - 主要操作 */}
                  <button
                    onClick={handleOpenDrawio}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    draw.io 编辑
                  </button>
                  
                  {/* 缩放控制 */}
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                    <button
                      onClick={handleZoomOut}
                      className="p-1 rounded hover:bg-slate-200 text-slate-500"
                      title="缩小"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-500 min-w-[40px] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      className="p-1 rounded hover:bg-slate-200 text-slate-500"
                      title="放大"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleZoomReset}
                      className="p-1 rounded hover:bg-slate-200 text-slate-500"
                      title="重置"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* 导出按钮 */}
                  <button
                    onClick={handleDownloadPng}
                    className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg text-slate-500 hover:text-green-600 hover:bg-green-50 transition-colors"
                    title="下载 PNG"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PNG
                  </button>
                  <button
                    onClick={handleDownloadSvg}
                    className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                    title="下载 SVG"
                  >
                    <Download className="w-3.5 h-3.5" />
                    SVG
                  </button>
                </div>
              )}
            </div>

            {/* 流程图渲染区域 */}
            <div className="h-[500px] overflow-auto bg-slate-50 p-4">
              {!mermaidCode ? (
                <div className="h-full flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">输入业务流程描述后点击生成</p>
                    <p className="text-xs mt-1">流程图将在此显示</p>
                  </div>
                </div>
              ) : renderError ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
                    <p className="text-sm text-red-500">流程图渲染失败</p>
                    <Button
                      onClick={handleGenerate}
                      variant="outline"
                      className="mt-3"
                    >
                      重新生成
                    </Button>
                  </div>
                </div>
              ) : (
                <div 
                  ref={mermaidRef}
                  className="flex items-center justify-center min-h-full"
                  style={{ 
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.2s ease'
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* draw.io 使用提示 */}
        {showDrawioTip && drawioXml && (
          <div className="mt-6 bg-blue-50 rounded-xl border border-blue-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-700 mb-2">已为您打开 draw.io，请按以下步骤导入流程图：</h3>
                <ol className="text-xs text-blue-600 space-y-1.5 list-decimal list-inside">
                  <li>在 draw.io 中，点击菜单 <strong>文件</strong> → <strong>从设备导入</strong></li>
                  <li>选择刚才下载的 <strong>.drawio 文件</strong>（或按下方按钮重新下载）</li>
                  <li>流程图将加载到编辑器中，您可以自由编辑</li>
                </ol>
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={handleDownloadDrawio}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    下载 .drawio 文件
                  </button>
                  <button
                    onClick={() => handleCopy('drawio')}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                  >
                    {copied && copiedType === 'drawio' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        复制 XML
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowDrawioTip(false)}
                    className="text-xs text-blue-400 hover:text-blue-600"
                  >
                    关闭提示
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 操作区域 */}
        {mermaidCode && (
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-700">导出选项</h3>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleDownloadDrawio}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-all"
              >
                <div className="w-6 h-6 rounded bg-orange-100 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-orange-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-700">.drawio 文件</p>
                  <p className="text-xs text-slate-400">可在 draw.io 中编辑</p>
                </div>
              </button>
              
              <button
                onClick={handleDownloadPng}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all"
              >
                <div className="w-6 h-6 rounded bg-green-100 flex items-center justify-center">
                  <Download className="w-3.5 h-3.5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-700">PNG 图片</p>
                  <p className="text-xs text-slate-400">高清位图格式</p>
                </div>
              </button>
              
              <button
                onClick={handleDownloadSvg}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-all"
              >
                <div className="w-6 h-6 rounded bg-purple-100 flex items-center justify-center">
                  <Download className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-700">SVG 矢量图</p>
                  <p className="text-xs text-slate-400">可无损缩放</p>
                </div>
              </button>

              <button
                onClick={() => handleCopy('mermaid')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
              >
                <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center">
                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-700">
                    {copied && copiedType === 'mermaid' ? '已复制' : '复制 Mermaid 代码'}
                  </p>
                  <p className="text-xs text-slate-400">可粘贴到 mermaid.live</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
