import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Package, Users, LogOut, ChevronDown, Menu, X, ShoppingCart } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/auth';

const navItems = [
  { to: '/products', label: '商品管理', icon: Package },
  { to: '/orders', label: '订单管理', icon: ShoppingCart },
  { to: '/users', label: '用户管理', icon: Users, adminOnly: true },
];

export function Layout() {
  const { profile, signOut, isAdmin } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // 路由变化时关闭移动端侧边栏
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 - 桌面端固定，移动端从左滑出 */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50
        w-56 bg-white border-r border-gray-200
        flex flex-col h-full
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-3 border-b border-gray-100 flex-shrink-0">
          <img src="/logo.png" alt="Jerseysfever" className="h-11" />
          {/* 移动端关闭按钮 */}
          <button
            className="lg:hidden p-2 text-gray-400 hover:text-gray-600 rounded-lg"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 导航 - 可滚动 */}
        <nav className="flex-1 py-4 overflow-y-auto min-h-0">
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

        {/* 用户信息 - 固定底部 */}
        <div className="p-3 border-t border-gray-100 flex-shrink-0" ref={menuRef}>
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
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
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

        {/* 底部版本 - 固定底部 */}
        <div className="px-4 pb-3 flex-shrink-0">
          <p className="text-xs text-gray-400 text-center">v1.0.0</p>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* 移动端顶部导航栏 */}
        <header className="lg:hidden h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg -ml-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src="/logo.png" alt="Jerseysfever" className="h-8" />
        </header>

        {/* 主内容 */}
        <main className="flex-1 overflow-auto min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
