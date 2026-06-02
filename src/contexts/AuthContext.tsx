'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface User {
  id: string;
  username: string;
  email?: string;
  role: string;
  display_name?: string;
  role_type?: '交付顾问' | '答疑顾问';
  employment_status?: '在职' | '离职';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string, email?: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  getAuthHeader: () => Record<string, string>;
  refreshUser: (newToken?: string, newUser?: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const updateAuthState = () => {
    try {
      const sessionStr = localStorage.getItem('auth_session');
      if (!sessionStr) {
        setUser(null);
        setIsAuthenticated(false);
        setIsAdmin(false);
        // 清除 cookie
        document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        return;
      }
      const session = JSON.parse(sessionStr);
      if (session?.token && session?.user) {
        setUser(session.user);
        setIsAuthenticated(true);
        setIsAdmin(session.user.role === 'admin');
        // 同步写入 cookie（用于跨标签页/SSR 场景）
        document.cookie = `auth_token=${session.token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      } else {
        localStorage.removeItem('auth_session');
        document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        setUser(null);
        setIsAuthenticated(false);
        setIsAdmin(false);
      }
    } catch {
      localStorage.removeItem('auth_session');
      document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      setUser(null);
      setIsAuthenticated(false);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    updateAuthState();

    // 如果 localStorage 中没有 auth_session，但 cookie 中有 auth_token，
    // 尝试从 cookie 恢复会话（处理新标签页打开时 localStorage 为空的场景）
    const sessionStr = localStorage.getItem('auth_session');
    if (!sessionStr) {
      const cookieToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1];
      if (cookieToken) {
        // 从 cookie 中的 token 解析用户信息并恢复会话
        try {
          const decoded = atob(cookieToken);
          const parts = decoded.split(':');
          if (parts.length >= 3) {
            const restoredSession = {
              token: cookieToken,
              user: {
                id: parts[0],
                username: parts[1],
                role: parts[2],
              },
            };
            localStorage.setItem('auth_session', JSON.stringify(restoredSession));
            updateAuthState();
          }
        } catch {
          // cookie 中的 token 无效，清除
          document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        }
      }
    }

    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const authData = data.data;
        localStorage.setItem('auth_session', JSON.stringify({
          token: authData.token,
          user: authData.user,
        }));
        updateAuthState();
        return { success: true };
      }

      return { success: false, error: data.error || '登录失败' };
    } catch (error) {
      console.error('登录失败:', error);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  const register = async (username: string, password: string, email?: string, displayName?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email, display_name: displayName }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 注册成功后自动登录
        const authData = data.data;
        localStorage.setItem('auth_session', JSON.stringify({
          token: authData.token,
          user: authData.user,
        }));
        updateAuthState();
        return { success: true };
      }

      return { success: false, error: data.error || '注册失败' };
    } catch (error) {
      console.error('注册失败:', error);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_session');
    document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setUser(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  const getAuthHeader = (): Record<string, string> => {
    try {
      const sessionStr = localStorage.getItem('auth_session');
      if (!sessionStr) {
        // fallback: 从 cookie 中读取 token
        const cookieToken = document.cookie
          .split('; ')
          .find(row => row.startsWith('auth_token='))
          ?.split('=')[1];
        if (cookieToken) {
          return { Authorization: `Bearer ${cookieToken}` };
        }
        return {};
      }
      const session = JSON.parse(sessionStr);
      if (session?.token) {
        return { Authorization: `Bearer ${session.token}` };
      }
    } catch {}
    return {};
  };

  // 刷新当前用户信息（修改用户名后调用）
  const refreshUser = (newToken?: string, newUser?: User) => {
    try {
      const sessionStr = localStorage.getItem('auth_session');
      let session: Record<string, unknown> | null = null;
      if (sessionStr) {
        session = JSON.parse(sessionStr);
      }

      const updatedSession: Record<string, unknown> = { ...(session || {}), updated_at: Date.now() };
      if (newToken) {
        updatedSession.token = newToken;
      }
      if (newUser) {
        updatedSession.user = newUser;
        // 直接更新 React state，确保侧边栏等组件立即同步
        setUser(newUser);
        setIsAdmin(newUser.role === 'admin');
      }

      localStorage.setItem('auth_session', JSON.stringify(updatedSession));
      if (newToken) {
        document.cookie = `auth_token=${newToken}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      }
    } catch (error) {
      console.error('刷新用户信息失败:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user,
      isAuthenticated,
      isAdmin,
      loading,
      login,
      register,
      logout,
      getAuthHeader,
      refreshUser,
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
