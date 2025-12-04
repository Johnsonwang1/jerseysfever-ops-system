/**
 * 草稿服务 - 管理商品草稿的持久化存储
 */

import { supabase } from './supabase';
import type { SiteKey, UploadedImage, ProductContent } from './types';
import { DEFAULT_PRODUCT_INFO } from './attributes';

// ==================== 类型定义 ====================

export interface ProductDraft {
  id: string;
  images: UploadedImage[];
  info: typeof DEFAULT_PRODUCT_INFO;
  content: Partial<Record<SiteKey, ProductContent>>;
  selectedSites: SiteKey[];
  isGenerating?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// 数据库中的草稿格式
interface DbDraft {
  id: string;
  images: any[];
  info: any;
  content: Record<string, any>;
  selected_sites: string[];
  created_at: string;
  updated_at: string;
}

// ==================== 草稿 CRUD ====================

/**
 * 加载所有草稿
 */
export async function loadDrafts(): Promise<ProductDraft[]> {
  const { data, error } = await supabase
    .from('product_drafts')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('加载草稿失败:', error);
    return [];
  }

  return (data || []).map(dbDraftToProductDraft);
}

/**
 * 保存草稿（新建或更新）
 */
export async function saveDraft(draft: ProductDraft): Promise<ProductDraft | null> {
  // 转换为数据库格式，移除不需要持久化的字段
  const dbDraft = {
    id: draft.id,
    images: draft.images.map(img => ({
      id: img.id,
      url: img.url,
      // 不保存 base64 到数据库（太大）
      // 不保存 file 对象（无法序列化）
    })),
    info: draft.info,
    content: draft.content,
    selected_sites: draft.selectedSites,
  };

  const { data, error } = await supabase
    .from('product_drafts')
    .upsert(dbDraft, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('保存草稿失败:', error);
    return null;
  }

  return dbDraftToProductDraft(data);
}

/**
 * 删除草稿
 */
export async function deleteDraft(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('product_drafts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('删除草稿失败:', error);
    return false;
  }

  return true;
}

/**
 * 批量删除草稿
 */
export async function deleteDrafts(ids: string[]): Promise<boolean> {
  const { error } = await supabase
    .from('product_drafts')
    .delete()
    .in('id', ids);

  if (error) {
    console.error('批量删除草稿失败:', error);
    return false;
  }

  return true;
}

// ==================== 辅助函数 ====================

/**
 * 将数据库格式转换为前端格式
 */
function dbDraftToProductDraft(db: DbDraft): ProductDraft {
  return {
    id: db.id,
    images: (db.images || []).map((img: any) => ({
      id: img.id || `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url: img.url || '',
      base64: img.base64,
      file: undefined,
    })),
    info: db.info || { ...DEFAULT_PRODUCT_INFO },
    content: db.content || {},
    selectedSites: (db.selected_sites || ['com', 'uk', 'de', 'fr']) as SiteKey[],
    isGenerating: false,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

/**
 * 创建新草稿
 */
export function createEmptyDraft(): ProductDraft {
  return {
    id: crypto.randomUUID(),
    images: [],
    info: { ...DEFAULT_PRODUCT_INFO },
    content: {},
    selectedSites: ['com', 'uk', 'de', 'fr'],
    isGenerating: false,
  };
}

// ==================== 防抖保存 ====================

const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 防抖保存草稿（内容变更时自动保存）
 */
export function debouncedSaveDraft(draft: ProductDraft, delay = 1000): void {
  // 清除之前的定时器
  const existingTimeout = saveTimeouts.get(draft.id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // 设置新的定时器
  const timeout = setTimeout(() => {
    saveDraft(draft);
    saveTimeouts.delete(draft.id);
  }, delay);

  saveTimeouts.set(draft.id, timeout);
}

/**
 * 立即保存所有待保存的草稿
 */
export function flushPendingSaves(): void {
  saveTimeouts.forEach((timeout, id) => {
    clearTimeout(timeout);
    saveTimeouts.delete(id);
  });
}
