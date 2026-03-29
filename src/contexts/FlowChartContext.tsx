'use client';

import { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react';

// localStorage 缓存键
const FLOWCHART_CACHE_KEY = 'flowchart-cache-xml';
const FLOWCHART_NOTIFICATION_KEY = 'flowchart-has-notification';

interface FlowChartContextType {
  // 生成状态
  isGenerating: boolean;
  prompt: string;
  direction: 'vertical' | 'horizontal';
  error: string;
  elapsedTime: number;
  lastGenTime: number;
  generatedXml: string | null;
  
  // 通知状态
  hasNotification: boolean;
  
  // 状态更新函数
  setPrompt: (prompt: string) => void;
  setDirection: (direction: 'vertical' | 'horizontal') => void;
  setError: (error: string) => void;
  
  // 生成相关
  startGeneration: () => Promise<string | null>;
  cancelGeneration: () => void;
  resetState: () => void;
  
  // XML 相关
  setGeneratedXml: (xml: string) => void;
  getSavedXml: () => string;
  saveXml: (xml: string) => void;
  
  // 通知相关
  clearNotification: () => void;
}

const FlowChartContext = createContext<FlowChartContextType | undefined>(undefined);

export function FlowChartProvider({ children }: { children: ReactNode }) {
  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical');
  const [error, setError] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastGenTime, setLastGenTime] = useState(0);
  const [generatedXml, setGeneratedXml] = useState<string | null>(null);
  
  // 通知状态
  const [hasNotification, setHasNotification] = useState(false);
  
  // 使用 ref 存储 AbortController 和计时器，避免触发重渲染
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const generatingRef = useRef(false); // 用于追踪生成状态
  const startTimeRef = useRef<number>(0); // 存储开始时间
  
  // 初始化时从 localStorage 读取通知状态
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedNotification = localStorage.getItem(FLOWCHART_NOTIFICATION_KEY);
      if (savedNotification === 'true') {
        setHasNotification(true);
      }
    }
  }, []);
  
  // 清除通知
  const clearNotification = useCallback(() => {
    setHasNotification(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(FLOWCHART_NOTIFICATION_KEY);
    }
  }, []);
  
  // 清理计时器
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  
  // 开始计时
  const startTimer = useCallback(() => {
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    clearTimer();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsedTime(elapsed);
    }, 100);
  }, [clearTimer]);
  
  // 停止计时
  const stopTimer = useCallback(() => {
    clearTimer();
  }, [clearTimer]);
  
  // 取消生成
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopTimer();
    setIsGenerating(false);
    generatingRef.current = false;
  }, [stopTimer]);
  
  // 开始生成
  const startGeneration = useCallback(async (): Promise<string | null> => {
    if (!prompt.trim()) {
      setError('请输入流程图描述');
      return null;
    }
    
    // 如果已经在生成中，直接返回
    if (generatingRef.current) {
      return null;
    }
    
    setIsGenerating(true);
    generatingRef.current = true;
    setError('');
    startTimer();
    
    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch('/api/tools/flow-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          direction,
        }),
        signal: abortControllerRef.current.signal,
      });

      const result = await response.json();
      stopTimer();

      if (!response.ok) {
        const errorMsg = result.error || '生成失败，请稍后重试';
        const detailMsg = result.detail ? ` (${result.detail})` : '';
        setError(`${errorMsg}${detailMsg}`);
        setIsGenerating(false);
        generatingRef.current = false;
        return null;
      }

      if (result.xml && result.success) {
        setGeneratedXml(result.xml);
        // 设置通知状态（后台生成完成）
        setHasNotification(true);
        localStorage.setItem(FLOWCHART_NOTIFICATION_KEY, 'true');
        // 计算实际用时
        const actualTime = (Date.now() - startTimeRef.current) / 1000;
        setLastGenTime(actualTime);
        setIsGenerating(false);
        generatingRef.current = false;
        return result.xml;
      } else {
        setError(result.error || '生成的流程图数据为空或格式错误');
        setIsGenerating(false);
        generatingRef.current = false;
        return null;
      }
    } catch (err) {
      stopTimer();
      // 如果是被取消的错误，不显示错误信息
      if (err instanceof Error && err.name === 'AbortError') {
        setIsGenerating(false);
        generatingRef.current = false;
        return null;
      }
      console.error('生成流程图错误:', err);
      setError('网络错误，请检查网络连接后重试');
      setIsGenerating(false);
      generatingRef.current = false;
      return null;
    }
  }, [prompt, direction, startTimer, stopTimer, elapsedTime]);
  
  // 重置状态
  const resetState = useCallback(() => {
    cancelGeneration();
    setPrompt('');
    setError('');
    setLastGenTime(0);
    setElapsedTime(0);
    setGeneratedXml(null);
  }, [cancelGeneration]);
  
  // 获取保存的 XML
  const getSavedXml = useCallback(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(FLOWCHART_CACHE_KEY) || '';
    }
    return '';
  }, []);
  
  // 保存 XML 到 localStorage
  const saveXml = useCallback((xml: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(FLOWCHART_CACHE_KEY, xml);
    }
  }, []);
  
  // 清理计时器（组件卸载时）
  // 注意：不取消正在进行的请求，让它在后台继续
  // 只清理计时器避免内存泄漏
  
  return (
    <FlowChartContext.Provider value={{
      isGenerating,
      prompt,
      direction,
      error,
      elapsedTime,
      lastGenTime,
      generatedXml,
      hasNotification,
      setPrompt,
      setDirection,
      setError,
      startGeneration,
      cancelGeneration,
      resetState,
      setGeneratedXml,
      getSavedXml,
      saveXml,
      clearNotification,
    }}>
      {children}
    </FlowChartContext.Provider>
  );
}

export function useFlowChart() {
  const context = useContext(FlowChartContext);
  if (context === undefined) {
    throw new Error('useFlowChart must be used within a FlowChartProvider');
  }
  return context;
}
