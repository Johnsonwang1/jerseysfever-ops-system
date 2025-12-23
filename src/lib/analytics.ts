import { supabase } from './supabase';
import type { AnalyticsData, ProductStat, SiteKey } from './types';

export interface AnalyticsParams {
  dateFrom: string;
  dateTo: string;
  sites?: SiteKey[];
}

// Edge Function URL
const ANALYTICS_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-analytics`;

/**
 * 获取销售分析数据（调用后端 Edge Function）
 */
export async function getAnalytics(params: AnalyticsParams): Promise<AnalyticsData> {
  const { dateFrom, dateTo, sites } = params;

  const response = await fetch(ANALYTICS_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
    body: JSON.stringify({
      dateFrom,
      dateTo,
      sites: sites && sites.length > 0 ? sites : undefined,
      limit: 100,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '获取分析数据失败');
  }

  const result = await response.json();

  // 转换为前端类型
  return {
    orderCount: result.summary.orderCount,
    itemCount: result.summary.itemCount,
    // 收入
    grossRevenue: result.summary.grossRevenue,
    estimatedRefund: result.summary.estimatedRefund,
    netRevenue: result.summary.netRevenue,
    revenue: result.summary.revenue,             // 净收入（兼容）
    refunds: result.summary.refunds,             // 预估退款（兼容）
    refundCount: result.summary.refundCount,
    // 成本
    productCost: result.summary.productCost,
    shippingCost: result.summary.shippingCost,
    platformFee: result.summary.platformFee,
    totalCost: result.summary.totalCost,
    // 利润
    grossProfit: result.summary.grossProfit,
    grossProfitRate: result.summary.grossProfitRate,
    // 退款明细
    refundRate: result.summary.refundRate,
    refundBeforeShip: result.summary.refundBeforeShip,
    refundAfterShip: result.summary.refundAfterShip,
    siteRevenues: result.siteRevenues,
    dailyStats: result.dailyStats,
  };
}

/**
 * 获取商品销量排行（调用后端 Edge Function）
 */
export async function getProductRanking(params: AnalyticsParams & { limit?: number }): Promise<ProductStat[]> {
  const { dateFrom, dateTo, sites, limit = 100 } = params;

  const response = await fetch(ANALYTICS_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
    body: JSON.stringify({
      dateFrom,
      dateTo,
      sites: sites && sites.length > 0 ? sites : undefined,
      limit,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '获取商品排行失败');
  }

  const result = await response.json();
  return result.products;
}

/**
 * 格式化货币（默认为 USD）
 */
export function formatRevenue(amount: number, currency = 'USD'): string {
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    CNY: '¥',
  };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}
