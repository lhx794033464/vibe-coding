'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Palette,
  Camera,
  KeyRound,
  Mail,
  Moon,
  Check,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usersService } from '@/services/authService';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'profile' | 'appearance';

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { user, isAdmin, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');

  // 个人信息
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 主题
  const [darkMode, setDarkMode] = useState(false);

  // 初始化
  useEffect(() => {
    if (open && user) {
      setEmail(user.email || '');
      setMessage(null);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, user]);

  // 读取暗色模式偏好
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleDarkModeChange = (checked: boolean) => {
    setDarkMode(checked);
    if (checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setMessage(null);

    // 如果要修改密码
    if (newPassword || confirmPassword || oldPassword) {
      if (!oldPassword) {
        setMessage({ type: 'error', text: '请输入当前密码' });
        return;
      }
      if (!newPassword) {
        setMessage({ type: 'error', text: '请输入新密码' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setMessage({ type: 'error', text: '两次输入的新密码不一致' });
        return;
      }
      if (newPassword.length < 6) {
        setMessage({ type: 'error', text: '新密码至少6位' });
        return;
      }
    }

    setSaving(true);
    try {
      const updateData: Record<string, string> = { email };
      if (newPassword) {
        updateData.password = newPassword;
        updateData.old_password = oldPassword;
      }
      await usersService.update(user.id, updateData);
      await refreshUser?.();
      setMessage({ type: 'success', text: '保存成功' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  };

  const displayName = user?.username || '未登录';
  const displayRole = isAdmin ? '管理员' : '普通用户';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  const tabs: { key: ActiveTab; label: string; icon: typeof User }[] = [
    { key: 'profile', label: '个人信息', icon: User },
    { key: 'appearance', label: '主题布局', icon: Palette },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
        <div className="flex h-[480px]">
          {/* 左侧功能栏 */}
          <div className="w-[160px] border-r border-border bg-muted/30 flex flex-col p-3 gap-1">
            {/* 用户头像区 */}
            <div className="flex flex-col items-center py-4 mb-2">
              <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center mb-2">
                <span className="text-primary-foreground text-xl font-medium">{avatarLetter}</span>
              </div>
              <p className="text-sm font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{displayRole}</p>
            </div>
            <Separator className="mb-2" />
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm w-full transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">个人信息</h3>
                  <p className="text-sm text-muted-foreground">管理你的账户信息和安全设置</p>
                </div>

                {/* 头像修改 */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-foreground text-2xl font-medium">{avatarLetter}</span>
                  </div>
                  <div>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Camera className="w-4 h-4" />
                      更换头像
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">支持 JPG、PNG 格式</p>
                  </div>
                </div>

                <Separator />

                {/* 邮箱 */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    邮箱
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入邮箱地址"
                  />
                </div>

                <Separator />

                {/* 修改密码 */}
                <div>
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                    修改密码
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="old-password" className="text-xs text-muted-foreground">当前密码</Label>
                      <Input
                        id="old-password"
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="输入当前密码"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-xs text-muted-foreground">新密码</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="输入新密码（至少6位）"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">确认新密码</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="再次输入新密码"
                      />
                    </div>
                  </div>
                </div>

                {/* 消息提示 */}
                {message && (
                  <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                    message.type === 'success' 
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
                      : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                  }`}>
                    {message.type === 'success' ? <Check className="w-4 h-4" /> : <span>!</span>}
                    {message.text}
                  </div>
                )}

                {/* 保存按钮 */}
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveProfile} disabled={saving}>
                    {saving ? '保存中...' : '保存修改'}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">主题布局</h3>
                  <p className="text-sm text-muted-foreground">自定义界面外观和显示偏好</p>
                </div>

                {/* 夜间模式 */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      darkMode ? 'bg-indigo-900' : 'bg-amber-100'
                    }`}>
                      <Moon className={`w-5 h-5 ${darkMode ? 'text-indigo-300' : 'text-amber-600'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">夜间模式</p>
                      <p className="text-xs text-muted-foreground">降低屏幕亮度，保护眼睛</p>
                    </div>
                  </div>
                  <Switch
                    checked={darkMode}
                    onCheckedChange={handleDarkModeChange}
                  />
                </div>

                {/* 预览 */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-3">预览效果</p>
                  <div className={`rounded-lg border border-border p-4 transition-colors ${
                    darkMode ? 'bg-[#1a1a2e] border-[#2a2a4a]' : 'bg-white'
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-8 h-8 rounded-full ${darkMode ? 'bg-blue-700' : 'bg-blue-600'} flex items-center justify-center`}>
                        <span className="text-white text-xs font-medium">{avatarLetter}</span>
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{displayName}</p>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{displayRole}</p>
                      </div>
                    </div>
                    <div className={`rounded-md p-3 ${darkMode ? 'bg-[#252540]' : 'bg-gray-50'}`}>
                      <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>这是一段示例文本，用于预览夜间模式效果。</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
