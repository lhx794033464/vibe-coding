'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // 如果已登录且不是正在加载中，重定向到首页
    if (!loading && isAuthenticated) {
      router.push('/home');
    }
  }, [loading, isAuthenticated, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setIsLoggingIn(true);
    setError('');

    try {
      const success = await login(username, password);
      if (success) {
        router.push('/home');
      } else {
        setError('用户名或密码错误');
      }
    } catch (err) {
      setError('登录失败，请稍后重试');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 如果正在加载认证状态，显示加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-slate-500">正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800">交付集成平台</CardTitle>
          <p className="text-sm text-slate-500 mt-2">请登录以继续</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoggingIn}
                autoComplete="username"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoggingIn}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? '登录中...' : '登录'}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-slate-500">
            <p>默认管理员账号：admin / admin123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
