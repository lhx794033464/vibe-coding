'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';

// 根据时间获取温馨提示语
function getGreeting(): string {
  const hour = new Date().getHours();
  
  if (hour < 9) {
    return '早上好，又是元气满满的一天';
  } else if (hour < 12) {
    return '上午好，工作顺利吗？';
  } else if (hour < 14) {
    return '中午好，记得休息一下';
  } else if (hour < 18) {
    return '下午好，继续加油';
  } else if (hour < 22) {
    return '晚上好，辛苦了一天';
  } else {
    return '夜深了，注意休息';
  }
}

// 快捷问题列表
const QUICK_QUESTIONS = [
  {
    icon: '💼',
    text: '我有哪些未上线客户？',
    category: '工作',
  },
  {
    icon: '📊',
    text: '我的客户上线率是多少？',
    category: '数据',
  },
  {
    icon: '📝',
    text: '今天有什么待办事项？',
    category: '待办',
  },
  {
    icon: '🔍',
    text: '金蝶云星辰凭证怎么导入？',
    category: '产品',
  },
  {
    icon: '⚙️',
    text: '进销存模块如何初始化？',
    category: '产品',
  },
  {
    icon: '💡',
    text: '客户说系统太复杂怎么处理？',
    category: '技巧',
  },
];

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

  const handleSubmit = async (e: React.FormEvent | string) => {
    const userMessage = typeof e === 'string' ? e : input.trim();
    if (!userMessage || loading) return;

    if (typeof e !== 'string') {
      e.preventDefault();
    }
    
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
          messages: [...messages, { role: 'user', content: userMessage }],
          enableSearch: true, // 启用联网搜索
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
        }
        
        // 完成后添加到全局状态
        addMessage({ role: 'assistant', content: assistantMessage });
      }
    } catch (error) {
      console.error('对话失败:', error);
      addMessage({ 
        role: 'assistant', 
        content: '抱歉，我遇到了一些问题，请稍后再试。如果问题持续，可以联系金蝶官方技术支持。' 
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

  const handleQuickQuestion = (question: string) => {
    handleSubmit(question);
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-blue-50/50 to-white">
      {/* 头部区域 */}
      <div className="flex-shrink-0 pt-6 pb-4 px-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-800">星辰助手</h1>
            <p className="text-sm text-gray-500">{greeting}</p>
          </div>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="space-y-6 py-8">
              {/* 欢迎信息 */}
              <div className="text-center space-y-3">
                <p className="text-lg text-gray-600">
                  我是你的金蝶云星辰交付助手
                </p>
                <p className="text-sm text-gray-400">
                  可以帮你查询客户数据、解答产品问题、管理工作任务
                </p>
              </div>

              {/* 快捷问题 */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  试试这些问题
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {QUICK_QUESTIONS.map((q, index) => (
                    <button
                      key={index}
                      onClick={() => handleQuickQuestion(q.text)}
                      className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-left hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                    >
                      <span className="text-lg">{q.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate group-hover:text-blue-600">
                          {q.text}
                        </p>
                        <p className="text-xs text-gray-400">{q.category}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 功能说明 */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center">
                  支持联网搜索金蝶云星辰相关知识和产品文档
                </p>
              </div>
            </div>
          )}
          
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-white text-gray-700 shadow-sm border border-gray-100 rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-700 shadow-sm border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span className="text-sm text-gray-500">星辰助手正在思考...</span>
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
              placeholder="问星辰助手任何问题..."
              rows={1}
              className="flex-1 resize-none border-none outline-none bg-transparent px-2 py-1.5 text-gray-700 placeholder:text-gray-400 text-sm"
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
            按 Enter 发送，Shift + Enter 换行 · 支持联网搜索
          </p>
        </form>
      </div>
    </div>
  );
}
