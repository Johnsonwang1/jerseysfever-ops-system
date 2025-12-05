import { supabase } from './supabase';
import type { Order, OrderQueryParams, OrderStatus, OrderSyncResult, SiteKey } from './types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// 调用 Edge Function
const FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/woo-sync';

async function callEdgeFunction(action: string, data: Record<string, unknown> = {}) {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...data }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Edge Function error: ${response.status} - ${error}`);
  }

  return response.json();
}

// 分页查询结果
export interface OrderQueryResult {
  orders: Order[];
  total: number;
  totalPages: number;
}

// 获取订单列表
export async function getOrders(params: OrderQueryParams = {}): Promise<OrderQueryResult> {
  const {
    sites,
    statuses,
    search,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20
  } = params;

  const offset = (page - 1) * limit;

  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' });

  // 站点筛选
  if (sites && sites.length > 0) {
    query = query.in('site', sites);
  }

  // 状态筛选
  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses);
  }

  // 搜索（订单号、客户邮箱、客户姓名）
  if (search) {
    query = query.or(`order_number.ilike.%${search}%,customer_email.ilike.%${search}%,customer_name.ilike.%${search}%`);
  }

  // 日期范围
  if (dateFrom) {
    query = query.gte('date_created', dateFrom);
  }
  if (dateTo) {
    query = query.lte('date_created', dateTo);
  }

  // 排序和分页
  query = query
    .order('date_created', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('获取订单失败:', error);
    throw error;
  }

  return {
    orders: (data || []) as Order[],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

// 获取单个订单
export async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw error;
  }

  return data as Order;
}

// 同步订单（调用 Edge Function）
export async function syncOrders(options: {
  site?: SiteKey;
  status?: string;
  after?: string;
} = {}): Promise<{ results: OrderSyncResult[] }> {
  return callEdgeFunction('sync-orders', options);
}

// 逐站点同步订单（避免超时）
// onProgress 回调会在每个站点完成后调用
export async function syncOrdersSequentially(
  options: {
    after?: string;
  } = {},
  onProgress?: (result: OrderSyncResult, completed: number, total: number) => void
): Promise<{ results: OrderSyncResult[] }> {
  const sites: SiteKey[] = ['com', 'uk', 'de', 'fr'];
  const results: OrderSyncResult[] = [];

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    try {
      const response = await callEdgeFunction('sync-orders', {
        site,
        after: options.after,
      });
      const siteResult = response.results[0];
      results.push(siteResult);
      onProgress?.(siteResult, i + 1, sites.length);
    } catch (err) {
      const errorResult: OrderSyncResult = {
        site,
        success: false,
        synced: 0,
        errors: 0,
        error: err instanceof Error ? err.message : '同步失败',
      };
      results.push(errorResult);
      onProgress?.(errorResult, i + 1, sites.length);
    }
  }

  return { results };
}

// 分批同步单个站点的订单（大量订单时使用）
// 每批最多同步 pagesPerBatch 页，返回后继续下一批
export async function syncSiteOrdersPaginated(
  site: SiteKey,
  options: {
    pagesPerBatch?: number;  // 每批页数，默认 10（即每批 1000 条）
  } = {},
  onProgress?: (batch: number, synced: number, hasMore: boolean) => void
): Promise<OrderSyncResult> {
  const pagesPerBatch = options.pagesPerBatch || 10;

  let totalSynced = 0;
  let totalErrors = 0;
  let batch = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      // 获取当前数据库中该站点最老的订单日期
      let beforeDate: string | undefined;
      if (batch > 1) {
        const { data: oldestOrder } = await supabase
          .from('orders')
          .select('date_created')
          .eq('site', site)
          .order('date_created', { ascending: true })
          .limit(1);

        if (oldestOrder && oldestOrder.length > 0) {
          beforeDate = oldestOrder[0].date_created;
        }
      }

      // 调用 Edge Function，限制页数
      const response = await callEdgeFunction('sync-orders', {
        site,
        before: beforeDate,  // 获取比这个日期更老的订单
        max_pages: pagesPerBatch,
      });

      const result = response.results[0] as OrderSyncResult;
      totalSynced += result.synced;
      totalErrors += result.errors;

      // 如果同步的数量小于预期，说明已经到头了
      hasMore = result.synced >= 100 * pagesPerBatch;

      onProgress?.(batch, totalSynced, hasMore);
      batch++;

      // 防止无限循环
      if (batch > 100) {
        console.warn('已达到最大批次限制 (100)');
        break;
      }
    } catch (err) {
      return {
        site,
        success: false,
        synced: totalSynced,
        errors: totalErrors,
        error: err instanceof Error ? err.message : '同步失败',
      };
    }
  }

  return {
    site,
    success: true,
    synced: totalSynced,
    errors: totalErrors,
  };
}

// 更新订单状态（调用 Edge Function）
export async function updateOrderStatus(
  site: SiteKey,
  wooId: number,
  status: OrderStatus
): Promise<{ success: boolean; order?: unknown; error?: string }> {
  return callEdgeFunction('update-order-status', {
    site,
    woo_id: wooId,
    status,
  });
}

// 添加订单备注（调用 Edge Function）
export async function addOrderNote(
  site: SiteKey,
  wooId: number,
  note: string,
  customerNote = false
): Promise<{ success: boolean; note?: unknown; error?: string }> {
  return callEdgeFunction('add-order-note', {
    site,
    woo_id: wooId,
    note,
    customer_note: customerNote,
  });
}

// 订阅订单变化（实时同步）
export function subscribeToOrders(
  callback: (payload: { eventType: string; new: Order; old: Order }) => void
): RealtimeChannel {
  return supabase
    .channel('orders-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
      },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new as Order,
          old: payload.old as Order,
        });
      }
    )
    .subscribe();
}

// 获取订单统计
export async function getOrderStats(): Promise<{
  total: number;
  bySite: Record<SiteKey, number>;
  byStatus: Record<OrderStatus, number>;
}> {
  // 总数
  const { count: total } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  // 按站点统计
  const { data: siteStats } = await supabase
    .from('orders')
    .select('site')
    .then(({ data }) => {
      const counts: Record<string, number> = {};
      data?.forEach(row => {
        counts[row.site] = (counts[row.site] || 0) + 1;
      });
      return { data: counts };
    });

  // 按状态统计
  const { data: statusStats } = await supabase
    .from('orders')
    .select('status')
    .then(({ data }) => {
      const counts: Record<string, number> = {};
      data?.forEach(row => {
        counts[row.status] = (counts[row.status] || 0) + 1;
      });
      return { data: counts };
    });

  return {
    total: total || 0,
    bySite: (siteStats || {}) as Record<SiteKey, number>,
    byStatus: (statusStats || {}) as Record<OrderStatus, number>,
  };
}

// 格式化货币
export function formatCurrency(amount: number, currency: string): string {
  const currencySymbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
  };

  const symbol = currencySymbols[currency] || currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}

// 格式化日期
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 获取站点显示名称
export function getSiteLabel(site: SiteKey): string {
  const labels: Record<SiteKey, string> = {
    com: '🇺🇸 .com',
    uk: '🇬🇧 .uk',
    de: '🇩🇪 .de',
    fr: '🇫🇷 .fr',
  };
  return labels[site] || site;
}
