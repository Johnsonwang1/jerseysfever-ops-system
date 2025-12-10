import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getProductRanking } from '../lib/analytics';
import type { AnalyticsData, ProductStat, SiteKey } from '../lib/types';

// Query Keys
export const analyticsKeys = {
  all: ['analytics'] as const,
  summary: (params: { dateFrom: string; dateTo: string; sites?: SiteKey[] }) => 
    ['analytics', 'summary', params] as const,
  products: (params: { dateFrom: string; dateTo: string; sites?: SiteKey[]; limit?: number }) => 
    ['analytics', 'products', params] as const,
};

/**
 * 获取分析概览数据
 */
export function useAnalyticsSummary(params: {
  dateFrom: string;
  dateTo: string;
  sites?: SiteKey[];
}) {
  return useQuery({
    queryKey: analyticsKeys.summary(params),
    queryFn: async (): Promise<AnalyticsData> => {
      return getAnalytics({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        sites: params.sites && params.sites.length > 0 ? params.sites : undefined,
      });
    },
    staleTime: 60 * 1000, // 1 分钟
  });
}

/**
 * 获取商品排行数据
 */
export function useProductRanking(params: {
  dateFrom: string;
  dateTo: string;
  sites?: SiteKey[];
  limit?: number;
}) {
  return useQuery({
    queryKey: analyticsKeys.products(params),
    queryFn: async (): Promise<ProductStat[]> => {
      return getProductRanking({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        sites: params.sites && params.sites.length > 0 ? params.sites : undefined,
        limit: params.limit || 100,
      });
    },
    staleTime: 60 * 1000, // 1 分钟
  });
}

/**
 * 同时获取分析数据和商品排行
 */
export function useAnalyticsData(params: {
  dateFrom: string;
  dateTo: string;
  sites?: SiteKey[];
  limit?: number;
}) {
  const summaryQuery = useAnalyticsSummary(params);
  const productsQuery = useProductRanking(params);

  return {
    analytics: summaryQuery.data,
    products: productsQuery.data || [],
    isLoading: summaryQuery.isLoading || productsQuery.isLoading,
    error: summaryQuery.error || productsQuery.error,
    refetch: () => {
      summaryQuery.refetch();
      productsQuery.refetch();
    },
  };
}



