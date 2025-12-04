import { supabase } from './supabase';
import type { SiteKey } from './types';

export interface SiteResult {
  success: boolean;
  id?: number;
  permalink?: string;
  error?: string;
}

export interface PublishRecord {
  id: string;
  product_name: string;
  product_image: string | null;
  sites: Record<SiteKey, SiteResult>;
  created_at: string;
}

// 记录发布结果
export async function recordPublish(
  productName: string,
  productImage: string | null,
  sites: Record<SiteKey, SiteResult>
): Promise<PublishRecord> {
  const { data, error } = await supabase
    .from('publish_history')
    .insert({
      product_name: productName,
      product_image: productImage,
      sites: sites,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`记录发布历史失败: ${error.message}`);
  }

  return data as PublishRecord;
}

// 获取发布历史
export async function getPublishHistory(limit = 50, offset = 0): Promise<PublishRecord[]> {
  const { data, error } = await supabase
    .from('publish_history')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`获取发布历史失败: ${error.message}`);
  }

  return data as PublishRecord[];
}

// 获取发布历史总数
export async function getPublishHistoryCount(): Promise<number> {
  const { count, error } = await supabase
    .from('publish_history')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`获取发布历史总数失败: ${error.message}`);
  }

  return count || 0;
}

// 按日期分组获取发布历史
export async function getPublishHistoryByDate(): Promise<Map<string, PublishRecord[]>> {
  const records = await getPublishHistory(100);
  const grouped = new Map<string, PublishRecord[]>();

  for (const record of records) {
    const date = new Date(record.created_at).toLocaleDateString('zh-CN');
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(record);
  }

  return grouped;
}

// 删除发布记录
export async function deletePublishRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('publish_history')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`删除发布记录失败: ${error.message}`);
  }
}
