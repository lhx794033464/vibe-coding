'use client';

import { useState } from 'react';
import { ChatProvider } from '@/contexts/ChatContext';
import { Sidebar } from '@/components/sidebar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <ChatProvider>
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
    </ChatProvider>
  );
}
