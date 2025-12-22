/**
 * 广告创作数据操作 Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AdAspectRatio } from '@/lib/ad-creative/types';

// 广告创作状态类型
export type AdCreativeStatus = 'draft' | 'completed' | 'archived';

// 广告创作数据类型
export interface AdCreative {
  id: string;
  name: string;
  sku: string | null;
  aspect_ratio: AdAspectRatio;
  image_url: string | null;
  thumbnail_url: string | null;
  prompt: string | null;
  model: string | null;
  status: AdCreativeStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// 查询参数
export interface AdCreativeQueryParams {
  status?: AdCreativeStatus | 'all';
  search?: string;
  sku?: string;
}

// Query keys
export const adCreativeKeys = {
  all: ['ad-creatives'] as const,
  lists: () => [...adCreativeKeys.all, 'list'] as const,
  list: (params: AdCreativeQueryParams) => [...adCreativeKeys.lists(), params] as const,
  details: () => [...adCreativeKeys.all, 'detail'] as const,
  detail: (id: string) => [...adCreativeKeys.details(), id] as const,
};

/**
 * 查询广告创作列表
 */
export function useAdCreatives(params: AdCreativeQueryParams = {}) {
  return useQuery({
    queryKey: adCreativeKeys.list(params),
    queryFn: async () => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/92fbfe0c-e455-47e3-a678-8da60b30f029',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAdCreatives.ts:queryFn:start',message:'Fetching ad creatives',data:{params},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      let query = supabase
        .from('ad_creatives')
        .select('*')
        .order('created_at', { ascending: false });

      // 筛选状态
      if (params.status && params.status !== 'all') {
        query = query.eq('status', params.status);
      }

      // 按 SKU 筛选
      if (params.sku) {
        query = query.eq('sku', params.sku);
      }

      // 搜索（按名称或 SKU）
      if (params.search) {
        query = query.or(`name.ilike.%${params.search}%,sku.ilike.%${params.search}%`);
      }

      const { data, error } = await query;
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/92fbfe0c-e455-47e3-a678-8da60b30f029',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAdCreatives.ts:queryFn:result',message:'Ad creatives fetched',data:{count:data?.length,error:error?.message,firstItem:data?.[0]?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      if (error) throw error;
      return data as AdCreative[];
    },
  });
}

/**
 * 查询单个广告创作
 */
export function useAdCreative(id: string | null) {
  return useQuery({
    queryKey: adCreativeKeys.detail(id || ''),
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('ad_creatives')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as AdCreative;
    },
    enabled: !!id,
  });
}

// 保存广告创作的参数
export interface SaveAdCreativeParams {
  id?: string; // 如果有 id 则更新，否则新建
  name: string;
  sku?: string | null;
  aspect_ratio: AdAspectRatio;
  image_url: string;
  prompt?: string | null;
  model?: string | null;
  status: AdCreativeStatus;
}

/**
 * 保存广告创作（新建或更新）
 */
export function useSaveAdCreative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SaveAdCreativeParams) => {
      const { id, ...data } = params;

      // 获取当前用户 ID（用于新建时设置 created_by）
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      if (id) {
        // 更新
        const { data: result, error } = await supabase
          .from('ad_creatives')
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return result as AdCreative;
      } else {
        // 新建 - 需要设置 created_by 字段以满足 RLS 策略
        const { data: result, error } = await supabase
          .from('ad_creatives')
          .insert({
            ...data,
            thumbnail_url: data.image_url, // 使用主图作为缩略图
            created_by: userId, // 设置创建者 ID
          })
          .select()
          .single();

        if (error) throw error;
        return result as AdCreative;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adCreativeKeys.all });
    },
  });
}

/**
 * 更新广告创作状态
 */
export function useUpdateAdCreativeStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AdCreativeStatus }) => {
      const { data, error } = await supabase
        .from('ad_creatives')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AdCreative;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adCreativeKeys.all });
      queryClient.setQueryData(adCreativeKeys.detail(data.id), data);
    },
  });
}

/**
 * 删除广告创作
 */
export function useDeleteAdCreative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ad_creatives')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: adCreativeKeys.lists() });
      queryClient.removeQueries({ queryKey: adCreativeKeys.detail(id) });
    },
  });
}
