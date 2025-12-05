import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/auth';

// 错误消息映射
function mapErrorMessage(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return '邮箱或密码错误';
  }
  if (message.includes('Email not confirmed')) {
    return '邮箱未验证，请检查邮箱';
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
    return '网络连接失败，请检查网络';
  }
  if (message.includes('timeout') || message.includes('超时')) {
    return '请求超时，请重试';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return '请求过于频繁，请稍后再试';
  }
  if (message.includes('用户资料不存在')) {
    return '用户资料不存在，请联系管理员';
  }
  // 返回原始错误（但限制长度）
  return message.length > 50 ? message.substring(0, 50) + '...' : message;
}

export function LoginPage() {
  const {
    authState,
    profileState,
    isAuthenticated,
    error: authError,
    signIn,
    refreshProfile,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initTimeout, setInitTimeout] = useState(false);

  // 初始化超时计时器
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // 设置初始化超时（8秒）
    if (authState === 'initializing') {
      timeoutRef.current = setTimeout(() => {
        setInitTimeout(true);
      }, 8000);
    } else {
      setInitTimeout(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [authState]);

  // 如果已认证，重定向到首页
  if (isAuthenticated) {
    return <Navigate to="/products" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      // 添加登录超时（15秒）
      const timeoutPromise = new Promise<{ error: Error }>((_, reject) => {
        setTimeout(() => reject(new Error('登录超时，请重试')), 15000);
      });

      const result = await Promise.race([
        signIn(email, password),
        timeoutPromise,
      ]);

      if (result.error) {
        setFormError(mapErrorMessage(result.error.message));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败，请稍后重试';
      setFormError(mapErrorMessage(message));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 重试加载 profile
  const handleRetryProfile = async () => {
    setFormError(null);
    await refreshProfile();
  };

  // 刷新页面
  const handleRefresh = () => {
    window.location.reload();
  };

  // 显示的错误（优先显示表单错误，其次是认证错误）
  const displayError = formError || (profileState === 'error' ? authError : null);

  // 是否显示重试按钮（profile 加载失败时显示）
  const showRetryButton = profileState === 'error' && authState === 'authenticated';

  // 初始化中
  if (authState === 'initializing' && !initTimeout) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-gray-500 text-sm">正在检查登录状态...</p>
      </div>
    );
  }

  // 初始化超时
  if (initTimeout) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4 p-4">
        <AlertCircle className="w-12 h-12 text-yellow-500" />
        <p className="text-gray-700 text-center">检查登录状态超时</p>
        <p className="text-gray-500 text-sm text-center">网络可能不稳定，请刷新页面重试</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新页面
        </button>
      </div>
    );
  }

  // profile 加载中（已登录但加载 profile）
  if (authState === 'authenticated' && profileState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-gray-500 text-sm">正在加载用户资料...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100 rounded-full blur-3xl" />
      </div>

      {/* 登录卡片 */}
      <div className="relative w-full max-w-md">
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Jerseysfever" className="h-28 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900">运营管理系统</h1>
        </div>

        {/* 登录表单 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 错误提示 */}
            {displayError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{displayError}</span>
                  {showRetryButton && (
                    <button
                      type="button"
                      onClick={handleRetryProfile}
                      className="ml-2 text-red-700 hover:text-red-800 underline"
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 邮箱输入 */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                邮箱地址
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* 密码输入 */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </button>
          </form>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-gray-400 text-sm mt-6">
          请联系管理员获取账号
        </p>
      </div>
    </div>
  );
}
