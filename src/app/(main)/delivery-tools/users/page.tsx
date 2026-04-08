'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit2, Trash2, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { authService, User } from '@/services/authService';
import { useRouter } from 'next/navigation';

interface UserFormData {
  username: string;
  email?: string;
  role: 'admin' | 'user';
  is_active: boolean;
  password?: string;
}

export default function UsersManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    email: '',
    role: 'user',
    is_active: true,
  });

  useEffect(() => {
    // 检查是否是管理员
    if (!authService.isAuthenticated()) {
      router.push('/login');
      return;
    }
    if (!authService.isAdmin()) {
      router.push('/unauthorized');
      return;
    }
    loadUsers();
  }, [router]);

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const result = await response.json();
      if (result.data && Array.isArray(result.data)) {
        setUsers(result.data);
      }
    } catch (error) {
      console.error('加载用户失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    console.log('提交表单数据:', formData);
    
    try {
      if (editingUser) {
        // 更新用户
        const response = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        
        const result = await response.json();
        console.log('更新用户响应:', result);
        
        if (response.ok) {
          setOpenDialog(false);
          loadUsers();
          resetForm();
        } else {
          setError(result.error || '更新用户失败');
        }
      } else {
        // 创建用户
        console.log('正在创建用户...');
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        
        console.log('响应状态:', response.status);
        const result = await response.json();
        console.log('创建用户响应:', result);
        
        if (response.ok) {
          console.log('创建成功，关闭对话框');
          setOpenDialog(false);
          loadUsers();
          resetForm();
        } else {
          console.error('创建失败:', result);
          setError(result.error || '创建用户失败');
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      setError('网络错误，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email || '',
      role: user.role,
      is_active: user.is_active,
    });
    setOpenDialog(true);
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`确定要删除用户 "${user.username}" 吗？`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        loadUsers();
      }
    } catch (error) {
      console.error('删除用户失败:', error);
    }
  };

  const resetForm = () => {
    setEditingUser(null);
    setError('');
    setFormData({
      username: '',
      email: '',
      role: 'user',
      is_active: true,
    });
  };

  const getRoleBadge = (role: string) => {
    if (role === 'admin') {
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          管理员
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <UserPlus className="w-3 h-3" />
        普通用户
      </Badge>
    );
  };

  const getStatusBadge = (is_active: boolean) => {
    return is_active ? (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-200">启用</Badge>
    ) : (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-200">禁用</Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 overflow-auto">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
            <p className="text-gray-500 mt-1">管理系统用户和权限</p>
          </div>
          <Button onClick={() => { resetForm(); setOpenDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            添加用户
          </Button>
        </div>

      {/* 用户列表 */}
      <div className="grid gap-4">
        {users.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              暂无用户数据，点击"添加用户"开始创建
            </CardContent>
          </Card>
        ) : (
          users.map((user) => (
            <Card key={user.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    {/* 用户头像标识 */}
                    <div className={`w-2 h-12 sm:h-8 rounded-full flex-shrink-0 ${user.role === 'admin' ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                    
                    {/* 用户信息 */}
                    <div className="flex-1 min-w-0">
                      {/* 第一行：用户名 + 角色 + 状态 */}
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 break-words">
                          {user.username}
                        </span>
                        {getRoleBadge(user.role)}
                        {getStatusBadge(user.is_active)}
                      </div>
                      {/* 第二行：邮箱 */}
                      <div className="text-sm text-gray-500 mt-1">
                        {user.email || '未设置邮箱'}
                      </div>
                      {/* 第三行：创建时间 */}
                      <div className="text-xs text-gray-400 mt-1">
                        创建于 {new Date(user.created_at).toLocaleDateString('zh-CN')}
                      </div>
                    </div>
                  </div>
                  
                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(user)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {user.username !== 'admin' && (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(user)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={openDialog} onOpenChange={(open) => {
        if (!open) {
          resetForm();
        }
        setOpenDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? '编辑用户' : '添加用户'}</DialogTitle>
            <DialogDescription>
              {editingUser ? '修改用户信息和权限' : '创建新的系统用户'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱（可选）</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label htmlFor="password">初始密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="留空则使用默认密码"
                />
              </div>
            )}
            {editingUser && (
              <div className="space-y-2">
                <Label htmlFor="password">新密码（留空不修改）</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="留空则不修改密码"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="role">角色</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'admin' | 'user') => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="user">普通用户</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">账号状态</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => {
                setOpenDialog(false);
                resetForm();
              }} disabled={isSubmitting}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    处理中...
                  </>
                ) : (
                  editingUser ? '保存' : '创建'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
