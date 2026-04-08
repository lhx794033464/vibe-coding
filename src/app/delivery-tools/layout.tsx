'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/app/(main)/layout';

export default function DeliveryToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!loading && !isAdmin) {
      router.push('/unauthorized');
      return;
    }
  }, [loading, isAuthenticated, isAdmin, router]);

  // 这里我们简单地返回 children，因为实际的布局会在 MainLayout 中处理
  // 但是为了确保样式正确，我们还是用 MainLayout 包裹
  return <>{children}</>;
}
