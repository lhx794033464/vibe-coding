'use client';

import { useState, useEffect } from 'react';
import { ChatProvider } from '@/contexts/ChatContext';
import { FlowChartProvider } from '@/contexts/FlowChartContext';
import { Sidebar } from '@/components/sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Info, Check } from 'lucide-react';

const BETA_NOTICE_KEY = 'beta-notice-confirmed';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showBetaNotice, setShowBetaNotice] = useState(false);

  useEffect(() => {
    // 检查用户是否已经确认过内测提示
    const confirmed = localStorage.getItem(BETA_NOTICE_KEY);
    if (!confirmed) {
      setShowBetaNotice(true);
    }
  }, []);

  const handleConfirm = () => {
    localStorage.setItem(BETA_NOTICE_KEY, 'true');
    setShowBetaNotice(false);
  };

  return (
    <ChatProvider>
      <FlowChartProvider>
        <div className="h-screen flex bg-gray-50 overflow-hidden">
        <Sidebar 
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
        <main className={`flex-1 h-full overflow-auto transition-all duration-300 ${
          sidebarCollapsed ? 'sm:ml-16' : 'sm:ml-[200px]'
        } pb-16 sm:pb-0`}>
          {children}
        </main>
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
              无需注册及登录，同时所有数据均存储在本地浏览器中，望知悉。
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
