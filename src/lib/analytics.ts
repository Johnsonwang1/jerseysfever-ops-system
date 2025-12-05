import { supabase } from './supabase';
import type { AnalyticsData, DailyStat, ProductStat, SiteKey, OrderLineItem } from './types';

// 有效订单状态（计入销售统计）
const VALID_ORDER_STATUSES = ['completed', 'processing'];
// 退款订单状态
const REFUND_ORDER_STATUSES = ['refunded'];

export interface AnalyticsParams {
  dateFrom: string;
  dateTo: string;
  sites?: SiteKey[];
}

/**
 * 获取销售分析数据
 */
export async function getAnalytics(params: AnalyticsParams): Promise<AnalyticsData> {
  const { dateFrom, dateTo, sites } = params;

  // 构建查询
  let query = supabase
    .from('orders')
    .select('*')
    .gte('date_created', dateFrom)
    .lte('date_created', dateTo);

  if (sites && sites.length > 0) {
    query = query.in('site', sites);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error('获取订单数据失败:', error);
    throw error;
  }

  // 分类订单
  const validOrders = (orders || []).filter(o => VALID_ORDER_STATUSES.includes(o.status));
  const refundedOrders = (orders || []).filter(o => REFUND_ORDER_STATUSES.includes(o.status));

  // 计算汇总指标
  const orderCount = validOrders.length;
  const itemCount = validOrders.reduce((sum, order) => {
    const items = order.line_items as OrderLineItem[] || [];
    return sum + items.reduce((s, item) => s + (item.quantity || 0), 0);
  }, 0);
  const revenue = validOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
  const refunds = refundedOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
  const refundCount = refundedOrders.length;

  // 按日期分组统计
  const dailyMap = new Map<string, DailyStat>();

  // 初始化日期范围内的所有日期
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dailyMap.set(dateStr, {
      date: dateStr,
      orderCount: 0,
      itemCount: 0,
      revenue: 0,
      refunds: 0,
    });
  }

  // 统计有效订单
  validOrders.forEach(order => {
    const dateStr = order.date_created.split('T')[0];
    const stat = dailyMap.get(dateStr);
    if (stat) {
      stat.orderCount++;
      const items = order.line_items as OrderLineItem[] || [];
      stat.itemCount += items.reduce((s, item) => s + (item.quantity || 0), 0);
      stat.revenue += parseFloat(order.total) || 0;
    }
  });

  // 统计退款订单
  refundedOrders.forEach(order => {
    const dateStr = order.date_created.split('T')[0];
    const stat = dailyMap.get(dateStr);
    if (stat) {
      stat.refunds += parseFloat(order.total) || 0;
    }
  });

  const dailyStats = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    orderCount,
    itemCount,
    revenue,
    refunds,
    refundCount,
    dailyStats,
  };
}

/**
 * 获取商品销量排行
 */
export async function getProductRanking(params: AnalyticsParams & { limit?: number }): Promise<ProductStat[]> {
  const { dateFrom, dateTo, sites, limit = 50 } = params;

  // 构建查询
  let query = supabase
    .from('orders')
    .select('status, line_items')
    .gte('date_created', dateFrom)
    .lte('date_created', dateTo);

  if (sites && sites.length > 0) {
    query = query.in('site', sites);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error('获取订单数据失败:', error);
    throw error;
  }

  // 按 SKU 聚合
  const productMap = new Map<string, ProductStat>();

  (orders || []).forEach(order => {
    const isValid = VALID_ORDER_STATUSES.includes(order.status);
    const isRefund = REFUND_ORDER_STATUSES.includes(order.status);

    if (!isValid && !isRefund) return;

    const items = order.line_items as OrderLineItem[] || [];
    const orderSkus = new Set<string>();

    items.forEach(item => {
      const sku = item.sku || `product-${item.product_id}`;

      if (!productMap.has(sku)) {
        productMap.set(sku, {
          sku,
          name: item.name || '',
          image: item.image?.src || '',
          quantity: 0,
          revenue: 0,
          refundQuantity: 0,
          refundAmount: 0,
          orderCount: 0,
        });
      }

      const stat = productMap.get(sku)!;

      if (isValid) {
        stat.quantity += item.quantity || 0;
        stat.revenue += (item.quantity || 0) * (item.price || 0);
        if (!orderSkus.has(sku)) {
          stat.orderCount++;
          orderSkus.add(sku);
        }
      } else if (isRefund) {
        stat.refundQuantity += item.quantity || 0;
        stat.refundAmount += (item.quantity || 0) * (item.price || 0);
      }
    });
  });

  // 排序并限制数量
  const products = Array.from(productMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);

  return products;
}

/**
 * 格式化货币（多货币支持）
 */
export function formatRevenue(amount: number, currency = 'EUR'): string {
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    GBP: '£',
  };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}
