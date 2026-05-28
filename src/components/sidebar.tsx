'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Home,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Wrench,
  DollarSign,
  ShieldCheck,
  Settings,
  LogOut,
  User,
} from 'lucide-react';
import { useFlowChart } from '@/contexts/FlowChartContext';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const baseNavItems = [
  { href: '/home', label: '智能助手', icon: Home },
  { href: '/schedule', label: '日程排期', icon: Calendar },
  { href: '/dashboard', label: '数据看板', icon: LayoutDashboard },
  { href: '/customers', label: '客户列表', icon: Users },
  { href: '/commissions', label: '提成管理', icon: DollarSign },
  { href: '/tools', label: '交付工具', icon: Wrench },
];

const adminNavItems = [
  { href: '/delivery-tools/users', label: '用户管理', icon: ShieldCheck, adminOnly: true },
];

// 移动端底部导航栏只显示这4个
const mobileNavItems = [
  { href: '/home', label: '智能助手', icon: Home },
  { href: '/schedule', label: '日程排期', icon: Calendar },
  { href: '/dashboard', label: '数据看板', icon: LayoutDashboard },
  { href: '/customers', label: '客户列表', icon: Users },
];

export function Sidebar({ collapsed = false, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasNotification } = useFlowChart();
  const { isAdmin, user, logout } = useAuth();
  const [showToggleButton, setShowToggleButton] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 组合导航项
  const navItems = isAdmin ? [...baseNavItems, ...adminNavItems] : baseNavItems;

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
    router.push('/login');
  };

  // 用户名显示
  const displayName = user?.username || '未登录';
  const displayRole = isAdmin ? '管理员' : '普通用户';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <>
      {/* 桌面端左侧边栏 */}
      <aside 
        className={`hidden sm:flex fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex-col transition-all duration-300 ease-in-out overflow-visible group ${
          collapsed ? 'w-16' : 'w-[200px]'
        }`}
        onMouseEnter={() => setShowToggleButton(true)}
        onMouseLeave={() => setShowToggleButton(false)}
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
              // 特殊处理：用户管理路径
              if (item.href === '/delivery-tools/users' && pathname?.startsWith('/delivery-tools/')) {
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
                      <span className="overflow-hidden whitespace-nowrap flex items-center gap-1">
                        {item.label}
                        {/* 气泡通知 - "交付工具"文字右侧 */}
                        {item.href === '/tools' && hasNotification && (
                          <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                        )}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 右侧感应区域和缩放按钮 */}
        <div 
          className="absolute top-0 right-0 h-full w-2 cursor-ew-resize"
          onMouseEnter={() => setShowToggleButton(true)}
        >
          {/* 缩放按钮 */}
          <button
            onClick={() => onCollapsedChange?.(!collapsed)}
            className={`absolute -right-3 top-1/2 -translate-y-1/2 z-50 w-6 h-12 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-all duration-200 ${
              showToggleButton ? 'opacity-100' : 'opacity-0'
            }`}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* 个人设置区域 - 底部对齐 */}
        <div className="relative border-t border-gray-200" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`w-full flex items-center cursor-pointer transition-colors hover:bg-gray-50 ${
              collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
            }`}
          >
            {/* 头像 */}
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-medium">{avatarLetter}</span>
            </div>
            {/* 用户名和角色 */}
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-400 truncate">{displayRole}</p>
              </div>
            )}
          </button>

          {/* 弹出菜单 */}
          {showUserMenu && (
            <div className={`absolute bottom-full left-0 mb-1 ${
              collapsed ? 'left-full ml-2 bottom-0 mb-0' : 'w-full'
            } bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[60] ${
              collapsed ? 'w-48' : ''
            }`}>
              {/* 用户信息（折叠时显示） */}
              {collapsed && (
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                  <p className="text-xs text-gray-400 truncate">{displayRole}</p>
                </div>
              )}
              <button
                onClick={() => { setShowUserMenu(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="w-4 h-4 text-gray-400" />
                个人设置
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
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
