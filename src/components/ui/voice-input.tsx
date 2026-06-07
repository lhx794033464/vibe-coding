'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

// 浏览器 SpeechRecognition 类型声明
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function VoiceInput({ value, onChange, className, size = 'sm' }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const valueRef = useRef(value);

  // 保持 valueRef 同步
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // 组件卸载时停止录音
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      toast.error('当前浏览器不支持语音识别，请使用 Chrome 或 Edge');
      return;
    }

    // 如果正在录音，先停止
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    let finalTranscript = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }

      if (finalTranscript) {
        // 将最终结果追加到文本框
        const baseText = valueRef.current;
        const separator = baseText && !baseText.endsWith('\n') && !baseText.endsWith('') ? ' ' : '';
        const newText = baseText + separator + finalTranscript;
        onChange(newText);
        valueRef.current = newText;
        finalTranscript = '';
      }

      setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('语音识别错误:', event.error);
      if (event.error === 'not-allowed') {
        toast.error('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问');
      } else if (event.error === 'no-speech') {
        // 静音超时，不需要提示
      } else if (event.error !== 'aborted') {
        toast.error('语音识别出错，请重试');
      }
      setIsListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
      setInterimText('');
    } catch {
      toast.error('启动语音识别失败');
    }
  }, [onChange]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const isSupported = typeof window !== 'undefined' && !!getSpeechRecognition();

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const buttonSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={toggleListening}
        disabled={!isSupported}
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-all',
          buttonSize,
          isListening
            ? 'bg-red-100 text-red-600 hover:bg-red-200 animate-pulse'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          !isSupported && 'opacity-40 cursor-not-allowed'
        )}
        title={isListening ? '停止语音录入' : '语音录入'}
      >
        {isListening ? (
          <MicOff className={iconSize} />
        ) : (
          <Mic className={iconSize} />
        )}
      </button>
      {/* 流式识别中的临时文字 */}
      {isListening && interimText && (
        <div className="absolute bottom-full right-0 mb-1 max-w-[240px] rounded-md bg-foreground/90 px-2 py-1 text-xs text-background shadow-lg whitespace-pre-wrap break-all z-50">
          {interimText}
          <span className="inline-block w-1 h-3 bg-background/70 ml-0.5 animate-pulse" />
        </div>
      )}
    </div>
  );
}
