/**
 * 同步 API 服务 - 前端调用层
 * 通过 Supabase Edge Function 执行 WooCommerce 同步操作
 */

import { supabase } from './supabase';
import type { SiteKey } from './types';

// ==================== 类型定义 ====================

// 可选择同步的字段
export type SyncField = 'name' | 'description' | 'categories' | 'prices' | 'stock' | 'status' | 'images';

export interface SyncOptions {
  fields?: SyncField[];  // 指定要同步的字段，不传则同步所有（除 images）
  syncImages?: boolean;  // 兼容旧参数
}

export interface SyncResult {
  site: SiteKey;
  success: boolean;
  error?: string;
}

export interface SyncProductResponse {
  success: boolean;
  results: SyncResult[];
}

export interface SyncAllResponse {
  success: boolean;
  results: Record<SiteKey, { synced: number; errors: number }>;
}

// ==================== 同步单个商品 ====================

/**
 * 同步商品到指定站点
 * 通过 Edge Function 执行，API 密钥安全存储在服务端
 */
export async function syncProductToSites(
  sku: string,
  sites: SiteKey[],
  options?: SyncOptions
): Promise<SyncResult[]> {
  console.log(`🚀 调用 Edge Function 同步 ${sku} 到 ${sites.length} 个站点`);
  
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'sync-product',
      sku,
      sites,
      options,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
    // 返回所有站点失败
    return sites.map(site => ({
      site,
      success: false,
      error: error.message || 'Edge Function 调用失败',
    }));
  }

  if (!data?.success) {
    return sites.map(site => ({
      site,
      success: false,
      error: data?.error || '同步失败',
    }));
  }

  return data.results as SyncResult[];
}

// ==================== 批量同步多个商品 ====================

export interface BatchSyncResult {
  sku: string;
  results: SyncResult[];
}

/**
 * 批量同步多个商品到指定站点
 * 共享分类缓存，比逐个同步更快
 */
export async function syncProductsBatch(
  skus: string[],
  sites: SiteKey[],
  options?: SyncOptions
): Promise<BatchSyncResult[]> {
  console.log(`🚀 批量同步 ${skus.length} 个商品到 ${sites.length} 个站点`);
  
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'sync-products-batch',
      skus,
      sites,
      options,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
    return skus.map(sku => ({
      sku,
      results: sites.map(site => ({
        site,
        success: false,
        error: error.message || 'Edge Function 调用失败',
      })),
    }));
  }

  if (!data?.success) {
    return skus.map(sku => ({
      sku,
      results: sites.map(site => ({
        site,
        success: false,
        error: data?.error || '同步失败',
      })),
    }));
  }

  return data.results as BatchSyncResult[];
}

// ==================== 全量同步 ====================

/**
 * 全量同步所有站点商品
 * 从 WooCommerce 拉取数据到 Supabase
 */
export async function syncAllProducts(
  onProgress?: (message: string) => void
): Promise<SyncAllResponse> {
  console.log('🚀 调用 Edge Function 全量同步');
  onProgress?.('正在连接服务...');
  
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'sync-all',
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
    throw new Error(error.message || '全量同步失败');
  }

  if (!data?.success) {
    throw new Error(data?.error || '全量同步失败');
  }

  return data as SyncAllResponse;
}

// ==================== 清理图片 ====================

/**
 * 清理商品图片
 */
export async function cleanupProductImages(
  site: SiteKey,
  productId: number
): Promise<{ success: boolean; error?: string; details?: any }> {
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'cleanup-images',
      site,
      productId,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

// ==================== 发布新商品 ====================

export interface PublishProductData {
  sku?: string;  // 可选，不传则自动生成
  name: string;
  images: string[];  // 图片 URL 列表
  categories: string[];
  attributes: {
    team?: string;
    season: string;
    type: string;
    version: string;
    gender: string;
    sleeve: string;
    events: string[];
  };
  price: string;
  content: Partial<Record<SiteKey, {
    name: string;
    description: string;
    short_description: string;
  }>>;
}

export interface PublishResult {
  site: SiteKey;
  success: boolean;
  wooId?: number;
  permalink?: string;
  error?: string;
}

export interface PublishProductResponse {
  success: boolean;
  sku: string;
  results: PublishResult[];
}

/**
 * 发布新商品到指定站点
 */
export async function publishProduct(
  sites: SiteKey[],
  product: PublishProductData
): Promise<PublishProductResponse> {
  console.log(`🚀 发布新商品到 ${sites.length} 个站点`);
  
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'publish-product',
      sites,
      product,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
    return {
      success: false,
      sku: product.sku || '',
      results: sites.map(site => ({
        site,
        success: false,
        error: error.message || 'Edge Function 调用失败',
      })),
    };
  }

  return data as PublishProductResponse;
}

// ==================== 注册 Webhooks ====================

/**
 * 注册 Webhook 到所有站点
 */
export async function registerWebhooks(
  webhookUrl: string
): Promise<Record<SiteKey, { success: boolean; error?: string }>> {
  console.log('🔗 注册 Webhooks...');
  
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'register-webhooks',
      webhookUrl,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
    const sites: SiteKey[] = ['com', 'uk', 'de', 'fr'];
    return sites.reduce((acc, site) => {
      acc[site] = { success: false, error: error.message };
      return acc;
    }, {} as Record<SiteKey, { success: boolean; error?: string }>);
  }

  return data.results;
}

