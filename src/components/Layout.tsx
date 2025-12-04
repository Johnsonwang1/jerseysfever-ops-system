import { NavLink, Outlet } from 'react-router-dom';
import { Package, Users, LogOut, ChevronDown } from 'lucide-react';
// Package is still used in navItems
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/auth';

const navItems = [
  { to: '/products', label: '商品管理', icon: Package },
  { to: '/users', label: '用户管理', icon: Users, adminOnly: true },
];

export function Layout() {
  const { profile, signOut, isAdmin } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
  };

  // 过滤导航项（非管理员不显示管理员专属菜单）
  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-3 border-b border-gray-100">
          <img src="/logo.png" alt="Jerseysfever" className="h-11" />
        </div>

        {/* 导航 */}
        <nav className="flex-1 py-4">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 用户信息 */}
        <div className="p-3 border-t border-gray-100" ref={menuRef}>
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {/* 头像 */}
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                {profile?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              {/* 用户名和角色 */}
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {profile?.name || '用户'}
                </p>
                <p className="text-xs text-gray-500">
                  {profile?.role === 'admin' ? '管理员' : profile?.role === 'editor' ? '编辑员' : '观察员'}
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* 下拉菜单 */}
            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部版本 */}
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-400 text-center">v1.0.0</p>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
