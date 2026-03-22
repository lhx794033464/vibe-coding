'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';

// 根据时间获取温馨提示语
function getGreeting(): string {
  const hour = new Date().getHours();
  
  if (hour < 9) {
    return '又是元气满满的一天~ ☀️';
  } else if (hour < 13) {
    return '你认真工作的样子真的很迷人~ ✨';
  } else if (hour < 17) {
    return '来杯咖啡提提神~ ☕';
  } else if (hour < 19) {
    return '再忍忍，马上就下班了~ 💪';
  } else {
    return '工作再忙也要注意身体~ 🌙';
  }
}

export default function HomePage() {
  const { session } = useAuth();
  const { messages, addMessage } = useChat();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const greeting = getGreeting();

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 自动调整输入框高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    addMessage({ role: 'user', content: userMessage });
    setLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 添加认证token
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          messages: [...messages, { role: 'user', content: userMessage }] 
        }),
      });

      if (!response.ok) {
        throw new Error('请求失败');
      }

      // 流式读取响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          assistantMessage += chunk;
          
          // 实时更新消息 - 使用局部状态临时存储
        }
        
        // 完成后添加到全局状态
        addMessage({ role: 'assistant', content: assistantMessage });
      }
    } catch (error) {
      console.error('对话失败:', error);
      addMessage({ 
        role: 'assistant', 
        content: '抱歉，我遇到了一些问题，请稍后再试。' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-blue-50/50 to-white">
      {/* 温馨提示语 - 左对齐 */}
      <div className="flex-shrink-0 pt-8 pb-6 px-8">
        <h1 className="text-xl font-medium text-gray-600 tracking-wide">
          {greeting}
        </h1>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center min-h-[300px]">
              <p className="text-2xl font-bold text-gray-700 text-center">
                我是你的AI助手，随时为你服务
              </p>
            </div>
          )}
          
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-white text-gray-700 shadow-sm border border-gray-100 rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-700 shadow-sm border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="flex-shrink-0 p-4 md:p-6 bg-white/80 backdrop-blur-sm border-t border-gray-100">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div className="flex items-end gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-2 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              rows={1}
              className="flex-1 resize-none border-none outline-none bg-transparent px-2 py-1.5 text-gray-700 placeholder:text-gray-400"
              style={{ maxHeight: '120px' }}
            />
            <Button
              type="submit"
              disabled={!input.trim() || loading}
              className="rounded-xl h-10 w-10 p-0 flex-shrink-0"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">
            按 Enter 发送，Shift + Enter 换行
          </p>
        </form>
      </div>
    </div>
  );
}
