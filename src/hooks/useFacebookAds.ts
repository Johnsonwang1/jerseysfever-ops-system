// Facebook Ads React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFbAdAccounts,
  getFbAdsSummary,
  getCampaignPerformance,
  getDailyTrend,
  getDailyTrendByCountry,
  getCountryBreakdown,
  getExchangeRates,
  getSyncLogs,
  syncFbAdsData,
  getLastSyncTime,
  getCampaignDailyTrend,
  getProductAdsPerformance,
  getProductAdsSummary,
  type FbAdAccount,
  type FbAdsSummary,
  type CampaignPerformance,
  type DailyTrend,
  type ExchangeRate,
  type FbSyncLog,
  type CampaignDailyData,
  type ProductAdPerformance,
} from '@/lib/fb-ads'

// Query keys
export const fbAdsKeys = {
  all: ['fb-ads'] as const,
  accounts: () => [...fbAdsKeys.all, 'accounts'] as const,
  summary: (params: { dateFrom: string; dateTo: string; accountIds?: string[] }) =>
    [...fbAdsKeys.all, 'summary', params] as const,
  campaigns: (params: { dateFrom: string; dateTo: string; accountIds?: string[] }) =>
    [...fbAdsKeys.all, 'campaigns', params] as const,
  dailyTrend: (params: { dateFrom: string; dateTo: string; accountIds?: string[] }) =>
    [...fbAdsKeys.all, 'daily-trend', params] as const,
  campaignDailyTrend: (params: { campaignId: string; dateFrom: string; dateTo: string }) =>
    [...fbAdsKeys.all, 'campaign-daily-trend', params] as const,
  countryBreakdown: (params: { dateFrom: string; dateTo: string; accountIds?: string[] }) =>
    [...fbAdsKeys.all, 'country-breakdown', params] as const,
  exchangeRates: () => [...fbAdsKeys.all, 'exchange-rates'] as const,
  syncLogs: () => [...fbAdsKeys.all, 'sync-logs'] as const,
  lastSync: () => [...fbAdsKeys.all, 'last-sync'] as const,
  // 产品广告数据
  productAds: (params: { dateFrom: string; dateTo: string; country?: string }) =>
    [...fbAdsKeys.all, 'product-ads', params] as const,
  productAdsSummary: (params: { dateFrom: string; dateTo: string; country?: string }) =>
    [...fbAdsKeys.all, 'product-ads-summary', params] as const,
}

// 广告账户列表
export function useFbAdAccounts() {
  return useQuery<FbAdAccount[], Error>({
    queryKey: fbAdsKeys.accounts(),
    queryFn: getFbAdAccounts,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// 广告汇总数据
export function useFbAdsSummary(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
  enabled?: boolean
}) {
  const { dateFrom, dateTo, accountIds, enabled = true } = params

  return useQuery<FbAdsSummary, Error>({
    queryKey: fbAdsKeys.summary({ dateFrom, dateTo, accountIds }),
    queryFn: () => getFbAdsSummary({ dateFrom, dateTo, accountIds }),
    staleTime: 60 * 1000, // 1 minute
    enabled: enabled && !!dateFrom && !!dateTo,
  })
}

// Campaign 表现数据
export function useFbCampaignPerformance(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
  enabled?: boolean
}) {
  const { dateFrom, dateTo, accountIds, enabled = true } = params

  return useQuery<CampaignPerformance[], Error>({
    queryKey: fbAdsKeys.campaigns({ dateFrom, dateTo, accountIds }),
    queryFn: () => getCampaignPerformance({ dateFrom, dateTo, accountIds }),
    staleTime: 60 * 1000,
    enabled: enabled && !!dateFrom && !!dateTo,
  })
}

// 每日趋势 (按日期聚合 - 用于广告分析)
export function useFbDailyTrend(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
  enabled?: boolean
}) {
  const { dateFrom, dateTo, accountIds, enabled = true } = params

  return useQuery<DailyTrend[], Error>({
    queryKey: fbAdsKeys.dailyTrend({ dateFrom, dateTo, accountIds }),
    queryFn: () => getDailyTrend({ dateFrom, dateTo, accountIds }),
    staleTime: 60 * 1000,
    enabled: enabled && !!dateFrom && !!dateTo,
  })
}

// Campaign 每日趋势
export function useCampaignDailyTrend(params: {
  campaignId: string
  dateFrom: string
  dateTo: string
  enabled?: boolean
}) {
  const { campaignId, dateFrom, dateTo, enabled = true } = params

  return useQuery<CampaignDailyData[], Error>({
    queryKey: fbAdsKeys.campaignDailyTrend({ campaignId, dateFrom, dateTo }),
    queryFn: () => getCampaignDailyTrend({ campaignId, dateFrom, dateTo }),
    staleTime: 60 * 1000,
    enabled: enabled && !!campaignId && !!dateFrom && !!dateTo,
  })
}

// 每日趋势 (按国家 - 用于销售分析 ROAS 计算)
export function useFbDailyTrendByCountry(params: {
  dateFrom: string
  dateTo: string
  enabled?: boolean
}) {
  const { dateFrom, dateTo, enabled = true } = params

  return useQuery<DailyTrend[], Error>({
    queryKey: [...fbAdsKeys.all, 'dailyTrendByCountry', { dateFrom, dateTo }],
    queryFn: () => getDailyTrendByCountry({ dateFrom, dateTo }),
    staleTime: 60 * 1000,
    enabled: enabled && !!dateFrom && !!dateTo,
  })
}

// 国家分布
export function useFbCountryBreakdown(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
  enabled?: boolean
}) {
  const { dateFrom, dateTo, accountIds, enabled = true } = params

  return useQuery({
    queryKey: fbAdsKeys.countryBreakdown({ dateFrom, dateTo, accountIds }),
    queryFn: () => getCountryBreakdown({ dateFrom, dateTo, accountIds }),
    staleTime: 60 * 1000,
    enabled: enabled && !!dateFrom && !!dateTo,
  })
}

// 汇率
export function useExchangeRates() {
  return useQuery<ExchangeRate[], Error>({
    queryKey: fbAdsKeys.exchangeRates(),
    queryFn: getExchangeRates,
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

// 同步日志
export function useFbSyncLogs() {
  return useQuery<FbSyncLog[], Error>({
    queryKey: fbAdsKeys.syncLogs(),
    queryFn: () => getSyncLogs(10),
    staleTime: 30 * 1000, // 30 seconds
  })
}

// 最后同步时间
export function useLastSyncTime() {
  return useQuery<string | null, Error>({
    queryKey: fbAdsKeys.lastSync(),
    queryFn: getLastSyncTime,
    staleTime: 30 * 1000,
  })
}

// 同步数据 Mutation
export function useSyncFbAds() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) =>
      syncFbAdsData(dateFrom, dateTo),
    onSuccess: () => {
      // 同步成功后刷新所有相关查询
      queryClient.invalidateQueries({ queryKey: fbAdsKeys.all })
    },
  })
}

// 组合 Hook: 获取广告分析所需的所有数据
export function useFbAdsAnalytics(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
  enabled?: boolean
}) {
  const { dateFrom, dateTo, accountIds, enabled = true } = params

  const summaryQuery = useFbAdsSummary({ dateFrom, dateTo, accountIds, enabled })
  const campaignsQuery = useFbCampaignPerformance({ dateFrom, dateTo, accountIds, enabled })
  const dailyTrendQuery = useFbDailyTrend({ dateFrom, dateTo, accountIds, enabled })
  const countryQuery = useFbCountryBreakdown({ dateFrom, dateTo, accountIds, enabled })

  return {
    summary: summaryQuery.data,
    campaigns: campaignsQuery.data,
    dailyTrend: dailyTrendQuery.data,
    countryBreakdown: countryQuery.data,
    isLoading:
      summaryQuery.isLoading ||
      campaignsQuery.isLoading ||
      dailyTrendQuery.isLoading ||
      countryQuery.isLoading,
    isError:
      summaryQuery.isError ||
      campaignsQuery.isError ||
      dailyTrendQuery.isError ||
      countryQuery.isError,
    error: summaryQuery.error || campaignsQuery.error || dailyTrendQuery.error || countryQuery.error,
    refetch: () => {
      summaryQuery.refetch()
      campaignsQuery.refetch()
      dailyTrendQuery.refetch()
      countryQuery.refetch()
    },
  }
}

// ============ 产品广告数据 Hooks ============

// 产品广告表现数据
export function useProductAdsPerformance(params: {
  dateFrom: string
  dateTo: string
  country?: string
  sortBy?: 'spend' | 'cpc' | 'ctr' | 'impressions' | 'clicks'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  enabled?: boolean
}) {
  const { dateFrom, dateTo, country, sortBy, sortOrder, limit, enabled = true } = params

  return useQuery<ProductAdPerformance[], Error>({
    queryKey: fbAdsKeys.productAds({ dateFrom, dateTo, country }),
    queryFn: () => getProductAdsPerformance({ dateFrom, dateTo, country, sortBy, sortOrder, limit }),
    staleTime: 60 * 1000, // 1 minute
    enabled: enabled && !!dateFrom && !!dateTo,
  })
}

// 产品广告汇总
export function useProductAdsSummary(params: {
  dateFrom: string
  dateTo: string
  country?: string
  enabled?: boolean
}) {
  const { dateFrom, dateTo, country, enabled = true } = params

  return useQuery({
    queryKey: fbAdsKeys.productAdsSummary({ dateFrom, dateTo, country }),
    queryFn: () => getProductAdsSummary({ dateFrom, dateTo, country }),
    staleTime: 60 * 1000,
    enabled: enabled && !!dateFrom && !!dateTo,
  })
}
