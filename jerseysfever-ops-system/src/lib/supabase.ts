import { createClient } from '@supabase/supabase-js';
import type { SiteKey, WooCategory } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
