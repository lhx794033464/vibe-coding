'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Search, User, Mic, MicOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChat } from '@/contexts/ChatContext';
import MessageContent from '@/components/chat/MessageContent';

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

// 消息类型
interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isVoice?: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const { messages: savedMessages, addMessage, clearMessages } = useChat();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isClearing, setIsClearing] = useState(false); // 清除动画状态
  const [showWelcome, setShowWelcome] = useState(true); // 是否显示欢迎页动画
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const greeting = getGreeting();
  const abortControllerRef = useRef<AbortController | null>(null); // 用于中断流式请求
  
  // 清除对话（带动画）
  const handleClearChat = () => {
    if (isClearing) return;
    
    // 中断正在进行的流式请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsClearing(true);
    setLoading(false); // 立即停止加载状态
    
    // 动画结束后清除数据
    setTimeout(() => {
      clearMessages();
      setMessages([]);
      setIsClearing(false);
      setShowWelcome(true); // 重置欢迎页动画状态
    }, 400); // 与动画时长一致
  };
  
  // 语音相关状态
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false); // 用于全局事件中获取最新状态

  // 同步录音状态到ref
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // 同步保存的消息
  useEffect(() => {
    setMessages(savedMessages.map(m => ({ ...m, isStreaming: false })));
  }, [savedMessages]);

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

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await processVoice(audioBlob);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('无法访问麦克风:', error);
      alert('无法访问麦克风，请检查权限设置');
    }
  }, []);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // 全局空格键监听 - 按住录音，松开发送
  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      // 只响应空格键
      if (e.code !== 'Space') return;
      
      // 如果正在录音或处理中，不响应
      if (isRecordingRef.current || isProcessing) return;
      
      // 检查是否在输入框中输入
      const activeElement = document.activeElement;
      const isInputFocused = activeElement === inputRef.current;
      
      // 如果输入框有焦点且有内容，允许正常输入空格
      if (isInputFocused && input.trim()) return;
      
      // 阻止默认行为
      e.preventDefault();
      
      // 开始录音
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            await processVoice(audioBlob);
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error('无法访问麦克风:', error);
      }
    };

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      // 只响应空格键
      if (e.code !== 'Space') return;
      
      // 如果正在录音，停止并发送
      if (isRecordingRef.current && mediaRecorderRef.current) {
        e.preventDefault();
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('keyup', handleGlobalKeyUp);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('keyup', handleGlobalKeyUp);
    };
  }, [isProcessing, input]); // 只依赖这些状态

  // 处理语音
  const processVoice = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setShowWelcome(false); // 发送消息时关闭欢迎页动画
    
    try {
      // 将音频转为base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      await new Promise<void>((resolve) => {
        reader.onloadend = () => resolve();
      });
      
      const base64Data = (reader.result as string).split(',')[1];

      // 调用语音识别API
      const asrResponse = await fetch('/api/voice/asr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64Data }),
      });

      const asrData = await asrResponse.json();
      console.log('ASR识别结果:', asrData);
      
      if (asrData.text) {
        // 添加用户消息
        const userMessage = asrData.text;
        setMessages(prev => [...prev, { role: 'user', content: userMessage, isVoice: true }]);
        
        // 调用语音操作API
        const actionResponse = await fetch('/api/voice/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: userMessage }),
        });

        const actionData = await actionResponse.json();
        console.log('语音操作结果:', actionData);
        
        if (actionData.success) {
          const assistantMessage = actionData.message;
          setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
          addMessage({ role: 'user', content: userMessage });
          addMessage({ role: 'assistant', content: assistantMessage });
          // 刷新页面数据，确保待办列表等其他组件能获取最新数据
          router.refresh();
        } else {
          const errorMessage = actionData.error || actionData.message || '操作失败';
          setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
        }
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: '抱歉，我没有听清楚，请再说一次。' 
        }]);
      }
    } catch (error) {
      console.error('语音处理失败:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '语音处理失败，请稍后重试。' 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent | string) => {
    const userMessage = typeof e === 'string' ? e : input.trim();
    if (!userMessage || loading) return;

    if (typeof e !== 'string') {
      e.preventDefault();
    }
    
    setInput('');
    setShowWelcome(false); // 发送消息时关闭欢迎页动画
    
    // 添加用户消息
    const newUserMessage: Message = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, newUserMessage]);
    
    // 添加空的助手消息用于流式输出
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
    setLoading(true);

    // 创建 AbortController 用于中断请求
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 从 localStorage 获取用户ID
      const userId = typeof window !== 'undefined' ? localStorage.getItem('local_user_id') : null;
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: [...savedMessages, { role: 'user', content: userMessage }],
          enableSearch: true,
          userId,
        }),
        signal: abortController.signal,
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
          
          // 实时更新消息
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            // 检查 lastMessage 是否存在且为助手消息
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content = assistantMessage;
            }
            return newMessages;
          });
        }
        
        // 标记流式结束
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          // 检查 lastMessage 是否存在且为助手消息
          if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.isStreaming = false;
          }
          return newMessages;
        });
        
        // 保存到全局状态
        addMessage({ role: 'user', content: userMessage });
        addMessage({ role: 'assistant', content: assistantMessage });
      }
    } catch (error) {
      // 如果是中断请求导致的错误，不显示错误信息
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      
      console.error('对话失败:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        // 检查 lastMessage 是否存在且为助手消息
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content = '抱歉，我遇到了一些问题，请稍后再试。如果问题持续，可以联系金蝶官方技术支持。';
          lastMessage.isStreaming = false;
        }
        return newMessages;
      });
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 输入框键盘事件处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter键：发送消息
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleQuickQuestion = (question: string) => {
    handleSubmit(question);
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* 头部区域 */}
      <div className="flex-shrink-0 pt-6 pb-4 px-6 border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden shadow-lg shadow-blue-500/20 bg-white">
              <img src="/assistant-avatar.png" alt="小蝶" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">小蝶</h1>
              <p className="text-xs text-muted-foreground">{greeting}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 清除对话按钮 */}
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                title="清除对话"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清除
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className={`space-y-8 py-8 ${showWelcome ? 'welcome-fade-in' : ''}`}>
              {/* 欢迎信息 */}
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full overflow-hidden mx-auto shadow-xl shadow-blue-500/20 bg-white">
                  <img src="/assistant-avatar.png" alt="小蝶" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    你好，我是小蝶
                  </h2>
                </div>
              </div>

              {/* 语音提示 */}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Mic className="w-4 h-4" />
                <span>空格长按语音输入，可以说"创建待办"、"预约会议"等</span>
              </div>

              {/* 快捷问题 - 移动端隐藏 */}
              <div className="hidden sm:block space-y-4">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 justify-center">
                  <Search className="w-4 h-4" />
                  试试这些问题
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {QUICK_QUESTIONS.map((q, index) => (
                    <button
                      key={index}
                      onClick={() => handleQuickQuestion(q.text)}
                      className="flex items-center gap-3 px-4 py-3.5 bg-white border border-border rounded-xl text-left hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md transition-all group"
                    >
                      <span className="text-xl flex-shrink-0">{q.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate group-hover:text-blue-600 font-medium">
                          {q.text}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{q.category}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={`space-y-6 ${isClearing ? 'message-fade-out' : ''}`}>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-4 message-fade-in ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* 头像 */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden ${
                    message.role === 'user' ? 'bg-blue-500 flex items-center justify-center' : 'rounded-full bg-white'
                  }`}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <img src="/assistant-avatar.png" alt="小蝶" className="w-full h-full object-contain" />
                    )}
                  </div>
                  
                  {/* 消息内容 */}
                  <div className={`flex-1 ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                    {message.role === 'user' ? (
                      <div className="inline-block max-w-[85%] bg-blue-500 text-white px-4 py-3 rounded-2xl rounded-tr-md shadow-sm">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
                        {message.isVoice && (
                          <div className="flex items-center gap-1 mt-1 text-blue-200 text-xs">
                            <Mic className="w-3 h-3" />
                            语音输入
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={`max-w-full bg-white border border-border rounded-2xl rounded-tl-md px-5 py-4 shadow-sm ${message.isStreaming ? 'streaming-text' : ''}`}>
                        {message.isStreaming && !message.content ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <div className="flex gap-1">
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                            <span className="text-sm">思考中...</span>
                          </div>
                        ) : (
                          <MessageContent content={message.content} />
                        )}
                        {message.isStreaming && message.content && (
                          <span className="inline-block w-2 h-4 bg-blue-500 typing-cursor ml-0.5 rounded-sm"></span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* 输入区域 */}
      <div className="flex-shrink-0 border-t border-border bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto p-4">
          <form onSubmit={handleSubmit}>
            <div className="flex items-end gap-3 bg-background border border-border rounded-2xl p-2 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  const newValue = e.target.value;
                  // 首字禁止输入空格：如果以空格开头，移除开头的所有空格
                  if (newValue.startsWith(' ')) {
                    setInput(newValue.replace(/^ +/, ''));
                  } else {
                    setInput(newValue);
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder={input.trim() ? "问小蝶任何问题..." : "空格长按语音输入，Enter发送..."}
                rows={1}
                className="flex-1 resize-none border-none outline-none bg-transparent px-3 py-2 text-slate-700 placeholder:text-muted-foreground text-sm leading-relaxed"
                style={{ maxHeight: '120px' }}
              />
              {/* 语音按钮 */}
              <Button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`rounded-xl h-10 w-10 p-0 flex-shrink-0 ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                }`}
                title={isRecording ? '松开空格或点击停止录音' : '空格长按或点击开始语音输入'}
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : isRecording ? (
                  <MicOff className="w-5 h-5 text-white" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </Button>
              {/* 发送按钮 */}
              <Button
                type="submit"
                disabled={!input.trim() || loading}
                className="rounded-xl h-10 w-10 p-0 flex-shrink-0 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
