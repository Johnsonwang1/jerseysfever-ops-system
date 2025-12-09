import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  getTasksBySku,
  createBatchTasks,
  deleteTask,
  retryTask,
  clearTasksBySku,
  transferTaskImage,
  transferAllGcsImages,
  subscribeToTasks,
  type AIImageTask,
  type TaskStatus
} from '../lib/ai-tasks';
import type { AIModelId, AspectRatioId } from '../lib/ai-image';

// Query Keys
export const aiTasksKeys = {
  all: ['aiTasks'] as const,
  bySku: (sku: string) => ['aiTasks', 'bySku', sku] as const,
  pending: () => ['aiTasks', 'pending'] as const,
};

/**
 * 获取商品的所有 AI 任务
 */
export function useAiTasks(sku: string) {
  return useQuery({
    queryKey: aiTasksKeys.bySku(sku),
    queryFn: () => getTasksBySku(sku),
    staleTime: 10 * 1000, // 10 秒
    refetchInterval: (query) => {
      // 如果有正在处理的任务，自动轮询
      const tasks = query.state.data;
      const hasPending = tasks?.some(t => t.status === 'pending' || t.status === 'processing');
      return hasPending ? 3000 : false; // 3秒轮询
    },
  });
}

/**
 * 获取 AI 待替换的 SKU 列表（全局）
 */
export function useAiPendingSkus() {
  return useQuery({
    queryKey: aiTasksKeys.pending(),
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_image_tasks')
        .select('sku')
        .eq('status', 'completed')
        .like('result_url', '%supabase.co%');
      
      return new Set(data?.map(d => d.sku) || []);
    },
    staleTime: 10 * 1000, // 10 秒
  });
}

/**
 * 创建批量 AI 任务
 */
export function useCreateAiTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sku,
      imageUrls,
      prompt,
      model,
      aspectRatio
    }: {
      sku: string;
      imageUrls: string[];
      prompt: string;
      model: AIModelId;
      aspectRatio: AspectRatioId;
    }) => {
      return createBatchTasks(sku, imageUrls, prompt, model, aspectRatio);
    },
    // 乐观更新：立即显示 pending 状态的任务
    onMutate: async ({ sku, imageUrls, prompt, model, aspectRatio }) => {
      await queryClient.cancelQueries({ queryKey: aiTasksKeys.bySku(sku) });
      
      const previousTasks = queryClient.getQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku));
      
      // 创建临时任务
      const tempTasks: AIImageTask[] = imageUrls.map((url, index) => ({
        id: `temp-${Date.now()}-${index}`,
        sku,
        original_url: url,
        result_url: null,
        prompt,
        model,
        aspect_ratio: aspectRatio,
        status: 'pending' as TaskStatus,
        error: null,
        processing_time: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      
      queryClient.setQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku), (old) => {
        return old ? [...tempTasks, ...old] : tempTasks;
      });
      
      return { previousTasks, sku };
    },
    onError: (_err, { sku }, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(aiTasksKeys.bySku(sku), context.previousTasks);
      }
    },
    onSettled: (_, __, { sku }) => {
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.bySku(sku) });
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.pending() });
    },
  });
}

/**
 * 删除 AI 任务
 */
export function useDeleteAiTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string; sku: string }) => {
      return deleteTask(taskId);
    },
    // 乐观更新：立即从列表中移除
    onMutate: async ({ taskId, sku }) => {
      await queryClient.cancelQueries({ queryKey: aiTasksKeys.bySku(sku) });
      
      const previousTasks = queryClient.getQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku));
      
      queryClient.setQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku), (old) => {
        if (!old) return old;
        return old.filter(task => task.id !== taskId);
      });
      
      return { previousTasks, sku };
    },
    onError: (_err, { sku }, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(aiTasksKeys.bySku(sku), context.previousTasks);
      }
    },
    onSettled: (_, __, { sku }) => {
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.bySku(sku) });
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.pending() });
    },
  });
}

/**
 * 重试 AI 任务
 */
export function useRetryAiTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string; sku: string }) => {
      return retryTask(taskId);
    },
    // 乐观更新：立即将状态改为 pending
    onMutate: async ({ taskId, sku }) => {
      await queryClient.cancelQueries({ queryKey: aiTasksKeys.bySku(sku) });
      
      const previousTasks = queryClient.getQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku));
      
      queryClient.setQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku), (old) => {
        if (!old) return old;
        return old.map(task => 
          task.id === taskId 
            ? { ...task, status: 'pending' as TaskStatus, result_url: null, error: null }
            : task
        );
      });
      
      return { previousTasks, sku };
    },
    onError: (_err, { sku }, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(aiTasksKeys.bySku(sku), context.previousTasks);
      }
    },
    onSettled: (_, __, { sku }) => {
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.bySku(sku) });
    },
  });
}

/**
 * 清除商品的所有 AI 任务
 */
export function useClearAiTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sku: string) => {
      return clearTasksBySku(sku);
    },
    // 乐观更新：立即清空列表
    onMutate: async (sku) => {
      await queryClient.cancelQueries({ queryKey: aiTasksKeys.bySku(sku) });
      
      const previousTasks = queryClient.getQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku));
      
      queryClient.setQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku), []);
      
      return { previousTasks, sku };
    },
    onError: (_err, sku, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(aiTasksKeys.bySku(sku), context.previousTasks);
      }
    },
    onSettled: (_, __, sku) => {
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.bySku(sku) });
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.pending() });
    },
  });
}

/**
 * 转存单个任务的图片到 Supabase
 */
export function useTransferTaskImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string; sku: string }) => {
      return transferTaskImage(taskId);
    },
    // 乐观更新：显示正在转存中
    onMutate: async ({ taskId, sku }) => {
      await queryClient.cancelQueries({ queryKey: aiTasksKeys.bySku(sku) });
      
      const previousTasks = queryClient.getQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku));
      
      queryClient.setQueryData<AIImageTask[]>(aiTasksKeys.bySku(sku), (old) => {
        if (!old) return old;
        return old.map(task => 
          task.id === taskId 
            ? { ...task, status: 'processing' as TaskStatus }
            : task
        );
      });
      
      return { previousTasks, sku };
    },
    onError: (_err, { sku }, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(aiTasksKeys.bySku(sku), context.previousTasks);
      }
    },
    onSettled: (_, __, { sku }) => {
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.bySku(sku) });
    },
  });
}

/**
 * 批量转存 GCS 图片
 */
export function useTransferAllGcsImages() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const mutation = useMutation({
    mutationFn: async (sku: string) => {
      return transferAllGcsImages(sku, (current, total) => {
        setProgress({ current, total });
      });
    },
    onSuccess: (_, sku) => {
      queryClient.invalidateQueries({ queryKey: aiTasksKeys.bySku(sku) });
      setProgress(null);
    },
    onError: () => {
      setProgress(null);
    },
  });

  return { ...mutation, progress };
}

/**
 * AI 任务实时订阅 - 针对特定 SKU
 */
export function useAiTasksRealtimeBySku(sku: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sku) return;

    const unsubscribe = subscribeToTasks(sku, (tasks) => {
      // 任务有变化时，直接更新缓存并刷新
      console.log(`🔄 [${sku}] 实时更新: ${tasks.length} 个任务`, tasks.map(t => ({ id: t.id, status: t.status, result_url: !!t.result_url })));
      
      // 强制设置新数据 - 使用新数组引用确保触发更新
      queryClient.setQueryData(aiTasksKeys.bySku(sku), [...tasks]);
      
      // 同时强制刷新 pending 列表
      queryClient.refetchQueries({ queryKey: aiTasksKeys.pending() });
    });

    return unsubscribe;
  }, [sku, queryClient]);
}

// ==================== Local Task 类型（用于乐观更新）====================

export interface LocalTask {
  id: string;
  isLocal: boolean;
  original_url: string;
  result_url: string | null;
  prompt: string;
  model: string;
  aspect_ratio: string;
  status: TaskStatus;
  error: string | null;
  processing_time: number | null;
  created_at: string;
}

/**
 * 合并本地任务和数据库任务
 */
export function mergeTasksWithLocal(
  dbTasks: AIImageTask[] = [],
  localTasks: LocalTask[] = []
): LocalTask[] {
  // 数据库任务优先，只保留那些数据库中还没有的本地任务
  const dbTaskUrls = new Set(dbTasks.map(dt => dt.original_url));
  
  // 只保留数据库中不存在的本地临时任务
  const remainingLocalTasks = localTasks.filter(lt => 
    lt.isLocal && !dbTaskUrls.has(lt.original_url)
  );
  
  return [
    ...remainingLocalTasks,
    ...dbTasks.map(t => ({ ...t, isLocal: false }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
