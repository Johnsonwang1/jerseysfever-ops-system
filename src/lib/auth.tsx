import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { UserProfile, UserRole } from './types';

export type { UserProfile, UserRole };

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // 兼容旧代码
  authState: 'initializing' | 'authenticated' | 'unauthenticated';
  profileState: 'idle' | 'loading' | 'loaded' | 'error';
  hasProfile: boolean;
  status: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // 默认不 loading，直接显示页面
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载用户资料
  const loadProfile = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError || !data) {
        console.error('[Auth] Profile error:', fetchError?.message);
        setError('用户资料不存在');
        setProfile(null);
        return false;
      }

      setProfile(data);
      setError(null);
      return true;
    } catch (err) {
      console.error('[Auth] Profile exception:', err);
      setError('加载用户资料失败');
      setProfile(null);
      return false;
    }
  }, []);

  // 刷新资料
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await loadProfile(user.id);
    }
  }, [user?.id, loadProfile]);

  // 初始化：后台检查 session，不阻塞页面显示
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    let mounted = true;

    // 后台静默检查 session
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!mounted) return;

      if (currentSession?.user) {
        console.log('[Auth] Found session for:', currentSession.user.email);
        setSession(currentSession);
        setUser(currentSession.user);
        await loadProfile(currentSession.user.id);
      } else {
        console.log('[Auth] No session');
      }
    }).catch(err => {
      console.error('[Auth] getSession error:', err);
    });

    // 监听登录/登出事件
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;
        console.log('[Auth] Event:', event);

        if (event === 'SIGNED_IN' && newSession?.user) {
          setSession(newSession);
          setUser(newSession.user);
          await loadProfile(newSession.user.id);
          setLoading(false);
        }

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setError(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialized, loadProfile]);

  // 登录
  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return { error: signInError as Error };
      }

      // 登录成功后手动加载 profile（不等 onAuthStateChange）
      if (data.user) {
        setSession(data.session);
        setUser(data.user);
        const success = await loadProfile(data.user.id);
        if (!success) {
          setLoading(false);
          return { error: new Error('用户资料不存在') };
        }
      }

      setLoading(false);
      return { error: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('登录失败');
      setError(error.message);
      setLoading(false);
      return { error };
    }
  }, [loadProfile]);

  // 登出
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setError(null);
  }, []);

  // 计算状态
  const isAuthenticated = !!user && !!profile;
  const authState = loading ? 'initializing' : (user ? 'authenticated' : 'unauthenticated');
  const profileState = loading ? 'loading' : (profile ? 'loaded' : (error ? 'error' : 'idle'));

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    error,
    isAuthenticated,
    isAdmin: profile?.role === 'admin',
    signIn,
    signOut,
    refreshProfile,
    authState,
    profileState,
    hasProfile: !!profile,
    status: authState,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
