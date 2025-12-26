/**
 * Trending 推荐系统 - React Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  getUpcomingMatches,
  getHighImportanceMatches,
  getTrendsData,
  getRisingTrends,
  getLatestRecommendation,
  getAllLatestRecommendations,
  syncFootballMatches,
  generateAIRecommendations,
  type FootballMatch,
  type TrendsData,
  type AIRecommendation,
} from '@/lib/trending';

// Query Keys
export const trendingKeys = {
  all: ['trending'] as const,
  matches: () => [...trendingKeys.all, 'matches'] as const,
  matchesList: (filters: Record<string, unknown>) => [...trendingKeys.matches(), filters] as const,
  matchesImportant: (days?: number) => [...trendingKeys.matches(), 'important', days] as const,
  trends: () => [...trendingKeys.all, 'trends'] as const,
  trendsByCountry: (country: string) => [...trendingKeys.trends(), country] as const,
  trendsRising: (country?: string) => [...trendingKeys.trends(), 'rising', country] as const,
  recommendations: () => [...trendingKeys.all, 'recommendations'] as const,
  recommendationByCountry: (country: string) => [...trendingKeys.recommendations(), country] as const,
  allRecommendations: () => [...trendingKeys.recommendations(), 'all'] as const,
};

// ============================================
// 比赛数据 Hooks
// ============================================

interface UseMatchesOptions {
  days?: number;
  country?: string;
  competition?: string;
  enabled?: boolean;
}

/**
 * 获取即将到来的比赛
 */
export function useUpcomingMatches(options: UseMatchesOptions = {}) {
  const { days = 21, country, competition, enabled = true } = options;  // 扩大到21天

  return useQuery({
    queryKey: trendingKeys.matchesList({ days, country, competition }),
    queryFn: () => getUpcomingMatches({ days, country, competition }),
    enabled,
    staleTime: 5 * 60 * 1000, // 5分钟
  });
}

/**
 * 获取高重要性比赛（德比、决赛等）
 */
export function useImportantMatches(options: { days?: number; minScore?: number } = {}) {
  return useQuery({
    queryKey: trendingKeys.matchesImportant(options.days),
    queryFn: () => getHighImportanceMatches(options),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 同步比赛数据
 */
export function useSyncMatches() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncFootballMatches,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trendingKeys.matches() });
    },
  });
}

// ============================================
// Trends 数据 Hooks
// ============================================

interface UseTrendsOptions {
  country?: string;
  keywords?: string[];
  enabled?: boolean;
}

/**
 * 获取 Trends 数据
 */
export function useTrendsData(options: UseTrendsOptions = {}) {
  const { country, keywords, enabled = true } = options;

  return useQuery({
    queryKey: trendingKeys.trendsByCountry(country || 'all'),
    queryFn: () => getTrendsData({ country, keywords }),
    enabled,
    staleTime: 30 * 60 * 1000, // 30分钟
  });
}

/**
 * 获取上升趋势
 */
export function useRisingTrends(country?: string) {
  return useQuery({
    queryKey: trendingKeys.trendsRising(country),
    queryFn: () => getRisingTrends(country),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * 同步 Trends 数据
 */
export function useSyncTrends() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { countries?: string[]; keywords?: string[] }) => {
      const { data, error } = await supabase.functions.invoke('trends-sync', {
        body: { action: 'sync', ...options },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trendingKeys.trends() });
    },
  });
}

// ============================================
// AI 推荐 Hooks
// ============================================

/**
 * 获取单个国家的最新推荐
 */
export function useRecommendation(country: string) {
  return useQuery({
    queryKey: trendingKeys.recommendationByCountry(country),
    queryFn: () => getLatestRecommendation(country),
    staleTime: 60 * 60 * 1000, // 1小时
  });
}

/**
 * 获取所有国家的最新推荐
 */
export function useAllRecommendations() {
  return useQuery({
    queryKey: trendingKeys.allRecommendations(),
    queryFn: getAllLatestRecommendations,
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * 生成 AI 推荐
 */
export function useGenerateRecommendations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateAIRecommendations,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trendingKeys.recommendations() });
    },
  });
}

// ============================================
// 组合 Hooks
// ============================================

/**
 * 获取 Trending 页面所需的所有数据
 */
export function useTrendingDashboard(country: string = 'DE') {
  const matchesQuery = useUpcomingMatches({ country, days: 21 });  // 扩大到21天
  const importantMatchesQuery = useImportantMatches({ days: 21 });  // 扩大到21天
  const trendsQuery = useTrendsData({ country });
  const recommendationQuery = useRecommendation(country);

  return {
    matches: matchesQuery.data || [],
    importantMatches: importantMatchesQuery.data || [],
    trends: trendsQuery.data || [],
    recommendation: recommendationQuery.data,
    isLoading: matchesQuery.isLoading || recommendationQuery.isLoading,
    error: matchesQuery.error || recommendationQuery.error,
    refetch: () => {
      matchesQuery.refetch();
      importantMatchesQuery.refetch();
      trendsQuery.refetch();
      recommendationQuery.refetch();
    },
  };
}

// ============================================
// 工具类型
// ============================================

export type { FootballMatch, TrendsData, AIRecommendation };

