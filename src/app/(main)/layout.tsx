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
          sidebarCollapsed ? 'ml-16' : 'ml-[200px]'
        }`}>
          {children}
        </main>
      </div>
    </ChatProvider>
  );
}
