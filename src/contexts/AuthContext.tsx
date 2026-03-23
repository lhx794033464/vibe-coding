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
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateAvatar: (url: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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

  const signIn = async (email: string, password: string) => {
    if (!supabase) {
      return { error: new Error('系统初始化中，请稍后') };
    }
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (!error) {
      router.push('/home');
    }
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) {
      return { error: new Error('系统初始化中，请稍后') };
    }
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (!error) {
      router.push('/home');
    }
    return { error };
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    // 清除头像状态
    setAvatarUrl(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      avatarUrl,
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
