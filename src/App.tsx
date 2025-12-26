import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Layout } from './components/Layout';
import { SyncIndicator } from './components/SyncToast';
import { AuthProvider, useAuth } from './lib/auth';
import { Loader2 } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';

// 懒加载页面组件
const ProductsPage = lazy(() => import('./pages/ProductsPage').then(m => ({ default: m.ProductsPage })));
const OrdersPage = lazy(() => import('./pages/OrdersPage').then(m => ({ default: m.OrdersPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then(m => ({ default: m.CustomersPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const AdCreativeListPage = lazy(() => import('./pages/AdCreativeListPage').then(m => ({ default: m.AdCreativeListPage })));
const AdCreativePage = lazy(() => import('./pages/AdCreativePage').then(m => ({ default: m.AdCreativePage })));
const TrendingPage = lazy(() => import('./pages/TrendingPage').then(m => ({ default: m.TrendingPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));

// 受保护的路由组件 - 简化版
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuth();

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-gray-500 text-sm">正在检查登录状态...</p>
      </div>
    );
  }

  // 未登录，跳转登录页
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// 基于角色的路由保护组件
function RoleProtectedRoute({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { profile } = useAuth();
  const userRole = profile?.role || 'viewer';

  // 如果用户角色不在允许列表中，重定向到商品页面
  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/products" replace />;
  }

  return <>{children}</>;
}

// 页面加载时的 Loading 组件
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* 登录页 - 公开 */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* 受保护的路由 */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/products" replace />} />
          {/* 所有角色可访问 */}
          <Route path="products" element={<ProductsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          {/* 仅管理员可访问 */}
          <Route path="customers" element={<RoleProtectedRoute allowedRoles={['admin']}><CustomersPage /></RoleProtectedRoute>} />
          <Route path="trending" element={<RoleProtectedRoute allowedRoles={['admin']}><TrendingPage /></RoleProtectedRoute>} />
          <Route path="analytics" element={<RoleProtectedRoute allowedRoles={['admin']}><AnalyticsPage /></RoleProtectedRoute>} />
          <Route path="ad-creative" element={<RoleProtectedRoute allowedRoles={['admin']}><AdCreativeListPage /></RoleProtectedRoute>} />
          <Route path="ad-creative/new" element={<RoleProtectedRoute allowedRoles={['admin']}><AdCreativePage /></RoleProtectedRoute>} />
          <Route path="ad-creative/new/:sku" element={<RoleProtectedRoute allowedRoles={['admin']}><AdCreativePage /></RoleProtectedRoute>} />
          <Route path="ad-creative/:id" element={<RoleProtectedRoute allowedRoles={['admin']}><AdCreativePage /></RoleProtectedRoute>} />
          <Route path="users" element={<RoleProtectedRoute allowedRoles={['admin']}><UsersPage /></RoleProtectedRoute>} />
          <Route path="settings" element={<RoleProtectedRoute allowedRoles={['admin']}><SettingsPage /></RoleProtectedRoute>} />
        </Route>

        {/* 未匹配路由重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        {/* 全局同步状态指示器 */}
        <SyncIndicator />
        {/* shadcn/ui Toast */}
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
