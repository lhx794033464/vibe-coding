'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface User {
  id: string;
  username: string;
  email?: string;
  role: string;
  display_name?: string;
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
        return;
      }
      const session = JSON.parse(sessionStr);
      if (session?.token && session?.user) {
        setUser(session.user);
        setIsAuthenticated(true);
        setIsAdmin(session.user.role === 'admin');
      } else {
        localStorage.removeItem('auth_session');
        setUser(null);
        setIsAuthenticated(false);
        setIsAdmin(false);
      }
    } catch {
      localStorage.removeItem('auth_session');
      setUser(null);
      setIsAuthenticated(false);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    updateAuthState();
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
    setUser(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  const getAuthHeader = (): Record<string, string> => {
    try {
      const sessionStr = localStorage.getItem('auth_session');
      if (!sessionStr) return {};
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
      if (!sessionStr) return;
      const session = JSON.parse(sessionStr);
      if (newToken && newUser) {
        localStorage.setItem('auth_session', JSON.stringify({
          token: newToken,
          user: newUser,
        }));
      } else if (newUser) {
        localStorage.setItem('auth_session', JSON.stringify({
          ...session,
          user: newUser,
        }));
      } else if (newToken) {
        localStorage.setItem('auth_session', JSON.stringify({
          ...session,
          token: newToken,
        }));
      }
      updateAuthState();
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
