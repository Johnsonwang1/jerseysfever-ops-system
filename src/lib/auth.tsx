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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true); // 初始化时 loading
  const [error, setError] = useState<string | null>(null);

  // 加载用户资料
  const loadProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError || !data) {
        console.error('[Auth] Profile error:', fetchError?.message);
        return null;
      }

      return data;
    } catch (err) {
      console.error('[Auth] Profile exception:', err);
      return null;
    }
  }, []);

  // 刷新资料
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      const data = await loadProfile(user.id);
      if (data) setProfile(data);
    }
  }, [user?.id, loadProfile]);

  // 初始化 - 检查现有 session
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          const profileData = await loadProfile(currentSession.user.id);
          if (mounted && profileData) {
            setProfile(profileData);
          }
        }
      } catch (err) {
        console.error('[Auth] Init error:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    init();

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setError(null);
        }

        if (event === 'TOKEN_REFRESHED' && newSession) {
          setSession(newSession);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // 登录
  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return { error: signInError as Error };
      }

      if (data.user && data.session) {
        setSession(data.session);
        setUser(data.user);

        const profileData = await loadProfile(data.user.id);
        if (profileData) {
          setProfile(profileData);
        } else {
          setError('用户资料不存在');
          return { error: new Error('用户资料不存在') };
        }
      }

      return { error: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('登录失败');
      setError(error.message);
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

  const isAuthenticated = !!user && !!profile;

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
