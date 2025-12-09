/**
 * AI 服务 - 通过 Edge Function 调用 Gemini
 * 
 * 功能：
 * - 识别球衣属性（图片识别）
 * - 生成商品内容（多语言：英/德/法）
 */

import type { SiteKey, ProductContent } from './types';
import { supabase } from './supabase';

// 可选的 Gemini 模型
export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro';

// 语言类型
type LanguageKey = 'en' | 'de' | 'fr';

// 站点到语言的映射
const SITE_LANGUAGE_MAP: Record<SiteKey, LanguageKey> = {
  com: 'en',
  uk: 'en',
  de: 'de',
  fr: 'fr',
};

// 当前选择的模型（默认 flash）
let currentModel: GeminiModel = 'gemini-2.5-flash';

// 缓存的分类列表（用于 AI 选择球队）
let cachedCategories: string[] = [];

// 内容缓存（英文站点共用）
const contentCache = new Map<string, ProductContent>();

export function setGeminiModel(model: GeminiModel) {
  currentModel = model;
}

export function getGeminiModel(): GeminiModel {
  return currentModel;
}

// 设置可用的分类列表
export function setAvailableCategories(categories: string[]) {
  cachedCategories = categories;
  console.log('AI: Categories set, count:', categories.length);
}

// 识别球衣属性（上传图片时调用）
export async function recognizeJerseyAttributes(imageBase64: string): Promise<{
  team?: string;
  season?: string;
  type?: string;
  version?: string;
  gender?: string;
  sleeve?: string;
  events?: string[];
}> {
  console.log('AI: Recognizing attributes via Edge Function');

  const { data, error } = await supabase.functions.invoke('ai-service', {
    body: {
      action: 'recognize-attributes',
      imageBase64,
      model: currentModel,
      teamOptions: cachedCategories.length > 0 ? cachedCategories : undefined,
    },
  });

  if (error) {
    console.error('AI Edge Function error:', error);
    throw new Error(error.message || 'AI 识别失败');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'AI 识别失败');
  }

  console.log('AI: Recognized team:', data.attributes?.team);
  return data.attributes;
}

// 根据已确认的属性生成商品内容
// 英文站点 (com, uk) 共用内容，德法各自生成
export async function generateProductContent(
  imageBase64: string,
  site: SiteKey,
  attributes: {
    team: string;
    season: string;
    type: string;
    version: string;
    gender: string;
    sleeve: string;
    events: string[];
  },
  generatedTitle: string
): Promise<ProductContent> {
  const language = SITE_LANGUAGE_MAP[site];
  
  // 生成缓存 key（基于属性和语言，包含所有关键属性）
  const cacheKey = `${language}-${attributes.team}-${attributes.season}-${attributes.type}-${attributes.version}-${attributes.gender}-${attributes.sleeve}`;
  
  // 英文内容缓存（com 和 uk 共用）
  if (language === 'en' && contentCache.has(cacheKey)) {
    console.log(`AI: Using cached content for ${site}`);
    return contentCache.get(cacheKey)!;
  }

  console.log(`AI: Generating ${language} content for ${site} via Edge Function`);
  console.log(`AI: Image base64 size: ${imageBase64?.length || 0} chars`);

  const requestBody = {
    action: 'generate-content',
    imageBase64,
    language,
    attributes,
    generatedTitle,
    model: currentModel,
  };
  
  console.log(`AI: Request body size: ${JSON.stringify(requestBody).length} chars`);

  const { data, error } = await supabase.functions.invoke('ai-service', {
    body: requestBody,
  });

  if (error) {
    console.error('AI Edge Function error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    // 尝试获取更详细的错误信息
    if (error.context) {
      console.error('Error context:', JSON.stringify(error.context));
    }
    // 如果有响应体
    if ((error as any).response) {
      console.error('Error response:', (error as any).response);
    }
    throw new Error(error.message || 'AI 生成失败');
  }
  
  console.log('AI Response data:', data);

  if (!data?.success) {
    throw new Error(data?.error || 'AI 生成失败');
  }

  const content = data.content as ProductContent;
  
  // 缓存英文内容
  if (language === 'en') {
    contentCache.set(cacheKey, content);
  }

  return content;
}

// 清除内容缓存（切换商品时调用）
export function clearContentCache() {
  contentCache.clear();
}

