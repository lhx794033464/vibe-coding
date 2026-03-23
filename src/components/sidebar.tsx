'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  LogOut,
  DollarSign,
  User,
  Camera,
  Loader2,
  Home,
  ChevronLeft,
  ChevronRight,
  CheckSquare
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  onSignOut: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { href: '/home', label: '首页', icon: Home },
  { href: '/todos', label: '待办清单', icon: CheckSquare },
  { href: '/dashboard', label: '数据看板', icon: LayoutDashboard },
  { href: '/customers', label: '客户列表', icon: Users },
  { href: '/commissions', label: '提成管理', icon: DollarSign },
];

export function Sidebar({ onSignOut, collapsed = false, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const { user, session, avatarUrl, updateAvatar } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.access_token) return;

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('仅支持 JPG、PNG、GIF、WebP 格式');
      return;
    }

    // 验证文件大小
    if (file.size > 2 * 1024 * 1024) {
      alert('文件大小不能超过 2MB');
      return;
    }

    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/avatar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        // 更新全局头像状态
        updateAvatar(data.avatarUrl);
      } else {
        const error = await response.json();
        alert(error.error || '上传失败');
      }
    } catch (error) {
      console.error('上传头像失败:', error);
      alert('上传失败，请重试');
    } finally {
      setUploading(false);
      // 清空input，允许重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <aside 
      className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out overflow-hidden group ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className={`border-b border-gray-200 ${collapsed ? 'p-3' : 'p-6'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          {/* 用户头像 */}
          <button 
            onClick={handleAvatarClick}
            disabled={uploading}
            className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 group/avatar cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all"
            title={collapsed ? "点击上传头像" : undefined}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            ) : avatarUrl ? (
              <>
                <Image
                  src={avatarUrl}
                  alt="用户头像"
                  width={40}
                  height={40}
                  className="object-cover w-full h-full"
                  onError={(e) => {
                    // 图片加载失败时隐藏
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </>
            ) : (
              <>
                <User className="w-5 h-5 text-gray-400" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          {/* 文字区域 - 使用绝对定位避免布局跳动 */}
          <div className={`flex-1 overflow-hidden transition-opacity duration-200 ${
            collapsed ? 'opacity-0 w-0' : 'opacity-100'
          }`}>
            <h1 className="font-bold text-gray-900 whitespace-nowrap">交付管理系统</h1>
            <p className="text-xs text-gray-500 whitespace-nowrap truncate">{user?.email || '金蝶云星辰'}</p>
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
            // 特殊处理：commissions路径
            if (item.href === '/commissions' && pathname.startsWith('/commissions')) {
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

      {/* Sign Out */}
      <div className={`border-t border-gray-200 ${collapsed ? 'p-2' : 'p-4'}`}>
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
