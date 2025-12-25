/**
 * 同步 API 服务 - 前端调用层
 * 通过 Supabase Edge Function 执行 WooCommerce 同步操作
 */

import { supabase } from './supabase';
import type { SiteKey } from './types';

// ==================== 类型定义 ====================

// 可选择同步的字段
export type SyncField = 'name' | 'description' | 'categories' | 'prices' | 'stock' | 'status' | 'images';

// 商品状态类型
export type ProductStatus = 'publish' | 'draft' | 'pending' | 'private';

export interface SyncOptions {
  fields?: SyncField[];  // 指定要同步的字段，不传则同步所有（除 images）
  syncImages?: boolean;  // 兼容旧参数
  syncVideo?: boolean;   // 是否同步视频
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

// ==================== 单独同步视频 ====================

/**
 * 单独同步视频到指定站点
 * 只更新视频 URL，不影响其他商品数据
 */
export async function syncVideoToSites(
  sku: string,
  sites: SiteKey[],
  videoUrl: string | null
): Promise<SyncResult[]> {
  console.log(`🎬 同步视频 ${sku} 到 ${sites.length} 个站点`);

  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'sync-video',
      sku,
      sites,
      videoUrl,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
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
      error: data?.error || '视频同步失败',
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

// ==================== 从站点拉取商品数据 ====================

export interface PullResult {
  sku: string;
  success: boolean;
  error?: string;
}

/**
 * 从站点拉取商品数据到 PIM（包括变体信息）
 */
export async function pullProductsFromSite(
  skus: string[],
  site: SiteKey
): Promise<PullResult[]> {
  console.log(`📥 从 ${site} 站点拉取 ${skus.length} 个商品数据`);
  
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'pull-products',
      skus,
      site,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
    return skus.map(sku => ({
      sku,
      success: false,
      error: error.message || 'Edge Function 调用失败',
    }));
  }

  if (!data?.success) {
    return skus.map(sku => ({
      sku,
      success: false,
      error: data?.error || '拉取失败',
    }));
  }

  return data.results as PullResult[];
}

// ==================== 批量同步变体 ====================

export interface SyncVariationsResult {
  synced: number;
  failed: number;
  skipped: number;
  total: number;
  hasMore: boolean;
  details: Array<{ sku: string; varCount: number; error?: string }>;
}

/**
 * 批量同步指定站点的商品变体
 * @param site 站点
 * @param limit 每批数量
 * @param offset 偏移量
 */
export async function syncVariationsBatch(
  site: SiteKey,
  limit: number = 50,
  offset: number = 0
): Promise<SyncVariationsResult> {
  console.log(`🔄 [${site}] 同步变体 (limit=${limit}, offset=${offset})`);
  
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'sync-variations',
      site,
      limit,
      offset,
    },
  });

  if (error) {
    console.error('同步变体失败:', error);
    throw new Error(error.message || '同步变体失败');
  }

  if (!data?.success) {
    throw new Error(data?.error || '同步变体失败');
  }

  return {
    synced: data.synced,
    failed: data.failed,
    skipped: data.skipped,
    total: data.total,
    hasMore: data.hasMore,
    details: data.details,
  };
}

/**
 * 全量同步指定站点的所有商品变体
 * @param site 站点
 * @param onProgress 进度回调
 */
export async function syncAllVariations(
  site: SiteKey,
  onProgress?: (progress: { synced: number; total: number; current: string }) => void
): Promise<{ synced: number; failed: number; total: number }> {
  let offset = 0;
  const limit = 50;
  let totalSynced = 0;
  let totalFailed = 0;
  let total = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await syncVariationsBatch(site, limit, offset);
    totalSynced += result.synced;
    totalFailed += result.failed;
    total = result.total;
    hasMore = result.hasMore;
    offset += limit;

    // 回调进度
    if (onProgress && result.details.length > 0) {
      const lastSku = result.details[result.details.length - 1]?.sku || '';
      onProgress({
        synced: totalSynced,
        total,
        current: lastSku,
      });
    }
  }

  return { synced: totalSynced, failed: totalFailed, total };
}

// ==================== 重建变体 ====================

export interface RebuildResult {
  site: SiteKey;
  success: boolean;
  deleted: number;
  created: number;
  error?: string;
}

/**
 * 重建商品变体
 * 删除旧变体，创建新变体（SKU 格式: {产品SKU}-{尺码}）
 */
export async function rebuildVariations(
  sku: string,
  sites: SiteKey[]
): Promise<{ sku: string; results: RebuildResult[] }> {
  console.log(`🔄 重建变体: ${sku} -> ${sites.join(', ')}`);
  
  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'rebuild-variations',
      sku,
      sites,
    },
  });

  if (error) {
    console.error('重建变体失败:', error);
    throw new Error(error.message || '重建变体失败');
  }

  if (!data?.success) {
    throw new Error(data?.error || '重建变体失败');
  }

  return {
    sku: data.sku,
    results: data.results,
  };
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

// ==================== 删除商品 ====================

export interface DeleteResult {
  site: SiteKey;
  success: boolean;
  error?: string;
}

export interface DeleteProductResponse {
  success: boolean;
  results: DeleteResult[];
  localDeleted: boolean;
}

/**
 * 从指定站点删除商品
 * @param sku 商品 SKU
 * @param sites 要删除的站点列表
 * @param deleteLocal 是否同时删除本地数据库记录，默认 true
 */
export async function deleteProductFromSites(
  sku: string,
  sites: SiteKey[],
  deleteLocal: boolean = true
): Promise<DeleteProductResponse> {
  console.log(`🗑️ 删除商品 ${sku} 从 ${sites.length} 个站点`);

  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'delete-product',
      sku,
      sites,
      deleteLocal,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
    return {
      success: false,
      results: sites.map(site => ({
        site,
        success: false,
        error: error.message || 'Edge Function 调用失败',
      })),
      localDeleted: false,
    };
  }

  return data as DeleteProductResponse;
}

// ==================== 从站点拉取商品数据到 PIM ====================

export interface PullResult {
  sku: string;
  success: boolean;
  error?: string;
}

// ==================== 修改商品状态（发布/未发布） ====================

export interface UpdateStatusResult {
  site: SiteKey;
  success: boolean;
  error?: string;
}

/**
 * 修改商品的发布状态
 * @param sku 商品 SKU
 * @param sites 要修改的站点列表
 * @param status 目标状态（publish/draft）
 */
export async function updateProductStatus(
  sku: string,
  sites: SiteKey[],
  status: ProductStatus
): Promise<UpdateStatusResult[]> {
  console.log(`📝 修改商品 ${sku} 状态为 ${status} (${sites.join(', ')})`);

  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'update-status',
      sku,
      sites,
      status,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
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
      error: data?.error || '状态更新失败',
    }));
  }

  return data.results as UpdateStatusResult[];
}

/**
 * 设置商品为未发布（草稿）状态
 */
export async function unpublishProduct(
  sku: string,
  sites: SiteKey[]
): Promise<UpdateStatusResult[]> {
  return updateProductStatus(sku, sites, 'draft');
}

// ==================== 获取商品变体 ====================

export interface ProductVariation {
  id: number;
  sku: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  attributes: { name: string; option: string }[];
}

export interface GetVariationsResponse {
  success: boolean;
  variations: ProductVariation[];
  count: number;
  error?: string;
}

/**
 * 获取商品的所有变体
 * @param site 站点
 * @param productId WooCommerce 商品 ID
 */
export async function getProductVariations(
  site: SiteKey,
  productId: number
): Promise<GetVariationsResponse> {
  console.log(`📦 获取 ${site} 站点商品 ${productId} 的变体`);

  const { data, error } = await supabase.functions.invoke('woo-sync', {
    body: {
      action: 'get-variations',
      site,
      productId,
    },
  });

  if (error) {
    console.error('Edge Function 调用失败:', error);
    return {
      success: false,
      variations: [],
      count: 0,
      error: error.message || 'Edge Function 调用失败',
    };
  }

  return data as GetVariationsResponse;
}

