'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { User } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, setGuestMode, user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/home');
    }
  }, [user, authLoading, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await signIn(email);
    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await signUp(email);
    if (error) {
      // 如果错误是"用户已注册"，尝试直接登录
      if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
        const { error: signInError } = await signIn(email);
        if (!signInError) {
          setLoading(false);
          return;
        }
      }
      setError(error.message);
    }
    setLoading(false);
  };

  // 游客访问
  const handleGuestAccess = () => {
    setGuestMode(true);
    router.push('/home');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">一站式交付平台</CardTitle>
          <CardDescription>金蝶云星辰实施顾问工作台</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 游客访问按钮 */}
          <Button 
            variant="outline" 
            className="w-full mb-4" 
            onClick={handleGuestAccess}
          >
            <User className="w-4 h-4 mr-2" />
            游客访问
          </Button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">或</span>
            </div>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="请输入已注册的邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </Button>
            <p className="text-xs text-center text-gray-500">
              只需输入已注册的邮箱即可登录，无需密码
            </p>
          </form>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-center text-gray-500 mb-2">还没有账号？</p>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={handleSignUp}
              disabled={loading || !email}
            >
              {loading ? '处理中...' : '注册新账号'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
