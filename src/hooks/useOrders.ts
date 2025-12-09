import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getOrders, syncOrders, subscribeToOrders, type OrderQueryResult } from '../lib/orders';
import type { OrderStatus, SiteKey } from '../lib/types';

// Query Keys
export const orderKeys = {
  all: ['orders'] as const,
  list: (filters: {
    page?: number;
    sites?: SiteKey[];
    statuses?: OrderStatus[];
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => ['orders', 'list', filters] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};

/**
 * 获取订单列表
 */
export function useOrders(params: {
  page?: number;
  sites?: SiteKey[];
  statuses?: OrderStatus[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: async (): Promise<OrderQueryResult> => {
      return getOrders({
        sites: params.sites && params.sites.length > 0 ? params.sites : undefined,
        statuses: params.statuses && params.statuses.length > 0 ? params.statuses : undefined,
        search: params.search || undefined,
        dateFrom: params.dateFrom || undefined,
        dateTo: params.dateTo || undefined,
        page: params.page || 1,
        limit: params.limit || 20,
      });
    },
    staleTime: 30 * 1000, // 30 秒
  });
}

/**
 * 同步订单
 */
export function useSyncOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { site?: SiteKey; after?: string }) => {
      return syncOrders(options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}

/**
 * 订阅订单实时更新
 */
export function useOrdersRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = subscribeToOrders((payload) => {
      console.log('📦 订单实时更新:', payload.eventType);
      // 直接刷新数据，而不是只标记为 stale
      queryClient.refetchQueries({ queryKey: orderKeys.all });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);
}

/**
 * 刷新订单数据（需要从外部获取 queryClient）
 */
export function useInvalidateOrders() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: orderKeys.all });
}

