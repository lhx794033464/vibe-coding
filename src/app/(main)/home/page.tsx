'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Search, Sparkles, Bot, User, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
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
  const { session } = useAuth();
  const { messages: savedMessages, addMessage } = useChat();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const greeting = getGreeting();
  
  // 语音相关状态
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);

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

  // 文本转语音
  const speakText = useCallback(async (text: string) => {
    if (!session?.access_token || isSpeaking) return;
    
    try {
      setIsSpeaking(true);
      
      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();
      
      if (data.audioUri) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        audioRef.current = new Audio(data.audioUri);
        audioRef.current.onended = () => setIsSpeaking(false);
        audioRef.current.onerror = () => setIsSpeaking(false);
        audioRef.current.play();
      }
    } catch (error) {
      console.error('语音合成失败:', error);
      setIsSpeaking(false);
    }
  }, [session?.access_token, isSpeaking]);

  // 停止语音播放
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

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

  // 处理语音
  const processVoice = async (audioBlob: Blob) => {
    if (!session?.access_token) return;
    
    setIsProcessing(true);
    
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
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ base64Data }),
      });

      const asrData = await asrResponse.json();
      
      if (asrData.text) {
        // 添加用户消息
        const userMessage = asrData.text;
        setMessages(prev => [...prev, { role: 'user', content: userMessage, isVoice: true }]);
        
        // 调用语音操作API
        const actionResponse = await fetch('/api/voice/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ text: userMessage }),
        });

        const actionData = await actionResponse.json();
        
        if (actionData.success) {
          const assistantMessage = actionData.message;
          setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
          addMessage({ role: 'user', content: userMessage });
          addMessage({ role: 'assistant', content: assistantMessage });
          
          // 自动朗读回复
          if (autoSpeak) {
            speakText(assistantMessage);
          }
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
    
    // 添加用户消息
    const newUserMessage: Message = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, newUserMessage]);
    
    // 添加空的助手消息用于流式输出
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
    setLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          messages: [...savedMessages, { role: 'user', content: userMessage }],
          enableSearch: true,
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
          
          // 实时更新消息
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage.role === 'assistant') {
              lastMessage.content = assistantMessage;
            }
            return newMessages;
          });
        }
        
        // 标记流式结束
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            lastMessage.isStreaming = false;
          }
          return newMessages;
        });
        
        // 保存到全局状态
        addMessage({ role: 'user', content: userMessage });
        addMessage({ role: 'assistant', content: assistantMessage });
        
        // 自动朗读回复
        if (autoSpeak) {
          speakText(assistantMessage);
        }
      }
    } catch (error) {
      console.error('对话失败:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.content = '抱歉，我遇到了一些问题，请稍后再试。如果问题持续，可以联系金蝶官方技术支持。';
          lastMessage.isStreaming = false;
        }
        return newMessages;
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
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* 头部区域 */}
      <div className="flex-shrink-0 pt-6 pb-4 px-6 border-b border-slate-100">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">智能助手</h1>
              <p className="text-xs text-slate-500">{greeting}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 自动朗读开关 */}
            <button
              onClick={() => setAutoSpeak(!autoSpeak)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full transition-colors ${
                autoSpeak 
                  ? 'bg-emerald-100 text-emerald-600' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title={autoSpeak ? '点击关闭自动朗读' : '点击开启自动朗读'}
            >
              {autoSpeak ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  自动朗读
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  静音
                </>
              )}
            </button>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              在线 · 支持语音交互
            </div>
          </div>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="space-y-8 py-8">
              {/* 欢迎信息 */}
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-800 mb-2">
                    你好，我是智能助手
                  </h2>
                  <p className="text-slate-500 max-w-md mx-auto">
                    我是你的金蝶云星辰交付助手，可以帮你查询客户数据、解答产品问题、管理工作任务
                  </p>
                </div>
              </div>

              {/* 语音提示 */}
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                <Mic className="w-4 h-4" />
                <span>点击麦克风按钮开始语音对话，可以说"创建待办"、"预约会议"等</span>
              </div>

              {/* 快捷问题 */}
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 justify-center">
                  <Search className="w-4 h-4" />
                  试试这些问题
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {QUICK_QUESTIONS.map((q, index) => (
                    <button
                      key={index}
                      onClick={() => handleQuickQuestion(q.text)}
                      className="flex items-center gap-3 px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md transition-all group"
                    >
                      <span className="text-xl flex-shrink-0">{q.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate group-hover:text-blue-600 font-medium">
                          {q.text}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{q.category}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* 头像 */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    message.role === 'user' 
                      ? 'bg-blue-500' 
                      : 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500'
                  }`}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>
                  
                  {/* 消息内容 */}
                  <div className={`flex-1 ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                    {message.role === 'user' ? (
                      <div className="inline-block max-w-[85%] bg-blue-500 text-white px-4 py-3 rounded-2xl rounded-tr-md">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
                        {message.isVoice && (
                          <div className="flex items-center gap-1 mt-1 text-blue-200 text-xs">
                            <Mic className="w-3 h-3" />
                            语音输入
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="max-w-full bg-white border border-slate-200 rounded-2xl rounded-tl-md px-5 py-4 shadow-sm">
                        {message.isStreaming && !message.content ? (
                          <div className="flex items-center gap-2 text-slate-400">
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
                          <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5 rounded-sm"></span>
                        )}
                        {/* 播放按钮 */}
                        {!message.isStreaming && message.content && (
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
                            <button
                              onClick={() => isSpeaking ? stopSpeaking() : speakText(message.content)}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 transition-colors"
                            >
                              {isSpeaking ? (
                                <>
                                  <VolumeX className="w-3.5 h-3.5" />
                                  停止朗读
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3.5 h-3.5" />
                                  朗读回复
                                </>
                              )}
                            </button>
                          </div>
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
      <div className="flex-shrink-0 border-t border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto p-4">
          <form onSubmit={handleSubmit}>
            <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="问智能助手任何问题..."
                rows={1}
                className="flex-1 resize-none border-none outline-none bg-transparent px-3 py-2 text-slate-700 placeholder:text-slate-400 text-sm leading-relaxed"
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
                title={isRecording ? '点击停止录音' : '点击开始语音输入'}
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
          <p className="text-center text-xs text-slate-400 mt-2">
            按 Enter 发送 · Shift + Enter 换行 · 点击麦克风语音输入 · 支持语音创建待办、预约会议等
          </p>
        </div>
      </div>
    </div>
  );
}
