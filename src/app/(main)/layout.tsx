'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChatProvider } from '@/contexts/ChatContext';
import { FlowChartProvider } from '@/contexts/FlowChartContext';
import { HolidayProvider } from '@/contexts/HolidayContext';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/sidebar';
import { Loader2 } from 'lucide-react';

/** 预加载隐藏 iframe：登录后立即在后台加载导账工具星空转星辰，用户首次点击时无需等待 */
function IframePreloader() {
  const preloadedRef = useRef(false);

  useEffect(() => {
    // 避免重复创建
    if (preloadedRef.current) return;
    preloadedRef.current = true;

    const iframe = document.createElement('iframe');
    iframe.src = 'https://5hy57sc23v.coze.site';
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:none;opacity:0;pointer-events:none;';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    document.body.appendChild(iframe);

    return () => {
      // 组件卸载时移除预加载 iframe
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };
  }, []);

  return null;
}

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
              } ml-0`}>
                {children}
              </main>
            </div>
          </div>
          <IframePreloader />
        </HolidayProvider>
      </FlowChartProvider>
    </ChatProvider>
  );
}
