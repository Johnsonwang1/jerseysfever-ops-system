/**
 * 同步服务 - 通过 Edge Function 执行 WooCommerce 同步操作
 */

import type { SiteKey } from './types';
import { supabase } from './supabase';

// 所有站点
const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr'];

// 同步进度回调
export type SyncProgressCallback = (progress: {
  site: SiteKey;
  current: number;
  total: number;
  sku?: string;
  status: 'fetching' | 'syncing' | 'done' | 'error';
  error?: string;
}) => void;

// 从单个站点同步（调用 Edge Function）
export async function syncAllFromSite(
  site: SiteKey,
  onProgress?: SyncProgressCallback
): Promise<{ synced: number; errors: number }> {
  onProgress?.({ site, current: 0, total: 0, status: 'fetching' });

  try {
    const { data, error } = await supabase.functions.invoke('woo-sync', {
      body: {
        action: 'sync-all',
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.success) {
      throw new Error(data?.error || '同步失败');
    }

    const result = data.results?.[site] || { synced: 0, errors: 0 };

    onProgress?.({
      site,
      current: result.synced,
      total: result.synced,
      status: 'done',
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    onProgress?.({
      site,
      current: 0,
      total: 0,
      status: 'error',
      error: errorMessage,
    });
    throw err;
  }
}

// 从所有站点同步（调用 Edge Function）
export async function syncAllFromAllSites(
  onProgress?: SyncProgressCallback
): Promise<Record<SiteKey, { synced: number; errors: number }>> {
  const results: Record<SiteKey, { synced: number; errors: number }> = {
    com: { synced: 0, errors: 0 },
    uk: { synced: 0, errors: 0 },
    de: { synced: 0, errors: 0 },
    fr: { synced: 0, errors: 0 },
  };

  // 通知所有站点开始
  for (const site of ALL_SITES) {
    onProgress?.({ site, current: 0, total: 0, status: 'fetching' });
  }

  try {
    const { data, error } = await supabase.functions.invoke('woo-sync', {
      body: {
        action: 'sync-all',
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.success) {
      throw new Error(data?.error || '同步失败');
    }

    // 更新结果
    for (const site of ALL_SITES) {
      if (data.results?.[site]) {
        results[site] = data.results[site];
      }
      onProgress?.({
        site,
        current: results[site].synced,
        total: results[site].synced,
        status: 'done',
      });
    }

    return results;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    for (const site of ALL_SITES) {
      onProgress?.({
        site,
        current: 0,
        total: 0,
        status: 'error',
        error: errorMessage,
      });
    }
    throw err;
  }
}

// 获取 Webhook URL
export function getWebhookUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  return `${supabaseUrl}/functions/v1/woo-webhook`;
}

// 检查 Webhook 注册状态（从数据库或调用 Edge Function）
export async function checkWebhookStatus(): Promise<Record<SiteKey, {
  registered: boolean;
  webhooks: { id: number; topic: string; status: string }[];
}>> {
  const results: Record<SiteKey, {
    registered: boolean;
    webhooks: { id: number; topic: string; status: string }[];
  }> = {
    com: { registered: false, webhooks: [] },
    uk: { registered: false, webhooks: [] },
    de: { registered: false, webhooks: [] },
    fr: { registered: false, webhooks: [] },
  };

  // 暂时返回空状态，Webhook 状态检查可通过 Settings 页面的 Edge Function 调用实现
  return results;
}
