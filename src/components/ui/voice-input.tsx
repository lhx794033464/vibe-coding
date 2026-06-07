'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VoiceInputProps {
  /** 当前文本值，用于追加语音识别结果 */
  value: string;
  /** 文本变更回调 */
  onChange: (value: string) => void;
  /** 额外类名 */
  className?: string;
  /** 按钮大小 */
  size?: 'sm' | 'md';
}

export function VoiceInput({ value, onChange, className, size = 'sm' }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = useRef(value);
  const isStoppingRef = useRef(false);

  // 保持 valueRef 同步
  valueRef.current = value;

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsListening(false);
  }, []);

  const sendChunkForASR = useCallback(async (audioBlob: Blob) => {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          // 去掉 data:audio/webm;base64, 前缀
          const base64 = result.split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(audioBlob);
      const base64Data = await base64Promise;

      const response = await fetch('/api/voice/asr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data }),
      });

      if (!response.ok) {
        throw new Error(`ASR请求失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.text && data.text.trim()) {
        const baseText = valueRef.current;
        const separator = baseText && !baseText.endsWith('\n') ? '' : '';
        const newText = baseText + separator + data.text.trim();
        onChange(newText);
        valueRef.current = newText;
      }
    } catch (err) {
      console.error('语音识别失败:', err);
    }
  }, [onChange]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      isStoppingRef.current = false;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // 每3秒发送一次音频片段进行识别（流式效果）
      mediaRecorder.start(1000); // 每秒收集一次数据

      // 每3秒合并并发送
      timerRef.current = setInterval(() => {
        if (isStoppingRef.current) return;
        if (chunksRef.current.length > 0) {
          const audioChunks = [...chunksRef.current];
          chunksRef.current = [];
          const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
          sendChunkForASR(blob);
        }
      }, 3000);

      setIsListening(true);
    } catch (err: unknown) {
      console.error('启动录音失败:', err);
      const error = err as DOMException;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        toast.error('麦克风权限被拒绝，请在浏览器地址栏左侧点击图标允许麦克风访问');
      } else if (error.name === 'NotFoundError') {
        toast.error('未检测到麦克风设备');
      } else {
        toast.error('启动语音识别失败，请检查麦克风权限');
      }
      setIsListening(false);
    }
  }, [sendChunkForASR]);

  const handleStop = useCallback(() => {
    isStoppingRef.current = true;
    stopRecording();
    setIsProcessing(true);

    // 发送剩余的音频数据
    if (chunksRef.current.length > 0) {
      const audioChunks = [...chunksRef.current];
      chunksRef.current = [];
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const blob = new Blob(audioChunks, { type: mimeType });
      sendChunkForASR(blob).finally(() => {
        setIsProcessing(false);
        mediaRecorderRef.current = null;
      });
    } else {
      setIsProcessing(false);
      mediaRecorderRef.current = null;
    }
  }, [stopRecording, sendChunkForASR]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      handleStop();
    } else {
      startListening();
    }
  }, [isListening, startListening, handleStop]);

  const iconSize = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  const buttonSize = size === 'sm' ? 'h-10 w-10' : 'h-12 w-12';

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={toggleListening}
        disabled={isProcessing}
        className={cn(
          'inline-flex items-center justify-center rounded-full transition-all',
          buttonSize,
          isListening
            ? 'bg-red-100 text-red-600 hover:bg-red-200 animate-pulse'
            : isProcessing
            ? 'bg-amber-100 text-amber-600 cursor-wait'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          isProcessing && 'animate-pulse'
        )}
        title={isListening ? '停止语音录入' : isProcessing ? '识别中...' : '语音录入'}
      >
        {isListening ? (
          <MicOff className={iconSize} />
        ) : (
          <Mic className={iconSize} />
        )}
      </button>
      {/* 录音状态提示 */}
      {isListening && (
        <div className="absolute bottom-full right-0 mb-2 flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs text-white shadow-lg whitespace-nowrap z-50">
          <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />
          录音中，点击停止
        </div>
      )}
      {isProcessing && (
        <div className="absolute bottom-full right-0 mb-2 flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs text-white shadow-lg whitespace-nowrap z-50">
          <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />
          识别中...
        </div>
      )}
    </div>
  );
}
