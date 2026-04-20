'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function DataTransferXkPage() {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 顶部导航栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Link href="/tools" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          返回
        </Link>
        <h1 className="text-lg font-semibold">导账工具 - 星空转星辰</h1>
      </div>

      {/* 嵌入外部应用 */}
      <div className="flex-1 relative">
        <iframe
          src="https://5hy57sc23v.coze.site"
          className="absolute inset-0 w-full h-full border-0"
          title="导账工具 - 星空转星辰"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
