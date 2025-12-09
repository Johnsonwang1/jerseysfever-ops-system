/**
 * 同步服务 - 通过 GCP Cloud Function 执行 WooCommerce 同步操作
 */

import type { SiteKey } from './types';
import { supabase } from './supabase';

// 所有站点
const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr'];

// GCP Cloud Function URL
const GCP_SYNC_URL = 'https://jerseysfever-full-sync-zw2y4q6kyq-as.a.run.app';

// 同步进度回调
export type SyncProgressCallback = (progress: {
  site: SiteKey;
  current: number;
  total: number;
  sku?: string;
  status: 'fetching' | 'syncing' | 'done' | 'error';
  error?: string;
}) => void;

// 同步进度数据类型
export interface SyncProgress {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  site: string | null;
  current: number;
  total: number;
  success: number;
  failed: number;
  message: string | null;
  started_at: string | null;
  updated_at: string;
}

// 订阅同步进度（Realtime）
export function subscribeSyncProgress(
  callback: (progress: SyncProgress) => void
): () => void {
  const channel = supabase
    .channel('sync-progress')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sync_progress',
        filter: 'id=eq.current',
      },
      (payload) => {
        callback(payload.new as SyncProgress);
      }
    )
    .subscribe();

  // 返回取消订阅函数
  return () => {
    supabase.removeChannel(channel);
  };
}

// 获取当前同步进度
export async function getSyncProgress(): Promise<SyncProgress | null> {
  const { data, error } = await supabase
    .from('sync_progress')
    .select('*')
    .eq('id', 'current')
    .single();

  if (error) {
    console.error('获取同步进度失败:', error);
    return null;
  }

  return data;
}

// 从单个站点同步（调用 GCP Cloud Function）
export async function syncAllFromSite(
  site: SiteKey,
  onProgress?: SyncProgressCallback
): Promise<{ synced: number; errors: number }> {
  onProgress?.({ site, current: 0, total: 0, status: 'fetching' });

  try {
    const response = await fetch(GCP_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync-site',
        site,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success && data.error) {
      throw new Error(data.error);
    }

    onProgress?.({
      site,
      current: data.success || 0,
      total: data.total || 0,
      status: 'done',
    });

    return { synced: data.success || 0, errors: data.failed || 0 };
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

// 从所有站点同步（调用 GCP Cloud Function）
// 注意：这是一个长时间运行的操作，进度通过 Realtime 订阅获取
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
    const response = await fetch(GCP_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'full-sync',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || '同步失败');
    }

    // 更新结果
    for (const site of ALL_SITES) {
      if (data.results?.[site]) {
        results[site] = {
          synced: data.results[site].success || 0,
          errors: data.results[site].failed || 0,
        };
      }
      onProgress?.({
        site,
        current: results[site].synced,
        total: results[site].synced + results[site].errors,
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
