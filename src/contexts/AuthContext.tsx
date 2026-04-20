'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authService, User } from '@/services/authService';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // 更新认证状态
  const updateAuthState = async () => {
    const authenticated = authService.isAuthenticated();
    const admin = authService.isAdmin();
    const currentUser = authenticated ? await authService.getCurrentUser() : null;
    
    setIsAuthenticated(authenticated);
    setIsAdmin(admin);
    setUser(currentUser);
  };

  useEffect(() => {
    // 初始化认证状态
    const initAuth = async () => {
      try {
        await updateAuthState();
      } catch (error) {
        console.error('初始化认证失败:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initAuth();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const session = await authService.authenticate(username, password);
      if (session) {
        await updateAuthState();
        return true;
      }
      return false;
    } catch (error) {
        console.error('登录失败:', error);
        return false;
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user,
      isAuthenticated,
      isAdmin,
      loading,
      login,
      logout,
      refreshUser: updateAuthState,
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
