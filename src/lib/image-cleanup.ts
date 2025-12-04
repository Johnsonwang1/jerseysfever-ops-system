/**
 * 图片清理服务 - 前端调用层
 * 通过 Supabase Edge Function 安全地调用各站点的清理接口
 */

import type { SiteKey } from './types';
import { supabase } from './supabase';

/**
 * 图片清理结果
 */
export interface CleanupResult {
  site: SiteKey;
  success: boolean;
  error?: string;
  details?: {
    attachments_deleted: number;
    files_deleted: number;
    meta_deleted: number;
  };
}

/**
 * 清理单个站点的商品图片
 * 调用 Supabase Edge Function，由 Edge Function 安全地调用 WordPress 清理接口
 */
export async function cleanupProductImages(
  site: SiteKey,
  productId: number
): Promise<CleanupResult> {
  try {
    const { data, error } = await supabase.functions.invoke('cleanup-images', {
      body: {
        site,
        productId,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      site,
      success: data.success,
      error: data.error,
      details: data.results,
    };
  } catch (err) {
    return {
      site,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * 批量清理多个站点的商品图片
 */
export async function cleanupProductImagesOnSites(
  sites: SiteKey[],
  productIds: Partial<Record<SiteKey, number>>
): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  
  // 并行清理所有站点
  const promises = sites.map(async (site) => {
    const productId = productIds[site];
    if (!productId) {
      return {
        site,
        success: false,
        error: '该站点未发布此商品',
      } as CleanupResult;
    }
    
    return cleanupProductImages(site, productId);
  });
  
  const settled = await Promise.allSettled(promises);
  
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      // 处理 Promise 拒绝的情况
      results.push({
        site: 'com', // 默认值，实际上不应该发生
        success: false,
        error: result.reason?.message || 'Unknown error',
      });
    }
  }
  
  return results;
}
