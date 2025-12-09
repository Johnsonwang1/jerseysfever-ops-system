import { useState, useEffect } from 'react';
import {
  Users, Plus, Pencil, Trash2, Shield, Eye, Edit3,
  Loader2, Search, X, AlertCircle, Check
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { UserProfile, UserRole } from '../lib/types';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const roleLabels: Record<UserRole, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Shield }> = {
  admin: { label: '管理员', variant: 'destructive', icon: Shield },
  editor: { label: '编辑员', variant: 'default', icon: Edit3 },
  viewer: { label: '观察员', variant: 'secondary', icon: Eye },
};

interface CreateUserForm {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

export function UsersPage() {
  const { isAdmin, profile: currentProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  // React Query hooks
  const { data: usersData, isLoading: loading } = useUsers();
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();
  
  const users = usersData || [];

  // 模态框状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // 表单状态
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '',
    password: '',
    name: '',
    role: 'editor',
  });
  const [editForm, setEditForm] = useState<{ name: string; email: string; role: UserRole; password: string }>({
    name: '',
    email: '',
    role: 'editor',
    password: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 过滤用户
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 创建用户
  const handleCreateUser = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await createUserMutation.mutateAsync(createForm);
      setSuccess('用户创建成功');
      setShowCreateModal(false);
      setCreateForm({ email: '', password: '', name: '', role: 'editor' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '创建用户失败';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // 更新用户
  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    setSubmitting(true);
    setError(null);

    try {
      const updateData: { name?: string; role?: UserRole; email?: string; password?: string } = {
        name: editForm.name,
        role: editForm.role,
      };

      // 只有邮箱变化时才更新邮箱
      if (editForm.email !== selectedUser.email) {
        updateData.email = editForm.email;
      }

      // 只有填写了密码才更新密码
      if (editForm.password) {
        updateData.password = editForm.password;
      }

      await updateUserMutation.mutateAsync({ userId: selectedUser.id, data: updateData });
      setSuccess('用户信息已更新');
      setShowEditModal(false);
      setSelectedUser(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '更新失败';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // 删除用户
  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setSubmitting(true);
    setError(null);

    try {
      await deleteUserMutation.mutateAsync(selectedUser.id);
      setSuccess('用户已删除');
      setShowDeleteModal(false);
      setSelectedUser(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '删除失败';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // 打开编辑模态框
  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setEditForm({ name: user.name, email: user.email, role: user.role, password: '' });
    setShowEditModal(true);
  };

  // 打开删除模态框
  const openDeleteModal = (user: UserProfile) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  // 清除消息
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center p-4 lg:p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">权限不足</h2>
            <p className="text-muted-foreground">只有管理员可以访问用户管理页面</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 固定头部区域 */}
      <div className="sticky top-0 z-20 bg-muted px-4 lg:px-6 pt-4 lg:pt-6 pb-4 space-y-4">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            <h1 className="text-lg sm:text-xl font-semibold">用户管理</h1>
            <span className="hidden sm:inline text-sm text-muted-foreground">（管理系统用户和权限）</span>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            添加用户
          </Button>
        </div>

        {/* 成功/错误提示 */}
        {success && (
          <Alert>
            <Check className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              {error}
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                <X className="w-4 h-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* 搜索栏 */}
        <Card>
          <CardContent className="p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户名或邮箱..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 px-4 lg:px-6 pb-4 lg:pb-6 overflow-auto">
        {/* 用户统计 */}
        <div className="mb-4 text-sm text-muted-foreground">
          共 {filteredUsers.length} 个用户
        </div>

        {/* 用户列表 */}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : filteredUsers.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16 text-muted-foreground">
              {searchQuery ? '没有找到匹配的用户' : '暂无用户'}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const roleInfo = roleLabels[user.role];
                  const isCurrentUser = user.id === currentProfile?.id;

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full flex items-center justify-center text-white font-medium text-sm">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">
                              {user.name}
                              {isCurrentUser && (
                                <span className="ml-2 text-xs text-muted-foreground">(当前)</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={roleInfo.variant} className="gap-1">
                          <roleInfo.icon className="w-3 h-3" />
                          {roleInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString('zh-CN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditModal(user)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {!isCurrentUser && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteModal(user)}
                              className="hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* 创建用户模态框 */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加新用户</DialogTitle>
            <DialogDescription>
              创建一个新的系统用户账号
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">姓名</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="输入用户姓名"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">邮箱</label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">密码</label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="至少6位字符"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">角色</label>
              <Select
                value={createForm.role}
                onValueChange={(value: UserRole) => setCreateForm({ ...createForm, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员 - 完全访问权限</SelectItem>
                  <SelectItem value="editor">编辑员 - 可编辑商品</SelectItem>
                  <SelectItem value="viewer">观察员 - 仅查看</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={submitting || !createForm.email || !createForm.password || !createForm.name}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              创建用户
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户模态框 */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>
              修改用户信息和权限
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">姓名</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">邮箱</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">新密码</label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="留空则不修改密码"
              />
              <p className="text-xs text-muted-foreground">如需修改密码请填写，否则留空</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">角色</label>
              <Select
                value={editForm.role}
                onValueChange={(value: UserRole) => setEditForm({ ...editForm, role: value })}
                disabled={selectedUser?.id === currentProfile?.id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="editor">编辑员</SelectItem>
                  <SelectItem value="viewer">观察员</SelectItem>
                </SelectContent>
              </Select>
              {selectedUser?.id === currentProfile?.id && (
                <p className="text-xs text-muted-foreground">无法修改自己的角色</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              取消
            </Button>
            <Button
              onClick={handleUpdateUser}
              disabled={submitting || !editForm.name || !editForm.email}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              保存更改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认模态框 */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              确认删除用户
            </DialogTitle>
            <DialogDescription>
              确定要删除用户 <strong>{selectedUser?.name}</strong> 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
