'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  Home,
  Calendar,
  Wrench,
  DollarSign,
  ShieldCheck,
  LogOut,
  User,
  CheckSquare,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const allNavItems = [
  { href: '/home', label: '智能助手', icon: Home },
  { href: '/todos', label: '待办事项', icon: CheckSquare },
  { href: '/schedule', label: '日程排期', icon: Calendar },
  { href: '/dashboard', label: '数据看板', icon: LayoutDashboard },
  { href: '/customers', label: '客户列表', icon: Users },
  { href: '/commissions', label: '提成管理', icon: DollarSign },
  { href: '/tools', label: '交付工具', icon: Wrench },
];

const adminNavItems = [
  { href: '/delivery-tools/users', label: '用户管理', icon: ShieldCheck, adminOnly: true },
];

export function FloatingNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, user, logout } = useAuth();

  // 菜单展开状态
  const [menuOpen, setMenuOpen] = useState(false);
  // 悬浮按钮位置
  const [fabPos, setFabPos] = useState({ x: 16, y: 0 });
  // 是否处于拖拽状态
  const [dragging, setDragging] = useState(false);
  // 是否隐藏到侧边
  const [hidden, setHidden] = useState(false);
  // 拖拽起始位置与是否发生拖拽
  const dragStartPos = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = isAdmin ? [...allNavItems, ...adminNavItems] : allNavItems;

  // 初始位置：右侧中间偏下
  useEffect(() => {
    setFabPos({ x: 16, y: window.innerHeight * 0.6 });
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        fabRef.current &&
        !fabRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside as unknown as EventListener);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as unknown as EventListener);
    };
  }, [menuOpen]);

  // 隐藏到侧边后，点击屏幕边缘呼出
  useEffect(() => {
    if (!hidden) return;
    const handleEdgeTouch = (e: TouchEvent | MouseEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      if (clientX < 20 || clientX > window.innerWidth - 20) {
        setHidden(false);
      }
    };
    document.addEventListener('touchstart', handleEdgeTouch);
    document.addEventListener('mousedown', handleEdgeTouch);
    return () => {
      document.removeEventListener('touchstart', handleEdgeTouch);
      document.removeEventListener('mousedown', handleEdgeTouch);
    };
  }, [hidden]);

  // 拖拽逻辑
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    setDragging(true);
    dragStartPos.current = { x: clientX - fabPos.x, y: clientY - fabPos.y };
  }, [fabPos]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragging) return;
    const newX = Math.max(0, Math.min(window.innerWidth - 48, clientX - dragStartPos.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, clientY - dragStartPos.current.y));
    setFabPos({ x: newX, y: newY });
  }, [dragging]);

  const handleDragEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    // 自动吸附到左侧或右侧
    const midX = window.innerWidth / 2;
    if (fabPos.x < midX) {
      // 吸附到左侧，如果接近边缘则隐藏
      if (fabPos.x < 10) {
        setHidden(true);
        setFabPos({ x: -8, y: fabPos.y });
      } else {
        setFabPos({ x: 8, y: fabPos.y });
      }
    } else {
      if (fabPos.x > window.innerWidth - 30) {
        setHidden(true);
        setFabPos({ x: window.innerWidth - 8, y: fabPos.y });
      } else {
        setFabPos({ x: window.innerWidth - 56, y: fabPos.y });
      }
    }
  }, [dragging, fabPos]);

  // 触摸事件
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    hasDragged.current = false;
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - dragStartPos.current.x;
    const dy = touch.clientY - dragStartPos.current.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasDragged.current = true;
    }
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
    if (!hasDragged.current) {
      setMenuOpen(prev => !prev);
    }
  };

  // 鼠标事件（模拟器调试用）
  const handleMouseDown = (e: React.MouseEvent) => {
    hasDragged.current = false;
    handleDragStart(e.clientX, e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        hasDragged.current = true;
      }
      handleDragMove(e.clientX, e.clientY);
    };
    const handleMouseUp = () => {
      handleDragEnd();
      if (!hasDragged.current) {
        setMenuOpen(prev => !prev);
      }
    };
    if (dragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleDragMove, handleDragEnd]);

  // 菜单滑入动画 - 悬浮按钮的位置决定菜单出现在左侧还是右侧
  const isLeftSide = fabPos.x < window.innerWidth / 2;

  const handleNavClick = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    router.push('/login');
  };

  const displayName = user?.username || '未登录';

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        ref={fabRef}
        className={`sm:hidden fixed z-[70] flex items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
          hidden ? 'w-3 h-12 opacity-30' : 'w-12 h-12'
        } ${dragging ? 'scale-110 shadow-xl' : 'scale-100'} ${
          menuOpen 
            ? 'bg-foreground text-background' 
            : 'bg-white text-foreground border border-border'
        }`}
        style={{
          right: fabPos.x > window.innerWidth / 2 ? `${window.innerWidth - fabPos.x - 48}px` : undefined,
          left: fabPos.x <= window.innerWidth / 2 ? `${fabPos.x}px` : undefined,
          top: `${fabPos.y}px`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* 遮罩 */}
      {menuOpen && (
        <div
          className="sm:hidden fixed inset-0 bg-black/20 z-[60] transition-opacity duration-200"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* 导航菜单 */}
      <div
        ref={menuRef}
        className={`sm:hidden fixed z-[65] transition-all duration-300 ease-out ${
          menuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 pointer-events-none'
        } ${isLeftSide ? 'left-0' : 'right-0'} top-0 h-full`}
        style={{ width: '220px' }}
      >
        <div className="h-full bg-white/95 backdrop-blur-md shadow-2xl flex flex-col">
          {/* 用户信息 */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground text-sm font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground">{isAdmin ? '管理员' : '普通用户'}</p>
              </div>
            </div>
          </div>

          {/* 导航项 */}
          <nav className="flex-1 py-2 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              let isActive = pathname === item.href;
              if (item.href === '/customers' && pathname?.startsWith('/customers/')) isActive = true;
              if (item.href === '/delivery-tools/users' && pathname?.startsWith('/delivery-tools/')) isActive = true;

              return (
                <button
                  key={item.href}
                  onClick={() => handleNavClick(item.href)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 底部操作 */}
          <div className="border-t border-border py-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
