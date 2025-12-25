import { supabase } from './supabase';
import type { SiteKey } from './types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// 本地商品数据结构（SKU 作为主键，所有站点数据存储在 JSONB 中）
export interface LocalProduct {
  // 主键：SKU（统一标识符）
  sku: string;

  // 共享基础信息
  name: string;  // 主站名称（用于列表显示）
  slug: string | null;
  images: string[];  // 共享图片
  video_url?: string | null;  // 商品视频URL
  categories: string[];  // 共享分类

  // 商品属性（共享）
  attributes: {
    team?: string;
    season?: string;
    type?: string;
    version?: string;
    gender?: string;
    sleeve?: string;
    events?: string[];
  };

  // 各站点的 WooCommerce ID
  woo_ids: Partial<Record<SiteKey, number>>;
  // 结构: { com: 12345, uk: 12346, de: 12347, fr: 12348 }

  // 各站点独立价格（促销价/现价）
  prices: Partial<Record<SiteKey, number>>;
  // 结构: { com: 29.99, uk: 24.99, de: 27.99, fr: 27.99 }

  // 各站点独立原价（划线价）
  regular_prices?: Partial<Record<SiteKey, number>>;
  // 结构: { com: 59.99, uk: 49.99, de: 54.99, fr: 54.99 }

  // 各站点独立库存数量
  stock_quantities: Partial<Record<SiteKey, number>>;
  // 结构: { com: 100, uk: 50, de: 30, fr: 20 }

  // 各站点独立库存状态
  stock_statuses: Partial<Record<SiteKey, string>>;
  // 结构: { com: "instock", uk: "outofstock", ... }

  // 各站点独立发布状态
  statuses: Partial<Record<SiteKey, string>>;
  // 结构: { com: "publish", uk: "draft", ... }

  // 多语言内容
  content: Partial<Record<SiteKey, {
    name: string;
    description: string;
    short_description: string;
  }>>;

  // 各站点同步状态
  sync_status: Partial<Record<SiteKey, 'synced' | 'pending' | 'error' | 'deleted' | 'not_published'>>;

  // 各站点修改时间（WooCommerce）
  date_modified?: Partial<Record<SiteKey, string>>;
  // 结构: { com: "2025-12-03T09:50:50", uk: "2025-12-03T10:00:00", ... }

  // 发布时间（WooCommerce，取主站 .com 的发布时间）
  published_at?: string;

  // 各站点变体信息
  variations?: Partial<Record<SiteKey, ProductVariationInfo[]>>;
  // 结构: { com: [{id, sku, ...}], de: [{id, sku, ...}], ... }
  
  // 各站点变体数量
  variation_counts?: Partial<Record<SiteKey, number>>;
  // 结构: { com: 5, de: 5, ... }

  // 成本（人民币）
  cost?: number | null;

  // 销量和订单统计
  total_sales?: number | null;  // 历史销量
  last_order_date?: string | null;  // 最近下单时间

  // 时间戳
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

// 变体信息类型
export interface ProductVariationInfo {
  id: number;
  sku: string;
  attributes: { name: string; option: string }[];
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
}

// 变体问题筛选类型
export type VariationFilter = 'var_zero' | 'var_one' | 'var_sku_mismatch';

// 分页查询参数
export interface ProductQueryParams {
  page?: number;
  perPage?: number;
  search?: string;
  categories?: string[]; // 筛选类目（支持多选）
  categoryMode?: 'and' | 'or'; // 类目筛选模式
  excludeMode?: boolean; // 排除模式：筛选不在这些类目的商品
  site?: SiteKey; // 筛选特定站点同步状态
  status?: 'synced' | 'error' | 'pending';
  variationFilter?: VariationFilter; // 变体问题筛选
  // 新增：属性筛选
  types?: string[]; // 类型筛选（Home, Away, Third, etc.）
  versions?: string[]; // 版本筛选（Player Version, Standard, etc.）
  sleeves?: string[]; // 袖长筛选（Short Sleeve, Long Sleeve, Kit）
  genders?: string[]; // 性别筛选（Men's, Women's, Kids, Unisex）
}

// 分页查询结果
export interface ProductQueryResult {
  products: LocalProduct[];
  total: number;
  totalPages: number;
}

// 获取商品列表（从本地 Supabase 表）
export async function getLocalProducts(params: ProductQueryParams = {}): Promise<ProductQueryResult> {
  const { 
    page = 1, 
    perPage = 20, 
    search, 
    categories, 
    categoryMode = 'or', 
    excludeMode = false, 
    site, 
    status, 
    variationFilter,
    types,
    versions,
    sleeves,
    genders
  } = params;
  const offset = (page - 1) * perPage;

  // 如果是 SKU 不匹配筛选，先获取不匹配的 SKU 列表
  let skuMismatchList: string[] = [];
  if (variationFilter === 'var_sku_mismatch') {
    const { data: mismatchData } = await supabase.rpc('get_sku_mismatch_products');
    skuMismatchList = mismatchData?.map((r: { sku: string }) => r.sku) || [];
    console.log('📋 SKU 不匹配商品数量:', skuMismatchList.length);
  }

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' });

  // 搜索（按名称或 SKU）
  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }

  // 筛选类目（支持多选 AND/OR，支持排除模式）
  if (categories && categories.length > 0) {
    if (excludeMode) {
      // 排除模式：不包含这些类目的商品
      // 注意：Supabase 不直接支持 NOT contains，需要用 RPC 或在前端过滤
      // 这里我们使用 not.cs 来实现
      for (const cat of categories) {
        query = query.not('categories', 'cs', JSON.stringify([cat]));
      }
    } else if (categoryMode === 'and') {
      // AND: 必须包含所有选中的类目
      for (const cat of categories) {
        query = query.filter('categories', 'cs', JSON.stringify([cat]));
      }
    } else {
      // OR: 包含任意一个类目
      const orConditions = categories.map(cat => `categories.cs.${JSON.stringify([cat])}`).join(',');
      query = query.or(orConditions);
    }
  }

  // 属性筛选：类型
  if (types && types.length > 0) {
    // 筛选 attributes->type 在 types 列表中的商品
    const typeConditions = types.map(t => `attributes->>type.eq.${t}`).join(',');
    query = query.or(typeConditions);
  }

  // 属性筛选：版本
  if (versions && versions.length > 0) {
    const versionConditions = versions.map(v => `attributes->>version.eq.${v}`).join(',');
    query = query.or(versionConditions);
  }

  // 属性筛选：袖长
  if (sleeves && sleeves.length > 0) {
    const sleeveConditions = sleeves.map(s => `attributes->>sleeve.eq.${s}`).join(',');
    query = query.or(sleeveConditions);
  }

  // 属性筛选：性别
  if (genders && genders.length > 0) {
    const genderConditions = genders.map(g => `attributes->>gender.eq.${g}`).join(',');
    query = query.or(genderConditions);
  }

  // 筛选特定站点的同步状态
  if (site && status) {
    query = query.eq(`sync_status->>${site}`, status);
  } else if (site) {
    // 只筛选该站点存在的（不是 not_published）
    query = query.neq(`sync_status->>${site}`, 'not_published');
  }

  // 变体问题筛选（只筛选已发布到 com 的商品）
  if (variationFilter) {
    // 确保商品已发布到 com
    query = query.not('woo_ids->com', 'is', null);
    
    if (variationFilter === 'var_zero') {
      // 0 个变体：variation_counts->com 为 0 或不存在
      query = query.or('variation_counts->com.is.null,variation_counts->com.eq.0');
    } else if (variationFilter === 'var_one') {
      // 仅 1 个变体
      query = query.eq('variation_counts->com', 1);
    } else if (variationFilter === 'var_sku_mismatch' && skuMismatchList.length > 0) {
      // SKU 不匹配：使用预先获取的 SKU 列表筛选
      query = query.in('sku', skuMismatchList);
    }
  }

  // 排序和分页（按 WooCommerce 发布时间倒序，无发布时间的排最后）
  query = query
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + perPage - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return {
    products: data || [],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / perPage),
  };
}

// 通过 SKU 获取商品（主键查询）
export async function getProductBySku(sku: string): Promise<LocalProduct | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('sku', sku)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to fetch product: ${error.message}`);
  }

  return data;
}

// 通过站点的 woo_id 获取商品
export async function getProductByWooId(site: SiteKey, wooId: number): Promise<LocalProduct | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq(`woo_ids->>${site}`, wooId.toString())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to fetch product: ${error.message}`);
  }

  return data;
}

// 创建本地商品
export async function createLocalProduct(product: Omit<LocalProduct, 'created_at' | 'updated_at'>): Promise<LocalProduct> {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create product: ${error.message}`);
  }

  return data;
}

// 更新本地商品（通过 SKU）
export async function updateLocalProduct(sku: string, updates: Partial<LocalProduct>): Promise<LocalProduct> {
  const { data, error } = await supabase
    .from('products')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('sku', sku)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update product: ${error.message}`);
  }

  return data;
}

// 更新商品的同步状态
export async function updateProductSyncStatus(
  sku: string,
  site: SiteKey,
  status: 'synced' | 'pending' | 'error' | 'deleted',
  wooId?: number
): Promise<void> {
  const existing = await getProductBySku(sku);

  if (existing) {
    const syncStatus = { ...existing.sync_status, [site]: status };
    const wooIds = wooId
      ? { ...existing.woo_ids, [site]: wooId }
      : existing.woo_ids;

    await supabase
      .from('products')
      .update({
        sync_status: syncStatus,
        woo_ids: wooIds,
        last_synced_at: new Date().toISOString(),
      })
      .eq('sku', sku);
  }
}

// 批量更新站点 woo_id
export async function updateProductWooId(
  sku: string,
  site: SiteKey,
  wooId: number
): Promise<void> {
  const existing = await getProductBySku(sku);

  if (existing) {
    const wooIds = { ...existing.woo_ids, [site]: wooId };

    await supabase
      .from('products')
      .update({ woo_ids: wooIds })
      .eq('sku', sku);
  }
}

// 删除本地商品（通过 SKU）
export async function deleteLocalProduct(sku: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('sku', sku);

  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`);
  }
}

// 批量删除商品（仅数据库）
export async function deleteLocalProducts(skus: string[]): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;

  // 分批删除，每批 100 条
  const BATCH_SIZE = 100;
  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const batch = skus.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('products')
      .delete()
      .in('sku', batch);

    if (error) {
      console.error('Delete error:', error);
      errors += batch.length;
    } else {
      deleted += batch.length;
    }
  }

  return { deleted, errors };
}

// 删除所有商品（清空数据库）
export async function deleteAllLocalProducts(): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .neq('sku', ''); // 删除所有 sku 不为空的记录

  if (error) {
    throw new Error(`Failed to delete all products: ${error.message}`);
  }
}

// Realtime 订阅
let realtimeChannel: RealtimeChannel | null = null;

export type ProductChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: LocalProduct | null;
  old: LocalProduct | null;
}) => void;

// 订阅商品变更
export function subscribeToProducts(callback: ProductChangeCallback): () => void {
  // 如果已有订阅，先取消
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel('products-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'products',
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as LocalProduct | null,
          old: payload.old as LocalProduct | null,
        });
      }
    )
    .subscribe();

  // 返回取消订阅函数
  return () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}

// 批量更新商品数据（用于详情编辑）
export async function updateProductDetails(
  sku: string,
  updates: {
    name?: string;
    images?: string[];
    categories?: string[];
    attributes?: {
      team?: string;
      season?: string;
      type?: string;
      version?: string;
      gender?: string;
      sleeve?: string;
      events?: string[];
    };
    prices?: Partial<Record<SiteKey, number>>;
    regular_prices?: Partial<Record<SiteKey, number>>;
    stock_quantities?: Partial<Record<SiteKey, number>>;
    stock_statuses?: Partial<Record<SiteKey, string>>;
    statuses?: Partial<Record<SiteKey, string>>;
    content?: Partial<Record<SiteKey, {
      name: string;
      description: string;
      short_description: string;
    }>>;
  }
): Promise<LocalProduct> {
  const { data, error } = await supabase
    .from('products')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('sku', sku)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update product: ${error.message}`);
  }

  return data;
}

// 统计各站点商品数量和同步状态
export async function getProductStats(): Promise<{
  total: number;
  bySyncStatus: Record<SiteKey, { synced: number; error: number; pending: number }>;
}> {
  // 分页获取所有商品的 sync_status
  let allProducts: { sync_status: LocalProduct['sync_status'] }[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('sync_status')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw new Error(`Failed to fetch stats: ${error.message}`);
    if (!data || data.length === 0) break;

    allProducts.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  const bySyncStatus: Record<SiteKey, { synced: number; error: number; pending: number }> = {
    com: { synced: 0, error: 0, pending: 0 },
    uk: { synced: 0, error: 0, pending: 0 },
    de: { synced: 0, error: 0, pending: 0 },
    fr: { synced: 0, error: 0, pending: 0 },
  };

  for (const product of allProducts) {
    const syncStatus = product.sync_status as Record<string, string>;
    for (const [site, status] of Object.entries(syncStatus)) {
      if (bySyncStatus[site as SiteKey]) {
        if (status === 'synced') bySyncStatus[site as SiteKey].synced++;
        else if (status === 'error') bySyncStatus[site as SiteKey].error++;
        else if (status === 'pending') bySyncStatus[site as SiteKey].pending++;
      }
    }
  }

  return {
    total: allProducts.length,
    bySyncStatus,
  };
}

// ==================== 辅助函数 ====================

// 获取主站 (.com) 的价格（用于列表显示）
export function getMainSitePrice(product: LocalProduct): number | null {
  return product.prices?.com ?? null;
}

// 获取主站 (.com) 的状态（用于列表显示）
export function getMainSiteStatus(product: LocalProduct): string {
  return product.statuses?.com ?? 'publish';
}

// 获取主站 (.com) 的库存信息
export function getMainSiteStock(product: LocalProduct): { quantity: number; status: string } {
  return {
    quantity: product.stock_quantities?.com ?? 0,
    status: product.stock_statuses?.com ?? 'instock',
  };
}

// 获取主站 (.com) 的名称
export function getMainSiteName(product: LocalProduct): string {
  return product.content?.com?.name || product.name;
}

// 获取所有分类（用于分类选择器）
export async function getAllCategories(): Promise<{ id: number; name: string; parent: number }[]> {
  // 从 woo_categories 表获取唯一类目（优先使用 .com 站点的数据）
  const { data, error } = await supabase
    .from('woo_categories')
    .select('woo_id, name, parent')
    .eq('site', 'com')
    .order('name');

  if (error) {
    console.error('Failed to fetch categories:', error);
    return [];
  }

  // 转换格式：woo_id -> id
  return (data || []).map(cat => ({
    id: cat.woo_id,
    name: cat.name,
    parent: cat.parent,
  }));
}

// 获取末级分类（球队名称列表，用于 AI 识别）
// 末级分类 = 没有子分类的非顶级分类
export async function getLeafCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('woo_categories')
    .select('woo_id, name, parent')
    .eq('site', 'com');

  if (error) {
    console.error('Failed to fetch categories:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // 找出所有被作为父级的 woo_id
  const parentIds = new Set(data.map(c => c.parent).filter(p => p !== 0));

  // 末级分类 = 不是任何分类的父级 + 不是顶级分类(parent!=0)
  const leafCategories = data
    .filter(c => !parentIds.has(c.woo_id) && c.parent !== 0)
    .map(c => c.name)
    .sort();

  console.log(`Leaf categories (teams): ${leafCategories.length}`);
  return leafCategories;
}
