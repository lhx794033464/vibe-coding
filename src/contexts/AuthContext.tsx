'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User, Session, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  avatarUrl: string | null;
  isGuest: boolean;
  setGuestMode: (enabled: boolean) => void;
  signIn: (email: string, otp?: string) => Promise<{ error: Error | null; requireOtp?: boolean }>;
  signUp: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateAvatar: (url: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 游客用户信息
const GUEST_USER_ID = '00000000-0000-0000-0000-000000000000';
const GUEST_USER: User = {
  id: GUEST_USER_ID,
  email: 'guest@example.com',
  user_metadata: { name: '游客' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  role: 'authenticated',
  updated_at: new Date().toISOString(),
} as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const router = useRouter();
  
  // 使用 ref 防止重复请求
  const avatarFetchingRef = useRef(false);

  // 获取头像
  const fetchAvatar = useCallback(async (token: string) => {
    // 防止重复请求
    if (avatarFetchingRef.current) return;
    avatarFetchingRef.current = true;
    
    try {
      const response = await fetch('/api/avatar', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvatarUrl(data.avatarUrl);
      }
    } catch (error) {
      console.error('获取头像失败:', error);
    } finally {
      avatarFetchingRef.current = false;
    }
  }, []);

  // 更新头像（上传成功后调用）
  const updateAvatar = useCallback((url: string) => {
    setAvatarUrl(url);
  }, []);

  // 初始化 Supabase 客户端
  useEffect(() => {
    const initSupabase = async () => {
      try {
        // 从 API 获取配置
        const response = await fetch('/api/config');
        if (response.ok) {
          const data = await response.json();
          const client = createBrowserClient(data.supabaseUrl, data.supabaseAnonKey);
          setSupabase(client);
          
          // 获取当前会话
          const { data: { session } } = await client.auth.getSession();
          setSession(session);
          setUser(session?.user ?? null);
          
          // 如果已有会话，立即获取头像
          if (session?.access_token) {
            fetchAvatar(session.access_token);
          }
        }
      } catch (error) {
        console.error('初始化 Supabase 失败:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initSupabase();
  }, [fetchAvatar]);

  // 监听认证状态变化
  useEffect(() => {
    if (!supabase) return;
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // 登录成功后获取头像
      if (session?.access_token) {
        setAvatarUrl(null); // 先清除，等待重新获取
        fetchAvatar(session.access_token);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchAvatar]);

  const signIn = async (email: string, otp?: string): Promise<{ error: Error | null; requireOtp?: boolean }> => {
    if (!supabase) {
      return { error: new Error('系统初始化中，请稍后') };
    }
    
    // 使用无密码登录 API
    try {
      const response = await fetch('/api/auth/passwordless-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { error: new Error(data.error || '登录失败') };
      }
      
      // 如果需要 OTP
      if (data.requireOtp) {
        return { error: null, requireOtp: true };
      }
      
      // 使用返回的 session 设置用户状态
      if (data.session) {
        // 手动设置 session
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        
        if (sessionError) {
          return { error: sessionError };
        }
        
        setSession(sessionData.session);
        setUser(sessionData.session?.user ?? null);
        
        if (sessionData.session?.access_token) {
          fetchAvatar(sessionData.session.access_token);
        }
        
        router.push('/home');
        return { error: null };
      }
      
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('登录失败') };
    }
  };

  const signUp = async (email: string) => {
    if (!supabase) {
      return { error: new Error('系统初始化中，请稍后') };
    }
    
    // 生成一个随机密码
    const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password: randomPassword,
    });
    
    if (!error && data.session) {
      setSession(data.session);
      setUser(data.session.user);
      fetchAvatar(data.session.access_token);
      router.push('/home');
    }
    
    return { error };
  };

  const signOut = async () => {
    // 先清除本地状态，防止登录页面检测到用户已登录而跳转
    setUser(null);
    setSession(null);
    setIsGuest(false);
    setAvatarUrl(null);
    
    if (supabase) {
      await supabase.auth.signOut();
    }
    
    // 强制刷新页面以确保所有状态被清除
    window.location.href = '/login';
  };

  // 设置游客模式
  const setGuestMode = (enabled: boolean) => {
    setIsGuest(enabled);
    if (enabled) {
      setUser(GUEST_USER);
    } else {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      avatarUrl,
      isGuest,
      setGuestMode,
      signIn, 
      signUp, 
      signOut,
      updateAvatar
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
