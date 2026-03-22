'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const router = useRouter();

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
        }
      } catch (error) {
        console.error('初始化 Supabase 失败:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initSupabase();
  }, []);

  // 监听认证状态变化
  useEffect(() => {
    if (!supabase) return;
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

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
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
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
