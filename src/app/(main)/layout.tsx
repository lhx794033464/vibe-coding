'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChatProvider } from '@/contexts/ChatContext';
import { FlowChartProvider } from '@/contexts/FlowChartContext';
import { HolidayProvider } from '@/contexts/HolidayContext';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/sidebar';
import { Loader2 } from 'lucide-react';
import { clearAllCache, prefetch } from '@/lib/dataCache';

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

  // 全局 401 拦截：任何非缓存 fetch 返回 401 时自动重定向到登录页
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const response = await originalFetch.apply(this, args);
      if (response.status === 401) {
        // 排除登录接口本身
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        if (!url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
          localStorage.removeItem('auth_session');
          document.cookie = 'auth_token=; path=/; max-age=0';
          window.location.href = '/login';
        }
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  // 后台切回前台时：仅让当前页面数据过期，不立即刷新（页面自行按需加载）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        import('@/lib/dataCache').then(({ markStale }) => markStale()).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // 预取常用页面数据（空闲时后台加载，不阻塞首屏）
  useEffect(() => {
    if (!isAuthenticated) return;
    const prefetch = () => {
      import('@/lib/dataCache').then(({ fetchWithCache }) => {
        const token = localStorage.getItem('auth_session');
        if (!token) return;
        try {
          const session = JSON.parse(token);
          const headers: Record<string, string> = { 'Authorization': `Bearer ${session.token}` };
          // 后台预取假日和提醒数据（轻量、高频使用）
          fetchWithCache('/api/holidays?year=2025,2026,2027', headers);
          fetchWithCache('/api/reminders', headers);
          fetchWithCache('/api/process-applications/pending-count', headers);
        } catch {}
      }).catch(() => {});
    };
    // 延迟执行，不与首屏争抢资源
    const timer = setTimeout(prefetch, 3000);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

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
