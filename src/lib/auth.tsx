import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { UserProfile, UserRole } from './types';

// 重新导出类型，保持向后兼容
export type { UserProfile, UserRole };

// 认证状态
type AuthState = 'initializing' | 'authenticated' | 'unauthenticated';
type ProfileState = 'idle' | 'loading' | 'loaded' | 'error';

// 认证上下文类型
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  authState: AuthState;
  profileState: ProfileState;
  error: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasProfile: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 获取用户资料 - 简化版，不再复杂重试
async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    console.log('[Auth] Fetching profile for:', userId);

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[Auth] Profile fetch error:', error.code, error.message);
      return null;
    }

    console.log('[Auth] Profile fetched successfully');
    return data;
  } catch (err) {
    console.error('[Auth] Profile fetch exception:', err);
    return null;
  }
}

// 认证 Provider
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<AuthState>('initializing');
  const [profileState, setProfileState] = useState<ProfileState>('idle');
  const [error, setError] = useState<string | null>(null);

  // 追踪组件是否挂载
  const mountedRef = useRef(true);
  // 追踪是否已初始化
  const initializedRef = useRef(false);

  // 加载用户资料
  const loadProfile = useCallback(async (userId: string) => {
    if (!mountedRef.current) return;

    setProfileState('loading');
    setError(null);

    // 简单重试逻辑：最多重试 2 次，每次间隔 500ms
    let lastError: string | null = null;
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        console.log(`[Auth] Retry ${i}/2...`);
        await delay(500);
      }

      const userProfile = await fetchUserProfile(userId);

      if (!mountedRef.current) return;

      if (userProfile) {
        setProfile(userProfile);
        setProfileState('loaded');
        setError(null);
        return;
      }

      lastError = '加载用户资料失败';
    }

    // 所有重试都失败
    setProfile(null);
    setProfileState('error');
    setError(lastError || '用户资料不存在，请联系管理员');
  }, []);

  // 刷新用户资料
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await loadProfile(user.id);
    }
  }, [user?.id, loadProfile]);

  // 初始化 - 只运行一次
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    mountedRef.current = true;

    console.log('[Auth] Initializing...');

    // 获取当前 session
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!mountedRef.current) return;

      console.log('[Auth] Initial session:', currentSession?.user?.id || 'none');

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        setAuthState('authenticated');
        await loadProfile(currentSession.user.id);
      } else {
        setAuthState('unauthenticated');
      }
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, newSession: Session | null) => {
        if (!mountedRef.current) return;

        console.log('[Auth] Auth event:', event);

        // 忽略 INITIAL_SESSION，因为我们已经在 getSession 中处理了
        if (event === 'INITIAL_SESSION') {
          return;
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (event === 'SIGNED_OUT' || !newSession) {
          setProfile(null);
          setAuthState('unauthenticated');
          setProfileState('idle');
          setError(null);
          return;
        }

        if (event === 'SIGNED_IN' && newSession?.user) {
          setAuthState('authenticated');
          // 小延迟确保 token 设置完成
          await delay(100);
          await loadProfile(newSession.user.id);
        }

        if (event === 'TOKEN_REFRESHED') {
          // Token 刷新不需要重新加载 profile
          console.log('[Auth] Token refreshed');
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // 登录
  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return { error: signInError as Error };
      }

      return { error: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('登录失败');
      setError(error.message);
      return { error };
    }
  }, []);

  // 登出
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] Sign out error:', err);
    }
    // 无论成功失败都清理状态
    setUser(null);
    setProfile(null);
    setSession(null);
    setAuthState('unauthenticated');
    setProfileState('idle');
    setError(null);
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
    authState,
    profileState,
    error,
    loading: authState === 'initializing' || profileState === 'loading',
    isAuthenticated: authState === 'authenticated' && profileState === 'loaded' && !!profile,
    isAdmin: profile?.role === 'admin',
    hasProfile: profileState === 'loaded' && !!profile,
    signIn,
    signOut,
    refreshProfile,
    status: computedStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
