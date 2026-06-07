'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { Headphones, Link as LinkIcon, FileText, AlertCircle, CheckCircle2, Clock, Loader2, Video } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function MeetingMinutesPage() {
  const { getAuthHeader } = useAuth();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/meetings/minutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ input: input.trim() }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || '提取失败');
      } else {
        setResult(data.data);
      }
    } catch (e: any) {
      setError(e.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">会议纪要提取</h1>
          <p className="text-slate-500 mt-1">输入腾讯会议回放链接或会议 ID，提取会议转写文字和智能纪要</p>
        </div>

        {/* 输入区 */}
        <Card className="mb-6">
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4">
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="粘贴腾讯会议回放链接或直接输入会议 ID..."
                  className="pl-10 pr-4 h-12 text-base"
                  disabled={loading}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  支持格式：meeting.tencent.com/replay/xxx 或纯会议 ID
                </p>
                <Button onClick={handleSubmit} disabled={loading || !input.trim()}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      正在提取...
                    </>
                  ) : (
                    <>
                      <Headphones className="w-4 h-4 mr-2" />
                      提取纪要
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 错误提示 */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-800">提取失败</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
                {error.includes('凭证未配置') && (
                  <div className="mt-2 text-sm text-red-700 bg-red-100 p-3 rounded-lg">
                    <p className="font-medium mb-1">需要配置腾讯会议 API 凭证：</p>
                    <code className="block text-xs">
                      TENCENT_MEETING_APP_ID=你的AppID<br />
                      TENCENT_MEETING_SECRET_ID=你的SecretID<br />
                      TENCENT_MEETING_SECRET_KEY=你的SecretKey
                    </code>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 结果区 */}
        {result && (
          <div className="space-y-4">
            {/* 会议信息 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Video className="w-5 h-5 text-blue-600" />
                  会议信息
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">会议 ID</span>
                    <p className="font-medium">{result.meetingId}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">会议主题</span>
                    <p className="font-medium">{result.meetingInfo?.subject || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">会议时间</span>
                    <p className="font-medium">
                      {result.meetingInfo?.start_time ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(result.meetingInfo.start_time).toLocaleString('zh-CN')}
                        </span>
                      ) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">录制数量</span>
                    <p className="font-medium">{result.recordings?.length || 0} 个</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">会议状态</span>
                    <p className="font-medium">{result.meetingInfo?.status === 1 ? '进行中' : result.meetingInfo?.status === 2 ? '已结束' : '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 消息提示 */}
            {result.message && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-800">{result.message}</p>
                </CardContent>
              </Card>
            )}

            {/* 转写结果 */}
            {result.transcript?.paragraphs?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    会议转写
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {result.transcript.paragraphs.map((p: any, i: number) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="text-muted-foreground shrink-0 w-16 text-right">
                          {formatTime(p.start_time)}
                        </span>
                        <span className="font-medium shrink-0 min-w-12">{p.speaker_name || `发言${i + 1}`}：</span>
                        <span>{p.content}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 智能纪要 */}
            {result.minutes?.summary_content && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    智能纪要
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: result.minutes.summary_content }} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 无转写也无纪要及时提示 */}
            {!result.transcript?.paragraphs?.length && !result.minutes?.summary_content && !result.message && (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>该会议暂无转写或智能纪要</p>
                  <p className="text-sm mt-1">请确认会议已开启「录制」和「实时转写」功能</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}