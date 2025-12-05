import { useState, useEffect } from 'react';
import {
  Users, Plus, Pencil, Trash2, Shield, Eye, Edit3,
  Loader2, Search, X, AlertCircle, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { UserProfile, UserRole } from '../lib/types';

const roleLabels: Record<UserRole, { label: string; color: string; icon: typeof Shield }> = {
  admin: { label: '管理员', color: 'bg-red-100 text-red-700', icon: Shield },
  editor: { label: '编辑员', color: 'bg-blue-100 text-blue-700', icon: Edit3 },
  viewer: { label: '观察员', color: 'bg-gray-100 text-gray-700', icon: Eye },
};

interface CreateUserForm {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

export function UsersPage() {
  const { isAdmin, profile: currentProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

  // 加载用户列表
  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

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
      // 调用 Edge Function 创建用户
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: createForm,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSuccess('用户创建成功');
      setShowCreateModal(false);
      setCreateForm({ email: '', password: '', name: '', role: 'editor' });
      loadUsers();
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
      // 调用 Edge Function 更新用户（支持修改邮箱和密码）
      const updateData: { userId: string; name: string; role: string; email?: string; password?: string } = {
        userId: selectedUser.id,
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

      const { data, error } = await supabase.functions.invoke('update-user', {
        body: updateData,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSuccess('用户信息已更新');
      setShowEditModal(false);
      setSelectedUser(null);
      loadUsers();
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
      // 调用 Edge Function 删除用户
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: selectedUser.id },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSuccess('用户已删除');
      setShowDeleteModal(false);
      setSelectedUser(null);
      loadUsers();
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
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center max-w-md">
          <Shield className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">权限不足</h2>
          <p className="text-yellow-600">只有管理员可以访问用户管理页面</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 固定头部区域 */}
      <div className="sticky top-0 z-20 bg-gray-50 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 space-y-4">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">用户管理</h1>
            <span className="hidden sm:inline text-sm text-gray-500">（管理系统用户和权限）</span>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">添加用户</span>
            <span className="sm:hidden">添加</span>
          </button>
        </div>

        {/* 成功/错误提示 */}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
            <Check className="w-4 h-4" />
            {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 搜索栏 */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索用户名或邮箱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
          </div>
        </div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 px-4 lg:px-6 pb-4 lg:pb-6 overflow-auto">
        {/* 用户统计 */}
        <div className="mb-4 text-sm text-gray-500">
          共 {filteredUsers.length} 个用户
        </div>

        {/* 用户列表 */}
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="text-center py-16 text-gray-500">
              {searchQuery ? '没有找到匹配的用户' : '暂无用户'}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">用户</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">邮箱</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">角色</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">创建时间</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => {
                  const roleInfo = roleLabels[user.role];
                  const isCurrentUser = user.id === currentProfile?.id;

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full flex items-center justify-center text-white font-medium text-sm">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {user.name}
                              {isCurrentUser && (
                                <span className="ml-2 text-xs text-gray-400">(当前)</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}>
                          <roleInfo.icon className="w-3 h-3" />
                          {roleInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="编辑"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!isCurrentUser && (
                            <button
                              onClick={() => openDeleteModal(user)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 创建用户模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">添加新用户</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">姓名</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                  placeholder="输入用户姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                  placeholder="至少6位字符"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">角色</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                >
                  <option value="admin">管理员 - 完全访问权限</option>
                  <option value="editor">编辑员 - 可编辑商品</option>
                  <option value="viewer">观察员 - 仅查看</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateUser}
                disabled={submitting || !createForm.email || !createForm.password || !createForm.name}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                创建用户
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑用户模态框 */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">编辑用户</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">姓名</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">新密码</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                  placeholder="留空则不修改密码"
                />
                <p className="text-xs text-gray-500 mt-1">如需修改密码请填写，否则留空</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">角色</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                  disabled={selectedUser.id === currentProfile?.id}
                >
                  <option value="admin">管理员</option>
                  <option value="editor">编辑员</option>
                  <option value="viewer">观察员</option>
                </select>
                {selectedUser.id === currentProfile?.id && (
                  <p className="text-xs text-gray-500 mt-1">无法修改自己的角色</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUpdateUser}
                disabled={submitting || !editForm.name || !editForm.email}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                保存更改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认模态框 */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">确认删除用户</h2>
              <p className="text-gray-500 mb-1">确定要删除用户 <strong>{selectedUser.name}</strong> 吗？</p>
              <p className="text-sm text-gray-400">此操作不可撤销</p>
            </div>
            <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
