import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys, queryClient as globalQueryClient } from '../lib/queryClient';
import { 
  getLocalProducts, 
  getProductStats, 
  updateProductDetails,
  subscribeToProducts,
  getAllCategories,
  type LocalProduct, 
  type ProductQueryParams,
  type VariationFilter,
} from '../lib/products';
import { supabase, getCategoriesFromDb } from '../lib/supabase';
import type { SiteKey, WooCategory } from '../lib/types';

// 特殊筛选类型
export type SpecialFilter = 'ai_pending' | 'unsync' | 'sync_error' | 'draft' | 'var_zero' | 'var_one' | 'var_sku_mismatch';

// ==================== Query Hooks ====================

/**
 * 获取商品列表
 */
export function useProducts(params: ProductQueryParams & {
  specialFilters?: SpecialFilter[];
  aiPendingSkus?: Set<string>;
} = {}) {
  const { specialFilters, aiPendingSkus, ...queryParams } = params;
  
  // 分离变体筛选（可在数据库端处理）和需要前端过滤的筛选
  // var_zero, var_one, var_sku_mismatch 可以在数据库端处理
  const dbVariationFilters: VariationFilter[] = (specialFilters || []).filter(
    (f): f is VariationFilter => ['var_zero', 'var_one', 'var_sku_mismatch'].includes(f)
  );
  const clientFilters = (specialFilters || []).filter(
    f => !['var_zero', 'var_one', 'var_sku_mismatch'].includes(f)  // ai_pending, unsync, sync_error, draft
  );
  
  const needsClientFilter = clientFilters.length > 0;
  const hasDbVariationFilter = dbVariationFilters.length > 0;

  return useQuery({
    queryKey: queryKeys.products.list({
      page: queryParams.page,
      perPage: queryParams.perPage,
      search: queryParams.search,
      categories: queryParams.categories,
      specialFilters,
      types: queryParams.types,
      versions: queryParams.versions,
      sleeves: queryParams.sleeves,
      genders: queryParams.genders,
    }),
    queryFn: async () => {
      // 如果有数据库端变体筛选，传递给后端
      const fetchParams = {
        ...queryParams,
        variationFilter: hasDbVariationFilter ? dbVariationFilters[0] : undefined,
      };
      
      // 如果有需要前端过滤的筛选，获取更多商品
      if (needsClientFilter) {
        fetchParams.page = 1;
        fetchParams.perPage = 2000;  // 获取足够多的数据
      }
      
      const result = await getLocalProducts(fetchParams);
      
      // 应用前端过滤
      if (needsClientFilter) {
        let filtered = result.products;

        // AI 待替换
        if (clientFilters.includes('ai_pending') && aiPendingSkus) {
          filtered = filtered.filter(p => aiPendingSkus.has(p.sku));
        }

        // 未同步（pending 或 error）
        if (clientFilters.includes('unsync')) {
          filtered = filtered.filter(p => {
            const statuses = Object.values(p.sync_status || {});
            return statuses.some(s => s === 'pending' || s === 'error');
          });
        }

        // 同步失败（只有 error 状态）
        if (clientFilters.includes('sync_error')) {
          filtered = filtered.filter(p => {
            const statuses = Object.values(p.sync_status || {});
            return statuses.some(s => s === 'error');
          });
        }

        // 草稿
        if (clientFilters.includes('draft')) {
          filtered = filtered.filter(p => {
            const wooIds = p.woo_ids || {};
            return Object.keys(wooIds).length === 0 || Object.values(wooIds).every(id => !id);
          });
        }

        // 手动分页
        const page = queryParams.page || 1;
        const perPage = queryParams.perPage || 20;
        const startIndex = (page - 1) * perPage;
        const paginatedProducts = filtered.slice(startIndex, startIndex + perPage);

        return {
          products: paginatedProducts,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / perPage),
        };
      }

      return result;
    },
    staleTime: 30 * 1000, // 30 秒内视为新鲜
  });
}

/**
 * 获取商品统计
 */
export function useProductStats() {
  return useQuery({
    queryKey: queryKeys.products.stats(),
    queryFn: getProductStats,
    staleTime: 60 * 1000, // 1 分钟
  });
}

/**
 * 获取单个商品
 */
export function useProduct(sku: string | null) {
  return useQuery({
    queryKey: queryKeys.products.detail(sku || ''),
    queryFn: async () => {
      if (!sku) return null;
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('sku', sku)
        .single();
      
      if (error) throw error;
      return data as LocalProduct;
    },
    enabled: !!sku,
  });
}

/**
 * 获取 AI 待替换的 SKU 列表
 */
export function useAiPendingSkus() {
  return useQuery({
    queryKey: queryKeys.aiTasks.pending(),
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
 * 获取分类列表（按站点）
 */
export function useCategories(site: SiteKey = 'com') {
  return useQuery({
    queryKey: queryKeys.categories.bySite(site),
    queryFn: async () => {
      const cats = await getCategoriesFromDb(site);
      return cats.filter((c: WooCategory) => c.name !== 'Uncategorized');
    },
    staleTime: 5 * 60 * 1000, // 5 分钟
  });
}

/**
 * 获取所有分类（用于商品编辑的分类选择器）
 */
export function useAllCategories() {
  return useQuery({
    queryKey: queryKeys.categories.all,
    queryFn: getAllCategories,
    staleTime: 5 * 60 * 1000, // 5 分钟
  });
}

// ==================== Mutation Hooks ====================

/**
 * 更新商品
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sku, data }: { sku: string; data: Partial<LocalProduct> }) => {
      return updateProductDetails(sku, data);
    },
    // 乐观更新
    onMutate: async ({ sku, data }) => {
      // 取消正在进行的请求
      await queryClient.cancelQueries({ queryKey: queryKeys.products.all });

      // 保存旧数据
      const previousProduct = queryClient.getQueryData(queryKeys.products.detail(sku));

      // 乐观更新单个商品
      queryClient.setQueryData(queryKeys.products.detail(sku), (old: LocalProduct | undefined) => {
        if (!old) return old;
        return { ...old, ...data };
      });

      return { previousProduct };
    },
    onError: (_err, { sku }, context) => {
      // 回滚
      if (context?.previousProduct) {
        queryClient.setQueryData(queryKeys.products.detail(sku), context.previousProduct);
      }
    },
    onSettled: () => {
      // 刷新列表
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

/**
 * 删除商品
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sku: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('sku', sku);
      
      if (error) throw error;
      return sku;
    },
    // 乐观更新：立即从列表中移除
    onMutate: async (sku) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.products.all });
      
      // 移除单个商品缓存
      queryClient.removeQueries({ queryKey: queryKeys.products.detail(sku) });
      
      return { sku };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.stats() });
    },
  });
}

// ==================== Realtime Integration ====================

/**
 * 订阅商品实时更新
 * 当数据库变化时自动刷新相关 queries
 */
export function useProductsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = subscribeToProducts(({ eventType, new: newProduct, old: oldProduct }) => {
      console.log('📦 商品实时更新:', eventType, newProduct?.sku || oldProduct?.sku);
      
      // 根据事件类型处理
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        // 更新单个商品缓存
        if (newProduct) {
          queryClient.setQueryData(queryKeys.products.detail(newProduct.sku), newProduct);
        }
      } else if (eventType === 'DELETE') {
        // 删除缓存
        if (oldProduct) {
          queryClient.removeQueries({ queryKey: queryKeys.products.detail(oldProduct.sku) });
        }
      }

      // 立即刷新列表和统计（使用 refetch 而不是 invalidate）
      queryClient.refetchQueries({ queryKey: queryKeys.products.list({}) });
      queryClient.refetchQueries({ queryKey: queryKeys.products.stats() });
    });

    return unsubscribe;
  }, [queryClient]);
}

/**
 * 订阅 AI 任务实时更新（全局）
 */
export function useAiTasksRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscription = supabase
      .channel('ai_tasks_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_image_tasks',
        },
        (payload) => {
          console.log('🤖 AI 任务实时更新:', payload.eventType);
          // AI 任务有变化时，立即刷新相关数据
          queryClient.refetchQueries({ 
            predicate: (query) => {
              const key = query.queryKey;
              return Array.isArray(key) && key[0] === 'aiTasks';
            }
          });
          queryClient.refetchQueries({ queryKey: queryKeys.products.all });
        }
      )
      .subscribe((status) => {
        console.log('🤖 AI 任务订阅状态:', status);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);
}

// ==================== Helper: 手动刷新 ====================

/**
 * 刷新所有商品数据
 */
export function invalidateProducts() {
  globalQueryClient.invalidateQueries({ queryKey: queryKeys.products.all });
}

/**
 * 刷新单个商品
 */
export function invalidateProduct(sku: string) {
  globalQueryClient.invalidateQueries({ queryKey: queryKeys.products.detail(sku) });
}

/**
 * 刷新 AI 任务
 */
export function invalidateAiTasks() {
  globalQueryClient.invalidateQueries({ queryKey: queryKeys.aiTasks.all });
}

// ==================== 批量操作 Hooks ====================

import { pullProductsFromSite, rebuildVariations as rebuildVariationsApi } from '../lib/sync-api';

/**
 * 批量拉取变体（10 个并行，带重试）
 */
export function useBatchPullVariations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      skus, 
      site 
    }: { 
      skus: string[]; 
      site: SiteKey;
    }) => {
      const BATCH_SIZE = 20;
      const results: { sku: string; success: boolean; error?: string }[] = [];

      // 分批处理
      for (let i = 0; i < skus.length; i += BATCH_SIZE) {
        const batch = skus.slice(i, i + BATCH_SIZE);
        console.log(`📥 批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(skus.length / BATCH_SIZE)}: 拉取 ${batch.length} 个商品`);

        // 批内并行，每个 SKU 单独调用（这样可以单独重试）
        const batchResults = await Promise.all(
          batch.map(sku => pullWithRetry(sku, site))
        );

        results.push(...batchResults);

        // 如果有失败，稍微等一下再继续
        if (batchResults.some(r => !r.success)) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

// 单个 SKU 拉取，带重试
async function pullWithRetry(
  sku: string, 
  site: SiteKey, 
  maxRetries = 3
): Promise<{ sku: string; success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const results = await pullProductsFromSite([sku], site);
      const result = results[0];
      if (result?.success) {
        return { sku, success: true };
      }
      throw new Error(result?.error || '拉取失败');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = errorMsg.includes('503') || 
                          errorMsg.includes('Service Unavailable') ||
                          errorMsg.includes('timeout') || 
                          errorMsg.includes('Timeout') ||
                          errorMsg.includes('ECONNRESET') ||
                          errorMsg.includes('fetch failed');

      if (isRetryable && attempt < maxRetries) {
        const waitTime = attempt * 3; // 3秒, 6秒, 9秒
        console.warn(`[${sku}] 第 ${attempt} 次失败，${waitTime}秒后重试...`);
        await new Promise(r => setTimeout(r, waitTime * 1000));
      } else if (attempt === maxRetries) {
        console.error(`[${sku}] 重试 ${maxRetries} 次后仍然失败:`, err);
        return { sku, success: false, error: errorMsg };
      }
    }
  }
  return { sku, success: false, error: '未知错误' };
}

/**
 * 批量重建变体（5 个并行，带重试）
 */
export function useBatchRebuildVariations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      skus, 
      sites 
    }: { 
      skus: string[]; 
      sites: SiteKey[];
    }) => {
      const BATCH_SIZE = 5;
      const results: { sku: string; success: boolean; error?: string }[] = [];

      // 分批处理
      for (let i = 0; i < skus.length; i += BATCH_SIZE) {
        const batch = skus.slice(i, i + BATCH_SIZE);
        console.log(`🔄 批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(skus.length / BATCH_SIZE)}: 重建 ${batch.length} 个商品`);

        // 批内并行
        const batchResults = await Promise.all(
          batch.map(sku => rebuildWithRetry(sku, sites))
        );

        results.push(...batchResults);

        // 如果有失败，稍微等一下再继续
        if (batchResults.some(r => !r.success)) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

// 单个 SKU 重建变体，带重试
async function rebuildWithRetry(
  sku: string, 
  sites: SiteKey[], 
  maxRetries = 3
): Promise<{ sku: string; success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await rebuildVariationsApi(sku, sites);
      return { sku, success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = errorMsg.includes('503') || 
                          errorMsg.includes('Service Unavailable') ||
                          errorMsg.includes('timeout') || 
                          errorMsg.includes('Timeout') ||
                          errorMsg.includes('ECONNRESET') ||
                          errorMsg.includes('fetch failed');

      if (isRetryable && attempt < maxRetries) {
        const waitTime = attempt * 3;
        console.warn(`[${sku}] 第 ${attempt} 次失败，${waitTime}秒后重试...`);
        await new Promise(r => setTimeout(r, waitTime * 1000));
      } else if (attempt === maxRetries) {
        console.error(`[${sku}] 重试 ${maxRetries} 次后仍然失败:`, err);
        return { sku, success: false, error: errorMsg };
      }
    }
  }
  return { sku, success: false, error: '未知错误' };
}

