'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChatProvider } from '@/contexts/ChatContext';
import { FlowChartProvider } from '@/contexts/FlowChartContext';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info, Check, User, LogOut, ShieldCheck, Loader2 } from 'lucide-react';

const BETA_NOTICE_KEY = 'beta-notice-confirmed';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isAdmin, user, logout, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showBetaNotice, setShowBetaNotice] = useState(false);

  useEffect(() => {
    // 认证检查
    if (!loading && !isAuthenticated) {
      router.push('/login');
      return;
    }

    if (!loading && isAuthenticated) {
      // 检查用户是否已经确认过内测提示
      const confirmed = localStorage.getItem(BETA_NOTICE_KEY);
      if (!confirmed) {
        setShowBetaNotice(true);
      }
    }
  }, [loading, isAuthenticated, router]);

  const handleConfirm = () => {
    localStorage.setItem(BETA_NOTICE_KEY, 'true');
    setShowBetaNotice(false);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // 加载中显示加载状态
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">正在加载...</p>
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
        <div className="h-screen flex flex-col bg-background overflow-hidden">
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

        {/* 内测提示弹窗 */}
        <Dialog open={showBetaNotice} onOpenChange={setShowBetaNotice}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-blue-600">
                <Info className="w-5 h-5" />
                内测提示
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <DialogDescription className="text-base text-slate-700 leading-relaxed">
                产品目前处于<span className="font-semibold text-blue-600">内测阶段</span>，
                所有数据均存储在本地浏览器中，望知悉。
              </DialogDescription>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleConfirm} className="bg-blue-500 hover:bg-blue-600">
                <Check className="w-4 h-4 mr-2" />
                我已知晓
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </FlowChartProvider>
    </ChatProvider>
  );
}
