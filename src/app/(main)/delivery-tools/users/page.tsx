'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Loader2, Plus, Search, LayoutList, LayoutGrid, Edit2, Trash2 } from 'lucide-react';

interface User {
  id: string;
  username: string;
  email?: string;
  role: 'admin' | '交付顾问' | '答疑顾问' | '其他';
  is_active: boolean;
  employment_status?: string;
  created_at: string;
}

interface UserFormData {
  username: string;
  email: string;
  password: string;
  role: 'admin' | '交付顾问' | '答疑顾问' | '其他';
  is_active: boolean;
  employment_status: '在职' | '离职';
}

const getRoleBadge = (role: string) => {
  const styles: Record<string, string> = {
    admin: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
    '交付顾问': 'bg-green-50 text-green-700 hover:bg-green-100',
    '答疑顾问': 'bg-purple-50 text-purple-700 hover:bg-purple-100',
    '其他': 'bg-gray-100 text-gray-600 hover:bg-gray-200',
  };
  const labels: Record<string, string> = {
    admin: '管理员',
    '交付顾问': '交付顾问',
    '答疑顾问': '答疑顾问',
    '其他': '其他',
  };
  return (
    <Badge className={styles[role] || styles['其他']}>
      {labels[role] || role}
    </Badge>
  );
};

const getStatusBadge = (isActive: boolean) => {
  return isActive ? (
    <Badge className="bg-green-50 text-green-700 hover:bg-green-100">正常</Badge>
  ) : (
    <Badge className="bg-red-50 text-red-700 hover:bg-red-100">禁用</Badge>
  );
};

export default function UsersPage() {
  const { user, isAdmin, getAuthHeader } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    email: '',
    password: '',
    role: '交付顾问',
    is_active: true,
    employment_status: '在职',
  });

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users', {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
      });
      if (!res.ok) {
        throw new Error(`获取用户列表失败: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setUsers(data.data || []);
      } else {
        throw new Error(data.message || '获取用户列表失败');
      }
    } catch (error) {
      console.error('加载用户列表失败:', error);
      setError(error instanceof Error ? error.message : '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = [...users];
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.username.toLowerCase().includes(keyword) ||
          (u.email && u.email.toLowerCase().includes(keyword)) ||
          (u.role && u.role.toLowerCase().includes(keyword))
      );
    }
    return filtered.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (b.role === 'admin' && a.role !== 'admin') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [users, searchKeyword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setOpenDialog(false);
        resetForm();
        await loadUsers();
      } else {
        setError(data.message || '操作失败');
      }
    } catch (error) {
      setError('操作失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (userToDelete: User) => {
    const confirmed = await confirm({
      title: '确认删除用户',
      description: `确定要删除用户 "${userToDelete.username}" 吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      if (data.success) {
        await loadUsers();
      } else {
        setError(data.message || '删除失败');
      }
    } catch (error) {
      setError('删除失败，请重试');
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email || '',
      password: '',
      role: user.role,
      is_active: user.is_active,
      employment_status: (user.employment_status as '在职' | '离职') || '在职',
    });
    setOpenDialog(true);
  };

  const resetForm = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      password: '',
      role: '交付顾问',
      is_active: true,
      employment_status: '在职',
    });
    setError('');
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-gray-500">
            <p className="text-lg font-semibold text-gray-900 mb-2">权限不足</p>
            <p>您没有权限访问用户管理功能</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">用户管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理系统用户账号、权限和状态</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}
            className="gap-2"
          >
            {viewMode === 'table' ? <LayoutGrid className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
            {viewMode === 'table' ? '卡片视图' : '表格视图'}
          </Button>
          <Button onClick={() => { resetForm(); setOpenDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            添加用户
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="搜索用户名、邮箱或角色..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          className="pl-10"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* 用户列表 */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-500">加载中...</span>
        </div>
      ) : filteredAndSortedUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {searchKeyword.trim() ? '未找到匹配的用户' : '暂无用户数据，点击"添加用户"开始创建'}
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="w-48 font-semibold text-gray-900">用户名</TableHead>
                <TableHead className="font-semibold text-gray-900">角色</TableHead>
                <TableHead className="font-semibold text-gray-900">在职状态</TableHead>
                <TableHead className="font-semibold text-gray-900">账号状态</TableHead>
                <TableHead className="font-semibold text-gray-900">创建时间</TableHead>
                <TableHead className="w-24 text-right font-semibold text-gray-900">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => handleEdit(user)}>
                  <TableCell className="font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-8 rounded-full flex-shrink-0 ${user.role === 'admin' ? 'bg-blue-500' : 'bg-gray-400'}`} />
                      {user.username}
                    </div>
                  </TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>
                    <Badge className={user.employment_status === '在职' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}>
                      {user.employment_status || '在职'}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(user.is_active)}</TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {new Date(user.created_at).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(user); }}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      {user.username !== 'admin' && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(user); }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredAndSortedUsers.map((user) => (
            <Card key={user.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleEdit(user)}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    {/* 用户头像标识 */}
                    <div className={`w-2 h-12 sm:h-8 rounded-full flex-shrink-0 ${user.role === 'admin' ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                    
                    {/* 用户信息 */}
                    <div className="flex-1 min-w-0">
                      {/* 第一行：用户名 + 角色 + 状态 */}
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-base">{user.username}</span>
                        {getRoleBadge(user.role)}
                        <Badge className={user.employment_status === '在职' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}>
                          {user.employment_status || '在职'}
                        </Badge>
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
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(user); }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {user.username !== 'admin' && (
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(user); }}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                onValueChange={(value: 'admin' | '交付顾问' | '答疑顾问' | '其他') => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom">
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="交付顾问">交付顾问</SelectItem>
                  <SelectItem value="答疑顾问">答疑顾问</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employment_status">在职状态</Label>
              <Select
                value={formData.employment_status}
                onValueChange={(value: '在职' | '离职') => setFormData({ ...formData, employment_status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom">
                  <SelectItem value="在职">在职</SelectItem>
                  <SelectItem value="离职">离职</SelectItem>
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
      {ConfirmDialog}
    </div>
  );
}
