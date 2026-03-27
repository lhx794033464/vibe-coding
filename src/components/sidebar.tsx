'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  LogOut,
  DollarSign,
  Home,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Calendar,
  Wrench,
  User
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  onSignOut: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  isGuest?: boolean;
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

export function Sidebar({ onSignOut, collapsed = false, onCollapsedChange, isGuest = false }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const router = useRouter();

  return (
    <aside 
      className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out overflow-hidden group ${
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
      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-4'}`}>
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            let isActive = pathname === item.href;
            
            // 特殊处理：customers路径
            if (item.href === '/customers' && pathname.startsWith('/customers') && pathname !== '/customers/new') {
              isActive = true;
            }
            // 特殊处理：todos路径
            if (item.href === '/todos' && pathname.startsWith('/todos')) {
              isActive = true;
            }
            // 特殊处理：schedule路径
            if (item.href === '/schedule' && pathname.startsWith('/schedule')) {
              isActive = true;
            }
            // 特殊处理：commissions路径
            if (item.href === '/commissions' && pathname.startsWith('/commissions')) {
              isActive = true;
            }
            // 特殊处理：tools路径
            if (item.href === '/tools' && pathname.startsWith('/tools')) {
              isActive = true;
            }
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  } ${collapsed ? 'justify-center px-0' : 'px-4'}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className={`whitespace-nowrap transition-opacity duration-200 ${
                    collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  }`}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sign Out / Return to Login */}
      <div className={`border-t border-gray-200 ${collapsed ? 'p-2' : 'p-4'}`}>
        {isGuest ? (
          <button
            onClick={() => router.push('/login')}
            className={`flex items-center gap-3 py-3 rounded-lg text-gray-600 hover:bg-gray-100 w-full transition-colors ${
              collapsed ? 'justify-center px-0' : 'px-4'
            }`}
            title={collapsed ? "返回登录" : undefined}
          >
            <User className="w-5 h-5 flex-shrink-0" />
            <span className={`whitespace-nowrap transition-opacity duration-200 ${
              collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            }`}>
              返回登录
            </span>
          </button>
        ) : (
          <button
            onClick={onSignOut}
            className={`flex items-center gap-3 py-3 rounded-lg text-gray-600 hover:bg-gray-100 w-full transition-colors ${
              collapsed ? 'justify-center px-0' : 'px-4'
            }`}
            title={collapsed ? "退出登录" : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className={`whitespace-nowrap transition-opacity duration-200 ${
              collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            }`}>
              退出登录
            </span>
          </button>
        )}
      </div>

      {/* 折叠按钮 - 悬停时显示 */}
      <button
        onClick={() => onCollapsedChange?.(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-gray-50 hover:border-gray-300 transition-all z-10"
        title={collapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        )}
      </button>
    </aside>
  );
}
