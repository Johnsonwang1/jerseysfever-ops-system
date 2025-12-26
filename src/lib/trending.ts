/**
 * Trending 推荐系统 - 前端数据访问层
 * 
 * 包含:
 * - 足球比赛数据查询
 * - Google Trends 数据查询
 * - AI 推荐数据查询
 * - 球队-产品匹配逻辑
 */

import { supabase } from './supabase';

// ============================================
// 类型定义
// ============================================

export interface FootballMatch {
  id: string;
  match_id: number;
  competition_code: string;
  competition_name: string;
  home_team: string;
  home_team_short?: string;
  home_team_crest?: string;
  away_team: string;
  away_team_short?: string;
  away_team_crest?: string;
  match_date: string;
  status: string;
  home_score?: number;
  away_score?: number;
  match_importance?: string;
  importance_score: number;
  target_countries: string[];
  matched_teams?: TeamMatch[];
  synced_at: string;
}

export interface TeamMatch {
  team_name: string;
  product_count: number;
  top_skus: string[];
}

export interface TrendsData {
  id: string;
  keyword: string;
  country_code: string;
  interest_score: number;
  trend_direction: 'rising' | 'stable' | 'declining';
  change_percentage?: number;
  related_queries?: Array<{ query: string; score: number }>;
  data_date: string;
}

export interface TeamRecommendation {
  team: string;
  score: number;
  reasons: string[];
  upcoming_matches: Array<{
    opponent: string;
    date: string;
    competition: string;
    importance: string;
  }>;
  trends_data?: {
    interest_score: number;
    direction: string;
  };
  matched_skus: string[];
  ad_suggestion: string;
}

export interface AIRecommendation {
  id: string;
  target_country: string;
  recommendation_date: string;
  teams: TeamRecommendation[];
  ai_summary: string;
  ai_highlights?: Array<{
    title: string;
    description: string;
    type: string;
  }>;
  ai_model: string;
  confidence_score: number;
  created_at: string;
}

export interface TeamNameMapping {
  id: string;
  canonical_name: string;
  aliases: string[];
  primary_competition?: string;
  country?: string;
  target_markets: string[];
  is_popular: boolean;
}

// ============================================
// 足球比赛相关 API
// ============================================

/**
 * 获取即将到来的比赛
 */
export async function getUpcomingMatches(options?: {
  days?: number;
  country?: string;
  competition?: string;
  limit?: number;
}): Promise<FootballMatch[]> {
  const { days = 21, country, competition, limit = 50 } = options || {};  // 扩大到21天
  
  const now = new Date();
  const future = new Date();
  future.setDate(now.getDate() + days);

  let query = supabase
    .from('football_matches')
    .select('*')
    .gte('match_date', now.toISOString())
    .lte('match_date', future.toISOString())
    .in('status', ['SCHEDULED', 'TIMED'])  // Football-Data API 使用 TIMED 表示已安排的比赛
    .order('match_date', { ascending: true })
    .limit(limit);

  if (country) {
    query = query.contains('target_countries', [country]);
  }

  if (competition) {
    query = query.eq('competition_code', competition);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching upcoming matches:', error);
    throw error;
  }

  return data || [];
}

/**
 * 获取今日比赛
 */
export async function getTodayMatches(): Promise<FootballMatch[]> {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const { data, error } = await supabase
    .from('football_matches')
    .select('*')
    .gte('match_date', startOfDay.toISOString())
    .lte('match_date', endOfDay.toISOString())
    .order('match_date', { ascending: true });

  if (error) {
    console.error('Error fetching today matches:', error);
    throw error;
  }

  return data || [];
}

/**
 * 获取高重要性比赛（德比、决赛等）
 */
export async function getHighImportanceMatches(options?: {
  days?: number;
  minScore?: number;
}): Promise<FootballMatch[]> {
  const { days = 14, minScore = 70 } = options || {};
  
  const now = new Date();
  const future = new Date();
  future.setDate(now.getDate() + days);

  const { data, error } = await supabase
    .from('football_matches')
    .select('*')
    .gte('match_date', now.toISOString())
    .lte('match_date', future.toISOString())
    .gte('importance_score', minScore)
    .order('importance_score', { ascending: false });

  if (error) {
    console.error('Error fetching high importance matches:', error);
    throw error;
  }

  return data || [];
}

/**
 * 同步比赛数据（调用 Edge Function）
 */
export async function syncFootballMatches(options?: {
  dateFrom?: string;
  dateTo?: string;
  competitions?: string[];
}): Promise<{ success: boolean; total_synced?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('football-sync', {
    body: {
      action: 'sync',
      ...options,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

// ============================================
// 球队-产品匹配
// ============================================

/**
 * 获取球队名称映射
 */
export async function getTeamMappings(): Promise<TeamNameMapping[]> {
  const { data, error } = await supabase
    .from('team_name_mappings')
    .select('*')
    .order('canonical_name');

  if (error) {
    console.error('Error fetching team mappings:', error);
    throw error;
  }

  return data || [];
}

/**
 * 根据球队名查找匹配的产品
 */
export async function findProductsByTeam(teamName: string): Promise<{
  team: string;
  products: Array<{ sku: string; name: string; images: string[] }>;
}> {
  // 先从映射表获取球队别名
  const { data: mappings } = await supabase
    .from('team_name_mappings')
    .select('canonical_name, aliases')
    .or(`canonical_name.ilike.%${teamName}%,aliases.cs.{${teamName}}`);

  const searchTerms: string[] = [teamName];
  
  if (mappings && mappings.length > 0) {
    for (const mapping of mappings) {
      searchTerms.push(mapping.canonical_name);
      if (mapping.aliases) {
        searchTerms.push(...mapping.aliases);
      }
    }
  }

  // 在产品表中搜索
  const uniqueTerms = [...new Set(searchTerms)];
  const orConditions = uniqueTerms.map(term => 
    `name.ilike.%${term}%,attributes->team.ilike.%${term}%,categories.cs.["${term}"]`
  ).join(',');

  const { data: products, error } = await supabase
    .from('products')
    .select('sku, name, images, attributes, categories')
    .or(orConditions)
    .limit(20);

  if (error) {
    console.error('Error finding products by team:', error);
    return { team: teamName, products: [] };
  }

  return {
    team: teamName,
    products: (products || []).map(p => ({
      sku: p.sku,
      name: p.name,
      images: p.images || [],
    })),
  };
}

/**
 * 批量匹配比赛中的球队与产品
 */
export async function matchTeamsToProducts(matches: FootballMatch[]): Promise<
  Map<string, { team: string; productCount: number; topSkus: string[] }>
> {
  const teamSet = new Set<string>();
  
  for (const match of matches) {
    teamSet.add(match.home_team);
    teamSet.add(match.away_team);
  }

  const teamProducts = new Map<string, { team: string; productCount: number; topSkus: string[] }>();

  for (const team of teamSet) {
    const result = await findProductsByTeam(team);
    teamProducts.set(team, {
      team,
      productCount: result.products.length,
      topSkus: result.products.slice(0, 5).map(p => p.sku),
    });
  }

  return teamProducts;
}

// ============================================
// Google Trends 相关 API
// ============================================

/**
 * 获取最新的 Trends 数据
 */
export async function getTrendsData(options?: {
  country?: string;
  keywords?: string[];
  limit?: number;
}): Promise<TrendsData[]> {
  const { country, keywords, limit = 50 } = options || {};

  let query = supabase
    .from('trends_data')
    .select('*')
    .order('data_date', { ascending: false })
    .order('interest_score', { ascending: false })
    .limit(limit);

  if (country) {
    query = query.eq('country_code', country);
  }

  if (keywords && keywords.length > 0) {
    query = query.in('keyword', keywords);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching trends data:', error);
    throw error;
  }

  return data || [];
}

/**
 * 获取热门上升趋势
 */
export async function getRisingTrends(country?: string): Promise<TrendsData[]> {
  let query = supabase
    .from('trends_data')
    .select('*')
    .eq('trend_direction', 'rising')
    .order('change_percentage', { ascending: false })
    .limit(20);

  if (country) {
    query = query.eq('country_code', country);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching rising trends:', error);
    throw error;
  }

  return data || [];
}

// ============================================
// AI 推荐相关 API
// ============================================

/**
 * 获取最新的 AI 推荐
 */
export async function getLatestRecommendation(country: string): Promise<AIRecommendation | null> {
  const { data, error } = await supabase
    .from('ai_recommendations')
    .select('*')
    .eq('target_country', country)
    .order('recommendation_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // No data found
    }
    console.error('Error fetching recommendation:', error);
    throw error;
  }

  return data;
}

/**
 * 获取所有国家的最新推荐
 */
export async function getAllLatestRecommendations(): Promise<Record<string, AIRecommendation | null>> {
  const countries = ['DE', 'UK', 'FR', 'US'];
  const results: Record<string, AIRecommendation | null> = {};

  for (const country of countries) {
    results[country] = await getLatestRecommendation(country);
  }

  return results;
}

/**
 * 触发 AI 推荐生成（调用 Edge Function）
 */
export async function generateAIRecommendations(country?: string): Promise<{
  success: boolean;
  recommendations?: AIRecommendation[];
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('ai-trending-recommend', {
    body: {
      action: 'generate',
      country,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

// ============================================
// AI Agent 推荐 API（向量搜索版 + 结构化输出）
// ============================================

export interface AgentToolCall {
  tool: string;
  result: any;
  error?: string;
}

/** 产品详情（包含图片、价格、库存） */
export interface ProductDetail {
  sku: string;
  name: string;
  images: string[];
  price: Record<string, number>;
  stock: Record<string, number>;
  similarity: number;
}

/** 结构化推荐 - 单个球队推荐 */
export interface TeamRecommendationV2 {
  rank: number;
  team: string;
  team_cn: string;
  reason: string;
  sales_7d: number;
  trend: 'up' | 'stable' | 'down';
  products: ProductDetail[];
  upcoming_match?: string;
}

/** 结构化推荐结果 */
export interface StructuredRecommendation {
  summary: string;
  generated_at: string;
  country: string;
  recommendations: TeamRecommendationV2[];
  raw_response?: string;
  tool_calls?: AgentToolCall[];
  execution_time_ms: number;
}

/** 旧版 Agent 推荐（兼容） */
export interface AgentRecommendation {
  country: string;
  response: string;
  tool_calls: AgentToolCall[];
  reasoning: string[];
  iterations: number;
  execution_time_ms: number;
}

export interface AgentHistory {
  id: string;
  target_country: string;
  recommendation_date: string;
  agent_version: string;
  agent_reasoning: string;
  tool_calls: AgentToolCall[];
  recommendations: { summary: string };
  execution_time_ms: number;
  created_at: string;
}

/**
 * 调用 AI Agent 生成推荐（向量搜索版 + 结构化输出）
 * 返回结构化数据，包含商品详情
 */
export async function generateAgentRecommendation(country: string): Promise<{
  success: boolean;
  result?: StructuredRecommendation;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('ai-recommend-agent', {
    body: {
      action: 'generate',
      country,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * 向量搜索产品
 */
export async function vectorSearchProducts(query: string, limit: number = 10): Promise<{
  success: boolean;
  results?: Array<{
    sku: string;
    name: string;
    similarity: number;
    stock_quantities: Record<string, number>;
    prices: Record<string, number>;
  }>;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('ai-recommend-agent', {
    body: {
      action: 'search',
      query,
      type: 'products',
      limit,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * 获取 Agent 推荐历史
 */
export async function getAgentHistory(limit: number = 10): Promise<AgentHistory[]> {
  const { data, error } = await supabase
    .from('recommendation_history')
    .select('*')
    .order('recommendation_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching agent history:', error);
    return [];
  }

  return data || [];
}

/**
 * 获取特定国家的最新 Agent 推荐
 */
export async function getLatestAgentRecommendation(country: string): Promise<AgentHistory | null> {
  const { data, error } = await supabase
    .from('recommendation_history')
    .select('*')
    .eq('target_country', country)
    .order('recommendation_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching agent recommendation:', error);
    return null;
  }

  return data;
}

// ============================================
// 工具函数
// ============================================

/**
 * 按日期分组比赛
 */
export function groupMatchesByDate(matches: FootballMatch[]): Map<string, FootballMatch[]> {
  const grouped = new Map<string, FootballMatch[]>();

  for (const match of matches) {
    const date = new Date(match.match_date).toLocaleDateString('en-CA'); // YYYY-MM-DD
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(match);
  }

  return grouped;
}

/**
 * 按联赛分组比赛
 */
export function groupMatchesByCompetition(matches: FootballMatch[]): Map<string, FootballMatch[]> {
  const grouped = new Map<string, FootballMatch[]>();

  for (const match of matches) {
    const competition = match.competition_code;
    if (!grouped.has(competition)) {
      grouped.set(competition, []);
    }
    grouped.get(competition)!.push(match);
  }

  return grouped;
}

/**
 * 获取联赛徽标
 */
export function getCompetitionLogo(code: string): string {
  const logos: Record<string, string> = {
    PL: 'https://crests.football-data.org/PL.png',
    BL1: 'https://crests.football-data.org/BL1.png',
    FL1: 'https://crests.football-data.org/FL1.png',
    SA: 'https://crests.football-data.org/SA.png',
    PD: 'https://crests.football-data.org/PD.png',
    CL: 'https://crests.football-data.org/CL.png',
    EL: 'https://crests.football-data.org/EL.png',
  };
  return logos[code] || '';
}

/**
 * 格式化比赛日期
 */
export function formatMatchDate(dateString: string, locale: string = 'en-US'): {
  date: string;
  time: string;
  relative: string;
} {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let relative = '';
  if (diffDays === 0) {
    relative = 'Today';
  } else if (diffDays === 1) {
    relative = 'Tomorrow';
  } else if (diffDays < 7) {
    relative = date.toLocaleDateString(locale, { weekday: 'long' });
  } else {
    relative = `In ${diffDays} days`;
  }

  return {
    date: date.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    relative,
  };
}

