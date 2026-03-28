'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Home,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Calendar,
  Wrench,
  DollarSign,
} from 'lucide-react';

interface SidebarProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { href: '/home', label: '智能助手', icon: Home },
  { href: '/todos', label: '待办清单', icon: CheckSquare },
  { href: '/schedule', label: '日程排期', icon: Calendar },
  { href: '/dashboard', label: '数据看板', icon: LayoutDashboard },
  { href: '/customers', label: '客户列表', icon: Users },
  { href: '/commissions', label: '提成管理', icon: DollarSign },
  { href: '/tools', label: '交付工具', icon: Wrench },
];

export function Sidebar({ collapsed = false, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside 
      className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out overflow-visible group ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className={`border-b border-gray-200 ${collapsed ? 'p-3' : 'p-6'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          {/* Logo */}
          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
            <Image
              src="/logo.png"
              alt="Logo"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          {/* 文字区域 */}
          <div className={`flex-1 overflow-hidden transition-opacity duration-200 ${
            collapsed ? 'opacity-0 w-0' : 'opacity-100'
          }`}>
            <h1 className="font-bold text-gray-900 whitespace-nowrap">交付集成平台</h1>
            <p className="text-xs text-gray-500 whitespace-nowrap truncate">金蝶云星辰</p>
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
            if (item.href === '/customers' && pathname?.startsWith('/customers/')) {
              isActive = true;
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  } ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && (
                    <span className="overflow-hidden whitespace-nowrap">
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 侧边栏收起按钮 - 悬浮在右侧边缘 */}
      <button
        onClick={() => onCollapsedChange?.(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 w-6 h-12 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-all duration-200 opacity-0 group-hover:opacity-100"
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}
