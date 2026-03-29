'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ToolsPage() {
  const router = useRouter();

  // 自动跳转到业务流程图
  useEffect(() => {
    router.replace('/tools/flow-chart');
  }, [router]);

  return (
    <div className="h-full bg-slate-50 flex items-center justify-center">
      <div className="text-slate-400">正在跳转到业务流程图...</div>
    </div>
  );
}
