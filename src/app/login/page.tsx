'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, register, isAuthenticated, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  useEffect(() => {
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
      const result = await login(username, password);
      if (result.success) {
        router.push('/home');
      } else {
        setError(result.error || '用户名或密码错误');
      }
    } catch {
      setError('登录失败，请稍后重试');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }

    setIsLoggingIn(true);
    setError('');

    try {
      const result = await register(username, password, email || undefined, displayName || undefined);
      if (result.success) {
        router.push('/home');
      } else {
        setError(result.error || '注册失败');
      }
    } catch {
      setError('注册失败，请稍后重试');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
    setError('');
  };

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
              <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
            </div>
          <CardTitle className="text-2xl font-bold text-slate-800">交付集成平台</CardTitle>
          <p className="text-sm text-slate-500 mt-2">
            {isRegisterMode ? '创建新账号' : '请登录以继续'}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={isRegisterMode ? handleRegister : handleLogin} className="space-y-4">
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
                placeholder={isRegisterMode ? '密码（至少6位）' : '密码'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoggingIn}
                autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
              />
            </div>
            {isRegisterMode && (
              <>
                <div>
                  <Input
                    type="email"
                    placeholder="邮箱（选填）"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoggingIn}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Input
                    type="text"
                    placeholder="显示名称（选填）"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isLoggingIn}
                  />
                </div>
              </>
            )}
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoggingIn}
            >
              {isLoggingIn
                ? (isRegisterMode ? '注册中...' : '登录中...')
                : (isRegisterMode ? '注册' : '登录')}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              {isRegisterMode ? '已有账号？去登录' : '没有账号？去注册'}
            </button>
          </div>

          {!isRegisterMode && (
            <div className="mt-4 text-center text-sm text-slate-500">
              <p>默认管理员账号：admin / admin123</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
