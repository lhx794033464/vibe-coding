'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Video, 
  Loader2, 
  Sparkles,
  AlertCircle,
  RotateCcw,
  Download,
  Play,
  Clock,
  Check,
  Film,
} from 'lucide-react';

export default function FlowVideoPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [genDuration, setGenDuration] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  // 生成视频
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入业务流程描述');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/tools/flow-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          duration: 6,
          ratio: '16:9',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || '生成失败，请稍后重试';
        const detailMsg = result.detail ? ` (${result.detail})` : '';
        setError(`${errorMsg}${detailMsg}`);
        return;
      }

      if (result.success && result.videoUrl) {
        setVideoUrl(result.videoUrl);
        setGenDuration(result.duration || 0);
        setShowSuccessDialog(true);
      } else {
        setError('生成的视频地址为空');
      }
    } catch (err) {
      console.error('生成视频错误:', err);
      setError('网络错误，请检查网络连接后重试');
    } finally {
      setLoading(false);
    }
  };

  // 下载视频
  const handleDownload = async () => {
    if (!videoUrl) return;
    
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `业务流程视频_${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('下载失败:', err);
      setError('视频下载失败');
    }
  };

  // 清空
  const handleClear = () => {
    setPrompt('');
    setVideoUrl('');
    setError('');
    setGenDuration(0);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 页面标题 */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Video className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">业务流程视频</h1>
            <p className="text-sm text-slate-500">输入业务流程描述，AI 自动生成流程演示短视频</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧面板 */}
        <div className="w-96 bg-white border-r border-slate-200 flex flex-col shrink-0">
          {/* 输入区域 */}
          <div className="p-4 border-b border-slate-200">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              流程描述
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="请描述业务流程，例如：销售订单 -> MRP运算 -> 采购申请 -> 采购入库 -> 销售出库 -> 收款"
              className="h-[200px] resize-none overflow-y-auto"
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
              className="w-full mt-3 bg-purple-500 hover:bg-purple-600"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  生成中，请耐心等待...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  生成视频
                </>
              )}
            </Button>

            {/* 清空按钮 */}
            <Button
              variant="outline"
              onClick={handleClear}
              className="w-full mt-2"
              disabled={loading}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              清空
            </Button>
          </div>

          {/* Tips 区域 */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
              <h4 className="text-xs font-medium text-purple-700 mb-2">💡 使用提示</h4>
              <ul className="text-xs text-purple-600 space-y-1">
                <li>• 视频生成约需 1-3 分钟</li>
                <li>• 描述越详细，生成效果越好</li>
                <li>• 支持多种箭头格式：--&gt;、→、-&gt;</li>
                <li>• 生成后可直接预览和下载</li>
              </ul>
            </div>
          </div>

          {/* 上次用时 */}
          {genDuration > 0 && (
            <div className="p-3 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                上次生成用时: {(genDuration / 1000).toFixed(1)} 秒
              </div>
            </div>
          )}
        </div>

        {/* 右侧预览区域 */}
        <div className="flex-1 flex flex-col">
          {/* 工具栏 */}
          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">视频预览</span>
            </div>
            {videoUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-1" />
                下载视频
              </Button>
            )}
          </div>

          {/* 视频预览 */}
          <div className="flex-1 bg-slate-900 flex items-center justify-center p-4">
            {videoUrl ? (
              <div className="w-full max-w-4xl">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full rounded-lg shadow-xl"
                  poster="/video-placeholder.png"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-slate-400">
                <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center">
                  <Film className="w-12 h-12" />
                </div>
                <p className="text-lg">输入流程描述后点击生成</p>
                <p className="text-sm text-slate-500">视频将在此处显示</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 成功弹窗 */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="w-5 h-5" />
              视频生成成功
            </DialogTitle>
            <DialogDescription>
              业务流程演示视频已生成完成
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              onClick={() => {
                setShowSuccessDialog(false);
                if (videoRef.current) {
                  videoRef.current.play();
                }
              }}
              size="lg"
              className="w-full"
            >
              <Play className="w-4 h-4 mr-2" />
              播放视频
            </Button>
            <Button
              onClick={() => {
                setShowSuccessDialog(false);
                handleDownload();
              }}
              variant="outline"
              size="lg"
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              下载视频
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
