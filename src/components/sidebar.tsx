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
import { useFlowChart } from '@/contexts/FlowChartContext';

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

// 移动端底部导航栏只显示这4个
const mobileNavItems = [
  { href: '/home', label: '智能助手', icon: Home },
  { href: '/todos', label: '待办清单', icon: CheckSquare },
  { href: '/schedule', label: '日程排期', icon: Calendar },
  { href: '/customers', label: '客户列表', icon: Users },
];

export function Sidebar({ collapsed = false, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const { hasNotification } = useFlowChart();

  return (
    <>
      {/* 桌面端左侧边栏 */}
      <aside 
        className={`hidden sm:flex fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex-col transition-all duration-300 ease-in-out overflow-visible group ${
          collapsed ? 'w-16' : 'w-[200px]'
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
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    className={`flex items-center rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <div className="relative">
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {/* 气泡通知 - 只在"交付工具"且未折叠时显示 */}
                      {item.href === '/tools' && hasNotification && !collapsed && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                      )}
                    </div>
                    {!collapsed && (
                      <span className="overflow-hidden whitespace-nowrap flex items-center gap-1">
                        {item.label}
                        {/* 气泡通知 - "交付工具"文字右侧 */}
                        {item.href === '/tools' && hasNotification && (
                          <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                        )}
                      </span>
                    )}
                    {/* 折叠时的气泡通知 */}
                    {item.href === '/tools' && hasNotification && collapsed && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
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

      {/* 移动端底部导航栏 */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around px-2 z-50">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          let isActive = pathname === item.href;
          
          // 特殊处理：customers路径
          if (item.href === '/customers' && pathname?.startsWith('/customers/')) {
            isActive = true;
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-16 h-14 rounded-lg transition-colors ${
                isActive
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] mt-0.5 whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
