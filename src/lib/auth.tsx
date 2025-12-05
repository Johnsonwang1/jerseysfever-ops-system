import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { UserProfile, UserRole } from './types';

// 重新导出类型，保持向后兼容
export type { UserProfile, UserRole };

// 认证状态 - 简化为三种核心状态
type AuthState = 'initializing' | 'authenticated' | 'unauthenticated';

// Profile 加载状态
type ProfileState = 'idle' | 'loading' | 'loaded' | 'error';

// 认证上下文类型
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  // 状态
  authState: AuthState;
  profileState: ProfileState;
  error: string | null;
  // 便捷属性
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasProfile: boolean;
  // 方法
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // 兼容旧 API
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


// 获取用户资料（带重试和超时）
async function fetchUserProfile(
  userId: string,
  retries = 3,
  timeoutMs = 8000
): Promise<{ data: UserProfile | null; error: string | null }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 使用 Promise.race 实现超时
      const fetchPromise = supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('请求超时')), timeoutMs);
      });

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        const errorMsg = error.message || String(error);
        const isRetryable =
          errorMsg.includes('fetch') ||
          errorMsg.includes('network') ||
          errorMsg.includes('Failed to fetch') ||
          errorMsg.includes('NetworkError') ||
          errorMsg.includes('timeout') ||
          error.code === 'PGRST301' ||
          error.code === '401' ||
          error.code === '403' ||
          error.code === '20' || // AbortError
          error.code === 'ECONNRESET';

        if (attempt < retries && isRetryable) {
          console.warn(`[Auth] Fetch profile attempt ${attempt}/${retries} failed:`, errorMsg);
          await delay(400 * attempt); // 400ms, 800ms, 1200ms
          continue;
        }

        console.error('[Auth] Failed to fetch user profile:', error);
        return { data: null, error: '加载用户资料失败' };
      }

      return { data, error: null };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (attempt < retries) {
        console.warn(`[Auth] Fetch profile attempt ${attempt}/${retries} threw:`, errorMsg);
        await delay(400 * attempt);
        continue;
      }

      console.error('[Auth] Failed to fetch user profile after retries:', err);

      if (errorMsg.includes('超时') || errorMsg.includes('timeout')) {
        return { data: null, error: '请求超时，请检查网络连接' };
      }
      return { data: null, error: '加载用户资料失败' };
    }
  }

  return { data: null, error: '加载用户资料失败' };
}

// 认证 Provider
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<AuthState>('initializing');
  const [profileState, setProfileState] = useState<ProfileState>('idle');
  const [error, setError] = useState<string | null>(null);

  // 用于追踪组件是否已卸载
  const mountedRef = useRef(true);
  // 用于追踪当前正在加载的用户 ID，避免重复请求
  const loadingUserIdRef = useRef<string | null>(null);
  // 用于追踪是否已处理过初始 session
  const initialSessionHandledRef = useRef(false);

  // 加载用户资料
  const loadProfile = useCallback(async (userId: string, _isInitial = false) => {
    // 避免重复加载同一用户
    if (loadingUserIdRef.current === userId) {
      console.log('[Auth] Skipping duplicate profile load for:', userId);
      return;
    }

    loadingUserIdRef.current = userId;
    setProfileState('loading');
    setError(null);

    try {
      const { data: userProfile, error: profileError } = await fetchUserProfile(userId);

      // 检查组件是否仍然挂载且用户 ID 仍然匹配
      if (!mountedRef.current || loadingUserIdRef.current !== userId) {
        console.log('[Auth] Profile load cancelled - component unmounted or user changed');
        return;
      }

      if (userProfile) {
        setProfile(userProfile);
        setProfileState('loaded');
        setError(null);
        console.log('[Auth] Profile loaded successfully');
      } else {
        setProfile(null);
        setProfileState('error');
        setError(profileError || '用户资料不存在，请联系管理员');
        console.error('[Auth] Profile load failed:', profileError);
      }
    } catch (err) {
      if (!mountedRef.current) return;

      console.error('[Auth] Error loading profile:', err);
      setProfile(null);
      setProfileState('error');
      setError('加载用户资料失败');
    } finally {
      if (loadingUserIdRef.current === userId) {
        loadingUserIdRef.current = null;
      }
    }
  }, []);

  // 刷新用户资料
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      loadingUserIdRef.current = null; // 允许重新加载
      await loadProfile(user.id);
    }
  }, [user?.id, loadProfile]);

  // 处理认证状态变化
  const handleAuthChange = useCallback(
    async (event: AuthChangeEvent, newSession: Session | null) => {
      if (!mountedRef.current) return;

      console.log('[Auth] Auth state changed:', event, newSession?.user?.id);

      // 同步更新 session 和 user
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // 登出事件
      if (event === 'SIGNED_OUT' || !newSession) {
        setProfile(null);
        setAuthState('unauthenticated');
        setProfileState('idle');
        setError(null);
        loadingUserIdRef.current = null;
        return;
      }

      // 有 session，设置为已认证
      setAuthState('authenticated');

      // 对于 INITIAL_SESSION，检查是否已处理
      if (event === 'INITIAL_SESSION') {
        if (initialSessionHandledRef.current) {
          console.log('[Auth] Initial session already handled, skipping');
          return;
        }
        initialSessionHandledRef.current = true;
      }

      // 登录成功后加载 profile
      if (newSession.user) {
        // 对于 SIGNED_IN 事件，添加小延迟确保 token 完全设置
        if (event === 'SIGNED_IN') {
          await delay(150);
        }

        // 只有当不是正在加载同一用户时才加载
        if (loadingUserIdRef.current !== newSession.user.id) {
          await loadProfile(newSession.user.id, event === 'INITIAL_SESSION');
        }
      }
    },
    [loadProfile]
  );

  // 初始化认证状态
  useEffect(() => {
    mountedRef.current = true;

    // 订阅认证状态变化 - 这会立即触发 INITIAL_SESSION 事件
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [handleAuthChange]);

  // 登录
  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    setProfileState('loading');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setAuthState('unauthenticated');
        setProfileState('idle');
        setError(signInError.message);
        return { error: signInError as Error };
      }

      // 成功后 onAuthStateChange 会处理状态更新
      return { error: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('登录失败');
      setAuthState('unauthenticated');
      setProfileState('idle');
      setError(error.message);
      return { error };
    }
  }, []);

  // 登出
  const signOut = useCallback(async () => {
    setProfileState('loading');

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] Sign out error:', err);
    } finally {
      // 无论成功与否，都清理本地状态
      if (mountedRef.current) {
        setUser(null);
        setProfile(null);
        setSession(null);
        setAuthState('unauthenticated');
        setProfileState('idle');
        setError(null);
        loadingUserIdRef.current = null;
      }
    }
  }, []);

  // 计算兼容的 status
  const computedStatus = (() => {
    if (authState === 'initializing') return 'loading';
    if (authState === 'unauthenticated') return 'unauthenticated';
    if (authState === 'authenticated') {
      if (profileState === 'loading') return 'loading';
      if (profileState === 'error') return 'error';
      if (profileState === 'loaded') return 'authenticated';
      return 'loading';
    }
    return 'loading';
  })();

  const value: AuthContextType = {
    user,
    profile,
    session,
    // 新状态 API
    authState,
    profileState,
    error,
    // 便捷属性
    loading: authState === 'initializing' || profileState === 'loading',
    isAuthenticated: authState === 'authenticated' && profileState === 'loaded' && !!profile,
    isAdmin: profile?.role === 'admin',
    hasProfile: profileState === 'loaded' && !!profile,
    // 方法
    signIn,
    signOut,
    refreshProfile,
    // 兼容旧 API
    status: computedStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// 使用认证上下文的 Hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
