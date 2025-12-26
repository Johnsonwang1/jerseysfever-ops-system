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

// ========== Logo URL 管理 ==========
// Logo 在 Storage 中的固定路径
const LOGO_STORAGE_PATH = 'brand/jerseysfever-logo.png';
// 缓存 Logo URL（避免重复上传）
let cachedLogoUrl: string | null = null;

/**
 * 获取 Logo 的公开 URL
 * 如果 Logo 还没上传到 Storage，会自动从 public/logo.png 获取并上传
 */
export async function getBrandLogoUrl(): Promise<string> {
  // 如果有缓存，直接返回
  if (cachedLogoUrl) {
    return cachedLogoUrl;
  }

  // 检查 Storage 中是否已存在 Logo
  const { data: existingFile } = supabase.storage
    .from('product-images')
    .getPublicUrl(LOGO_STORAGE_PATH);
  
  // 尝试 HEAD 请求检查文件是否真的存在
  try {
    const response = await fetch(existingFile.publicUrl, { method: 'HEAD' });
    if (response.ok) {
      cachedLogoUrl = existingFile.publicUrl;
      return cachedLogoUrl;
    }
  } catch {
    // 文件不存在，继续上传
  }

  // Logo 不存在，从 public/logo.png 获取并上传
  try {
    const logoResponse = await fetch('/logo.png');
    if (!logoResponse.ok) {
      throw new Error('无法加载本地 Logo 文件');
    }
    
    const logoBlob = await logoResponse.blob();
    
    // 上传到 Storage
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(LOGO_STORAGE_PATH, logoBlob, {
        contentType: 'image/png',
        upsert: true, // 如果存在就覆盖
      });

    if (uploadError) {
      console.error('Logo 上传失败:', uploadError);
      throw uploadError;
    }

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(LOGO_STORAGE_PATH);

    cachedLogoUrl = urlData.publicUrl;
    console.log('Logo 已上传到 Storage:', cachedLogoUrl);
    return cachedLogoUrl;
  } catch (error) {
    console.error('获取/上传 Logo 失败:', error);
    // 返回本地 URL 作为 fallback（虽然 AI 可能无法访问）
    return `${window.location.origin}/logo.png`;
  }
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

/**
 * 直接上传视频文件到 Supabase Storage
 */
export async function uploadVideoToStorage(
  file: File,
  sku: string
): Promise<{ url: string; size: number }> {
  // 生成唯一文件路径
  const ext = file.name.split('.').pop() || 'mp4';
  const filePath = `videos/${sku}/${Date.now()}.${ext}`;

  // 上传到 Supabase Storage
  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`上传视频失败: ${error.message}`);
  }

  // 获取公开 URL
  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(data.path);

  return { url: urlData.publicUrl, size: file.size };
}

/**
 * 转存视频到 Supabase Storage
 * 通过 Edge Function 服务端转存，避免 CORS 问题
 */
export async function transferVideoToStorage(
  videoUrl: string,
  sku: string
): Promise<{ url: string; size: number }> {
  const { data, error } = await supabase.functions.invoke('transfer-video', {
    body: { videoUrl, sku }
  });

  if (error) {
    console.error('Transfer video error:', error);
    throw new Error(`转存失败: ${error.message}`);
  }

  if (!data.success) {
    throw new Error(data.error || '转存失败');
  }

  return { url: data.url, size: data.size };
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
