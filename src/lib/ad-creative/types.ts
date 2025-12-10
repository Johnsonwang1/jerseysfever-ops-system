/**
 * 广告图生成系统 - 类型定义
 */

import type { SiteKey } from '../types';

// FB 广告尺寸规格
export const AD_ASPECT_RATIOS = {
  '1:1': { width: 1080, height: 1080, label: 'Feed (1:1)', description: 'FB/IG 动态帖子' },
  '9:16': { width: 1080, height: 1920, label: 'Story/Reels (9:16)', description: 'FB/IG Stories' },
  '1.91:1': { width: 1200, height: 628, label: 'Link Ads (1.91:1)', description: 'FB 链接广告' },
} as const;

export type AdAspectRatio = keyof typeof AD_ASPECT_RATIOS;

// 设计风格
export const AD_STYLES = {
  auto: { label: '智能推荐', description: 'AI 根据商品自动推荐最佳风格' },
  sport: { label: '运动风', description: '深色背景、动感元素、球队配色' },
  festive: { label: '节日风', description: '红金配色、节日装饰、喜庆氛围' },
  sale: { label: '促销风', description: '醒目折扣标签、对比色、紧迫感' },
  minimal: { label: '简约风', description: '简洁白底、留白、精致排版' },
  retro: { label: '复古风', description: '复古滤镜、经典字体、怀旧风' },
} as const;

export type AdStyle = keyof typeof AD_STYLES;

// Canvas 对象基础类型
interface CanvasObjectBase {
  id: string;
  left: number;
  top: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  opacity?: number;
}

// 文字对象
export interface CanvasTextObject extends CanvasObjectBase {
  type: 'textbox';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  fontStyle: string;
  fill: string;
  textAlign: string;
  width?: number;
}

// 图片对象
export interface CanvasImageObject extends CanvasObjectBase {
  type: 'image';
  src: string;
  width?: number;
  height?: number;
  cropX?: number;
  cropY?: number;
}

// 形状对象
export interface CanvasRectObject extends CanvasObjectBase {
  type: 'rect';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
}

export interface CanvasCircleObject extends CanvasObjectBase {
  type: 'circle';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius: number;
}

export interface CanvasTriangleObject extends CanvasObjectBase {
  type: 'triangle';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  width: number;
  height: number;
}

export type CanvasObject =
  | CanvasTextObject
  | CanvasImageObject
  | CanvasRectObject
  | CanvasCircleObject
  | CanvasTriangleObject;

// Canvas 数据结构
export interface CanvasData {
  version: string;
  backgroundColor: string;
  backgroundImage?: string;
  objects: CanvasObject[];
}

// 模版分类
export type TemplateCategory = 'product' | 'sale' | 'seasonal' | 'custom';

// 广告模版
export interface AdTemplate {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  category: TemplateCategory;
  aspect_ratio: AdAspectRatio;
  canvas_data: CanvasData;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// 用户创作项目
export interface AdCreative {
  id: string;
  name: string;
  sku: string | null;
  template_id: string | null;
  aspect_ratio: AdAspectRatio;
  canvas_data: CanvasData;
  thumbnail_url: string | null;
  status: 'draft' | 'completed' | 'archived';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// 生成的广告图
export interface GeneratedAdImage {
  id: string;
  creative_id: string | null;
  sku: string | null;
  source_type: 'canvas_export' | 'ai_generated';
  image_url: string;
  aspect_ratio: AdAspectRatio;
  prompt: string | null;
  model: string | null;
  metadata: {
    processing_time?: number;
    width?: number;
    height?: number;
    style?: AdStyle;
  } | null;
  created_by: string | null;
  created_at: string;
}

// 编辑器状态
export interface EditorState {
  aspectRatio: AdAspectRatio;
  zoom: number;
  selectedObjectId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isLoading: boolean;
}

// 商品上下文（用于广告创作）
export interface AdProductContext {
  sku: string;
  name: string;
  images: string[];
  prices: Partial<Record<SiteKey, number>>;
  regular_prices?: Partial<Record<SiteKey, number>>;
  attributes?: {
    team?: string;
    season?: string;
    type?: string;
    version?: string;
  };
}

// AI 图像生成请求
export interface AIImageGenerateRequest {
  product: AdProductContext;
  aspectRatio: AdAspectRatio;
  prompt: string;
  model?: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';
}

// AI 图像生成响应
export interface AIImageGenerateResponse {
  success: boolean;
  imageBase64?: string;
  processingTime?: number;
  model?: string;
  error?: string;
}

// 导出选项
export interface ExportOptions {
  format: 'png' | 'jpeg';
  quality: number; // 0-1 for JPEG
  multiplier: number; // 1, 2, 3 for resolution
}

// FB 广告元数据（预留）
export interface FbAdsMetadata {
  aspectRatio: AdAspectRatio;
  targetPlatform: 'facebook' | 'instagram';
  adFormat: 'feed' | 'story' | 'reels' | 'carousel';
  primaryText?: string;
  headline?: string;
  callToAction?: 'SHOP_NOW' | 'LEARN_MORE' | 'BUY_NOW';
  targetUrl?: string;
  productSku?: string;
}

// ========== AI 对话相关类型 ==========

// AI 上下文设置
export interface AIContext {
  includeProductImage: boolean;  // 商品图 (默认 true)
  includePrice: boolean;         // 价格信息 (默认 true)
  includeTitle: boolean;         // 商品标题 (默认 true)
  includeLogo: boolean;          // 品牌 Logo (默认 true)
}

// 默认 AI 上下文
export const DEFAULT_AI_CONTEXT: AIContext = {
  includeProductImage: true,
  includePrice: true,
  includeTitle: true,
  includeLogo: true,
};

// AI 生成的图片
export interface GeneratedImage {
  id: string;
  base64: string;
  selected?: boolean;
}

// 聊天消息
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: GeneratedImage[];
  uploadedImages?: string[];  // 用户上传的参考图片
  timestamp: Date;
  isLoading?: boolean;
}

// 快捷风格预设
export const QUICK_STYLES = [
  { id: 'sport', label: '运动风', prompt: 'Create a dynamic sports-themed advertisement with dark background, energetic design elements, team colors accent. Show the jersey prominently with bold "NEW ARRIVAL" text and price tag.' },
  { id: 'sale', label: '促销风', prompt: 'Create a sale advertisement with eye-catching discount banner, red and white color scheme, "SALE" or "HOT DEAL" text, original price crossed out, sale price highlighted.' },
  { id: 'minimal', label: '简约风', prompt: 'Create a minimalist clean advertisement with white or light gray background, elegant typography, product centered, subtle shadow, modern and premium feel.' },
  { id: 'festive', label: '节日风', prompt: 'Create a festive holiday advertisement with red and gold colors, celebration decorations, gift ribbon elements, "SPECIAL OFFER" or seasonal greeting text.' },
] as const;

export type QuickStyleId = typeof QUICK_STYLES[number]['id'];
