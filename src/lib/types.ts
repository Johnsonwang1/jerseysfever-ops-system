// 上传的图片
export interface UploadedImage {
  id: string;
  url: string;
  file?: File;  // Optional when loaded from database
  base64?: string;
}

// 商品信息
export interface ProductInfo {
  categories: string[];  // 分类（可多选，包括球队、Retro、Best Sellers等）
  season: string;        // 赛季（如 2024/25）
  year: string;          // 年份（用于 Retro，如 1998/99）
  type: string;
  version: string;
  gender: string;
  sleeve: string;
  events: string[];
  price: string;
}

// 商品内容（多语言）
export interface ProductContent {
  name: string;
  description: string;
  short_description: string;
}

// 商品组
export interface ProductGroup {
  id: string;
  images: UploadedImage[];
  info: ProductInfo;
  content: Record<SiteKey, ProductContent>;
  selectedSites: SiteKey[];
  isGenerating?: boolean; // AI 正在生成中
}

// 站点
export type SiteKey = 'de' | 'com' | 'fr' | 'uk';

export interface SiteConfig {
  key: SiteKey;
  name: string;
  url: string;
  flag: string;
  language: 'de' | 'en' | 'fr';
}

// 发布结果
export interface PublishResult {
  site: SiteKey;
  status: 'pending' | 'uploading' | 'creating' | 'success' | 'error';
  productId?: number;
  productUrl?: string;
  error?: string;
}

// WooCommerce 产品属性
export interface ProductAttribute {
  id: number;
  name?: string;
  visible: boolean;
  variation: boolean;
  options: string[];
}

// WooCommerce 变体
export interface ProductVariation {
  regular_price: string;
  attributes: { id: number; option: string }[];
}

// WooCommerce 产品创建请求
export interface WooProductRequest {
  name: string;
  type: 'variable';
  description: string;
  short_description: string;
  categories: { id: number }[];
  images: { src: string }[];
  attributes: ProductAttribute[];
}

// WooCommerce 分类（从 API 返回）
export interface WooCategory {
  id: number;
  name: string;
  parent: number;
}

// 数据库中的分类（从 Supabase woo_categories 表）
export interface DbCategory {
  name: string;
  woo_id: number;
  parent: number;
  site: SiteKey;
}

// WooCommerce 商品属性（用于更新）
export interface WooProductAttribute {
  id: number;
  name?: string;
  visible?: boolean;
  variation?: boolean;
  options: string[];
}

// WooCommerce 商品（从 API 返回）
export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: string;
  status: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  images: { id: number; src: string; alt: string }[];
  categories: { id: number; name: string; slug: string }[];
  attributes: WooProductAttribute[];
  date_created: string;
  date_modified: string;
  description: string;
  short_description: string;
}
