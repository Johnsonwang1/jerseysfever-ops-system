/**
 * Webhook 服务 - 通过 Edge Function 管理 WooCommerce Webhooks
 */

import type { SiteKey } from './types';
import { supabase } from './supabase';


export interface WebhookInfo {
  id: number;
  name: string;
  topic: string;
  delivery_url: string;
  status: string;
}

/**
 * 为所有站点注册 Webhooks（通过 Edge Function）
 */
export async function registerWebhooksForAllSites(): Promise<Record<SiteKey, { success: boolean; error?: string }>> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const webhookUrl = `${supabaseUrl}/functions/v1/woo-webhook`;

  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'register-webhooks',
      webhookUrl,
    },
  });

  if (error) {
    const sites: SiteKey[] = ['com', 'uk', 'de', 'fr'];
    return sites.reduce((acc, site) => {
      acc[site] = { success: false, error: error.message };
      return acc;
    }, {} as Record<SiteKey, { success: boolean; error?: string }>);
  }

  return data.results;
}

/**
 * 删除所有站点的 Webhooks
 * 暂时不实现，可以通过 WooCommerce 后台手动删除
 */
export async function deleteWebhooksFromAllSites(): Promise<Record<SiteKey, { deleted: number; error?: string }>> {
  return {
    com: { deleted: 0, error: '请通过 WooCommerce 后台手动删除' },
    uk: { deleted: 0, error: '请通过 WooCommerce 后台手动删除' },
    de: { deleted: 0, error: '请通过 WooCommerce 后台手动删除' },
    fr: { deleted: 0, error: '请通过 WooCommerce 后台手动删除' },
  };
}
