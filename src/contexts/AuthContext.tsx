'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

interface AuthContextType {
  userId: string;
  isLocalMode: boolean;
  loading: boolean;
  avatarUrl: string | null;
  updateAvatar: (url: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 生成或获取本地用户ID
const getOrCreateLocalUserId = (): string => {
  const stored = localStorage.getItem('local_user_id');
  if (stored) return stored;
  
  const newId = 'local_' + Math.random().toString(36).substring(2, 15);
  localStorage.setItem('local_user_id', newId);
  return newId;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // 初始化本地用户
  useEffect(() => {
    const initLocalUser = () => {
      const id = getOrCreateLocalUserId();
      setUserId(id);
      
      // 从 localStorage 读取头像
      const storedAvatar = localStorage.getItem(`avatar_${id}`);
      if (storedAvatar) {
        setAvatarUrl(storedAvatar);
      }
      
      setLoading(false);
    };
    
    initLocalUser();
  }, []);

  // 更新头像
  const updateAvatar = useCallback((url: string) => {
    setAvatarUrl(url);
    if (userId) {
      localStorage.setItem(`avatar_${userId}`, url);
    }
  }, [userId]);

  return (
    <AuthContext.Provider value={{ 
      userId, 
      isLocalMode: true,
      loading, 
      avatarUrl,
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
