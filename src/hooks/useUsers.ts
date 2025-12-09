import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../lib/types';

// Query Keys
export const userKeys = {
  all: ['users'] as const,
  list: () => ['users', 'list'] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
};

/**
 * 获取用户列表
 */
export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: async (): Promise<UserProfile[]> => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000, // 1 分钟
  });
}

/**
 * 创建用户
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      name: string;
      role: UserRole;
    }) => {
      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: data,
      });

      if (error) throw error;
      return result;
    },
    // 乐观更新：立即在列表中显示新用户（带临时 ID）
    onMutate: async (newUser) => {
      await queryClient.cancelQueries({ queryKey: userKeys.list() });
      
      const previousUsers = queryClient.getQueryData<UserProfile[]>(userKeys.list());
      
      // 创建临时用户
      const tempUser: UserProfile = {
        id: `temp-${Date.now()}`,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      queryClient.setQueryData<UserProfile[]>(userKeys.list(), (old) => {
        return old ? [tempUser, ...old] : [tempUser];
      });
      
      return { previousUsers };
    },
    onError: (_err, _newUser, context) => {
      // 回滚
      if (context?.previousUsers) {
        queryClient.setQueryData(userKeys.list(), context.previousUsers);
      }
    },
    onSettled: () => {
      // 重新获取真实数据
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/**
 * 更新用户
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, data }: {
      userId: string;
      data: {
        name?: string;
        email?: string;
        role?: UserRole;
        password?: string;
      };
    }) => {
      const { data: result, error } = await supabase.functions.invoke('update-user', {
        body: { userId, ...data },
      });

      if (error) throw error;
      return result;
    },
    // 乐观更新
    onMutate: async ({ userId, data }) => {
      await queryClient.cancelQueries({ queryKey: userKeys.list() });
      
      const previousUsers = queryClient.getQueryData<UserProfile[]>(userKeys.list());
      
      queryClient.setQueryData<UserProfile[]>(userKeys.list(), (old) => {
        if (!old) return old;
        return old.map(user => 
          user.id === userId 
            ? { ...user, ...data } 
            : user
        );
      });
      
      return { previousUsers };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(userKeys.list(), context.previousUsers);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/**
 * 删除用户
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data: result, error } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });

      if (error) throw error;
      return result;
    },
    // 乐观更新：立即从列表中移除
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: userKeys.list() });
      
      const previousUsers = queryClient.getQueryData<UserProfile[]>(userKeys.list());
      
      queryClient.setQueryData<UserProfile[]>(userKeys.list(), (old) => {
        if (!old) return old;
        return old.filter(user => user.id !== userId);
      });
      
      return { previousUsers };
    },
    onError: (_err, _userId, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(userKeys.list(), context.previousUsers);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
