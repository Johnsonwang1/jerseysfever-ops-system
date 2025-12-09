/**
 * AI Prompt 模板管理模块
 * 使用 Supabase 存储 prompt 模板和 AI 配置
 */

import { supabase } from './supabase';
import type { AIModelId, AspectRatioId } from './ai-image';

// Prompt 模板类型
export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// AI 设置类型
export interface AISettings {
  defaultModel: AIModelId;
  defaultAspectRatio: AspectRatioId;
}

// 默认设置
const DEFAULT_SETTINGS: AISettings = {
  defaultModel: 'gemini-3-pro-image-preview',
  defaultAspectRatio: '1:1',
};

/**
 * 获取所有 Prompt 模板
 */
export async function getPromptTemplates(): Promise<PromptTemplate[]> {
  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to fetch prompt templates:', error);
    throw error;
  }

  return data || [];
}

/**
 * 创建新的 Prompt 模板
 */
export async function createPromptTemplate(
  name: string,
  prompt: string
): Promise<PromptTemplate> {
  // 获取当前最大 sort_order
  const { data: maxData } = await supabase
    .from('ai_prompt_templates')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const nextSortOrder = (maxData?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .insert({ name, prompt, enabled: true, sort_order: nextSortOrder })
    .select()
    .single();

  if (error) {
    console.error('Failed to create prompt template:', error);
    throw error;
  }

  return data;
}

/**
 * 更新 Prompt 模板
 */
export async function updatePromptTemplate(
  id: string,
  updates: { name?: string; prompt?: string; enabled?: boolean }
): Promise<PromptTemplate> {
  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update prompt template:', error);
    throw error;
  }

  return data;
}

/**
 * 切换 Prompt 模板的启用状态
 */
export async function togglePromptTemplate(
  id: string,
  enabled: boolean
): Promise<PromptTemplate> {
  return updatePromptTemplate(id, { enabled });
}

/**
 * 重新排序 Prompt 模板
 */
export async function reorderPromptTemplates(
  orderedIds: string[]
): Promise<void> {
  // 批量更新排序
  const updates = orderedIds.map((id, index) => ({
    id,
    sort_order: index + 1,
    updated_at: new Date().toISOString(),
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('ai_prompt_templates')
      .update({ sort_order: update.sort_order, updated_at: update.updated_at })
      .eq('id', update.id);

    if (error) {
      console.error(`Failed to update sort order for ${update.id}:`, error);
      throw error;
    }
  }
}

/**
 * 删除 Prompt 模板
 */
export async function deletePromptTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_prompt_templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete prompt template:', error);
    throw error;
  }
}

/**
 * 获取 AI 设置
 */
export async function getAISettings(): Promise<AISettings> {
  const { data, error } = await supabase
    .from('ai_settings')
    .select('key, value');

  if (error) {
    console.error('Failed to fetch AI settings:', error);
    return DEFAULT_SETTINGS;
  }

  const settings: AISettings = { ...DEFAULT_SETTINGS };

  data?.forEach((row) => {
    if (row.key === 'default_model') {
      settings.defaultModel = row.value as AIModelId;
    } else if (row.key === 'default_aspect_ratio') {
      settings.defaultAspectRatio = row.value as AspectRatioId;
    }
  });

  return settings;
}

/**
 * 更新 AI 设置
 */
export async function updateAISettings(settings: Partial<AISettings>): Promise<void> {
  const updates: { key: string; value: string }[] = [];

  if (settings.defaultModel !== undefined) {
    updates.push({ key: 'default_model', value: JSON.stringify(settings.defaultModel) });
  }
  if (settings.defaultAspectRatio !== undefined) {
    updates.push({ key: 'default_aspect_ratio', value: JSON.stringify(settings.defaultAspectRatio) });
  }

  for (const update of updates) {
    const { error } = await supabase
      .from('ai_settings')
      .upsert({ 
        key: update.key, 
        value: JSON.parse(update.value),
        updated_at: new Date().toISOString() 
      });

    if (error) {
      console.error(`Failed to update AI setting ${update.key}:`, error);
      throw error;
    }
  }
}

/**
 * 获取单个 Prompt 模板
 */
export async function getPromptTemplate(id: string): Promise<PromptTemplate | null> {
  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch prompt template:', error);
    return null;
  }

  return data;
}

