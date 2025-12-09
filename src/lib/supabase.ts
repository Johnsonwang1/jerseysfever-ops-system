import { createClient } from '@supabase/supabase-js';
import type { SiteKey, WooCategory } from './types';

// 支持多种环境变量命名（Vite / Vercel 集成）
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  || import.meta.env.SUPABASE_URL
  || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.SUPABASE_ANON_KEY
  || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 验证环境变量
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    url: !!supabaseUrl,
    key: !!supabaseAnonKey,
  });
  throw new Error(
    'Missing Supabase environment variables. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // 使用 localStorage 存储 session
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // 刷新 token 的提前时间（秒）
    storageKey: 'jerseysfever-auth',
  },
  global: {
    headers: {
      'x-client-info': 'jerseysfever-ops',
    },
  },
});

// 数据库中的分类记录
export interface DbCategory {
  id: number;
  site: string;
  woo_id: number;
  name: string;
  parent: number;
  synced_at: string;
}

// 从 Supabase 获取分类列表
export async function getCategoriesFromDb(site: SiteKey): Promise<WooCategory[]> {
  const { data, error } = await supabase
    .from('woo_categories')
    .select('woo_id, name, parent')
    .eq('site', site);

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return (data || []).map(row => ({
    id: row.woo_id,
    name: row.name,
    parent: row.parent,
  }));
}

// 同步 WooCommerce 分类到 Supabase
export async function syncCategoriesToDb(site: SiteKey, categories: WooCategory[]): Promise<void> {
  // 先删除该站点的旧数据
  await supabase
    .from('woo_categories')
    .delete()
    .eq('site', site);

  // 插入新数据
  const rows = categories.map(cat => ({
    site,
    woo_id: cat.id,
    name: cat.name,
    parent: cat.parent,
    synced_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from('woo_categories')
      .insert(rows);

    if (error) {
      throw new Error(`Failed to sync categories: ${error.message}`);
    }
  }
}

// 检查是否需要同步（超过24小时未同步）
export async function needsSync(site: SiteKey): Promise<boolean> {
  const { data } = await supabase
    .from('woo_categories')
    .select('synced_at')
    .eq('site', site)
    .limit(1)
    .single();

  if (!data) return true;

  const syncedAt = new Date(data.synced_at);
  const now = new Date();
  const hoursSinceSync = (now.getTime() - syncedAt.getTime()) / (1000 * 60 * 60);

  return hoursSinceSync > 24;
}

// 根据文件扩展名获取 MIME 类型
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'avif': 'image/avif',
  };
  return mimeTypes[ext || ''] || 'image/jpeg';
}

// 上传图片到 Supabase Storage，返回公开 URL
export async function uploadImageToStorage(base64Data: string, filename: string): Promise<string> {
  // 将 base64 转换为 Blob
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  
  const contentType = getMimeType(filename);
  const blob = new Blob([byteArray], { type: contentType });

  // 清理文件名（移除特殊字符）
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // 生成唯一文件路径
  const filePath = `jerseys/${Date.now()}-${cleanFilename}`;

  // 上传到 Supabase Storage
  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(filePath, blob, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`上传图片失败: ${error.message}`);
  }

  // 获取公开 URL
  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/**
 * 从远程 URL 下载图片并转存到 Supabase Storage
 * 通过 Edge Function 服务端转存，避免 CORS 问题
 */
export async function transferImageToStorage(
  imageUrl: string, 
  sku: string,
  prefix: string = 'ai-processed'
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('transfer-image', {
    body: { imageUrl, sku, prefix }
  });

  if (error) {
    console.error('Transfer image error:', error);
    throw new Error(`转存失败: ${error.message}`);
  }

  if (!data.success) {
    throw new Error(data.error || '转存失败');
  }

  return data.url;
}

// ==================== 图片迁移 API ====================

export interface ImageMigrationStats {
  totalProducts: number;
  productsWithImages: number;
  productsNeedMigration: number;
  totalImages: number;
  imagesOnCom: number;
  imagesOnStorage: number;
}

export interface MigrationResult {
  sku: string;
  success: boolean;
  migrated: number;
  skipped: number;
  failed: number;
  error?: string;
}

export interface BatchMigrationResult {
  results: MigrationResult[];
  total: number;
  hasMore: boolean;
}

/**
 * 获取图片迁移统计信息
 */
export async function getImageMigrationStats(): Promise<ImageMigrationStats> {
  const { data, error } = await supabase.functions.invoke('migrate-images', {
    body: { action: 'get-stats' }
  });

  if (error) {
    console.error('Get migration stats error:', error);
    throw new Error(`获取统计失败: ${error.message}`);
  }

  return data.stats;
}

/**
 * 迁移单个产品的图片
 */
export async function migrateProductImages(sku: string): Promise<MigrationResult> {
  const { data, error } = await supabase.functions.invoke('migrate-images', {
    body: { action: 'migrate-single', sku }
  });

  if (error) {
    console.error('Migrate product images error:', error);
    throw new Error(`迁移失败: ${error.message}`);
  }

  return data.result;
}

/**
 * 批量迁移产品图片
 */
export async function migrateImagesBatch(
  limit: number = 50,
  offset: number = 0
): Promise<BatchMigrationResult> {
  const { data, error } = await supabase.functions.invoke('migrate-images', {
    body: { action: 'migrate-batch', limit, offset }
  });

  if (error) {
    console.error('Batch migrate images error:', error);
    throw new Error(`批量迁移失败: ${error.message}`);
  }

  return {
    results: data.results,
    total: data.total,
    hasMore: data.hasMore,
  };
}
