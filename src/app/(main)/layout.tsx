'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChatProvider } from '@/contexts/ChatContext';
import { FlowChartProvider } from '@/contexts/FlowChartContext';
import { HolidayProvider } from '@/contexts/HolidayContext';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/sidebar';
import { Loader2 } from 'lucide-react';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    // 认证检查
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  // 加载中显示加载状态
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-slate-500">正在加载...</p>
        </div>
      </div>
    );
  }

  // 未认证时不渲染内容
  if (!isAuthenticated) {
    return null;
  }

  return (
    <ChatProvider>
      <FlowChartProvider>
        <HolidayProvider>
          <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
              <Sidebar 
                collapsed={sidebarCollapsed}
                onCollapsedChange={setSidebarCollapsed}
              />
              <main className={`flex-1 overflow-auto transition-all duration-300 ${
                sidebarCollapsed ? 'sm:ml-16' : 'sm:ml-[200px]'
              }`}>
                {children}
              </main>
            </div>
          </div>
        </HolidayProvider>
      </FlowChartProvider>
    </ChatProvider>
  );
}
