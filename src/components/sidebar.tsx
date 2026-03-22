'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  LogOut,
  DollarSign
} from 'lucide-react';

interface SidebarProps {
  onSignOut: () => void;
}

const navItems = [
  { href: '/dashboard', label: '数据看板', icon: LayoutDashboard },
  { href: '/customers', label: '客户列表', icon: Users },
  { href: '/commissions', label: '提成管理', icon: DollarSign },
];

export function Sidebar({ onSignOut }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="金蝶Logo"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">交付管理系统</h1>
            <p className="text-xs text-gray-500">金蝶云星辰</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            let isActive = pathname === item.href;
            
            // 特殊处理：customers路径
            if (item.href === '/customers' && pathname.startsWith('/customers') && pathname !== '/customers/new') {
              isActive = true;
            }
            // 特殊处理：commissions路径
            if (item.href === '/commissions' && pathname.startsWith('/commissions')) {
              isActive = true;
            }
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sign Out */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={onSignOut}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-100 w-full transition-colors"
        >
          <LogOut className="w-5 h-5" />
          退出登录
        </button>
      </div>
    </aside>
  );
}
