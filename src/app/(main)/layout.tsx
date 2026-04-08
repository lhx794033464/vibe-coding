'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const { isAuthenticated, isAdmin, user, logout, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showBetaNotice, setShowBetaNotice] = useState(false);

  useEffect(() => {
    // 认证检查
    if (!loading && !isAuthenticated) {
      router.push('/login');
      return;
    }

    // 检查用户是否已经确认过内测提示
    const confirmed = localStorage.getItem(BETA_NOTICE_KEY);
    if (!confirmed) {
      setShowBetaNotice(true);
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
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
          {/* 顶部栏 */}
          <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shrink-0">
            <div className="flex items-center">
              {/* 移动端显示标题 */}
              <span className="sm:hidden font-bold text-gray-900">交付集成平台</span>
            </div>
            <div className="flex items-center gap-4">
              {/* 用户信息 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="hidden sm:block text-left">
                      <p className="text-sm font-medium text-gray-900">{user?.username}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        {isAdmin ? (
                          <>
                            <ShieldCheck className="w-3 h-3" />
                            管理员
                          </>
                        ) : (
                          '普通用户'
                        )}
                      </p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>我的账户</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 cursor-pointer" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          
          <div className="flex flex-1 overflow-hidden">
            <Sidebar 
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
            />
            <main className={`flex-1 overflow-auto transition-all duration-300 ${
              sidebarCollapsed ? 'sm:ml-0' : 'sm:ml-0'
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
