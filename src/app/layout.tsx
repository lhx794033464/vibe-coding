import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: {
    default: '交付集成平台 | 金蝶云星辰',
    template: '%s | 交付集成平台',
  },
  description:
    '金蝶云星辰交付集成平台，全生命周期管理客户实施进度，助力交付顾问高效工作',
  keywords: [
    '金蝶云星辰',
    '客户管理',
    '实施跟进',
    'CRM',
    '交付集成',
  ],
  authors: [{ name: 'KisCloud' }],
  generator: 'Coze Code',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        <AuthProvider>
          {isDev && <Inspector />}
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
