/**
 * AI 图片处理任务管理模块
 * 支持异步处理，关闭窗口后任务继续进行
 */

import { supabase, transferImageToStorage } from './supabase';
import { processImage, type AIModelId, type AspectRatioId } from './ai-image';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AIImageTask {
  id: string;
  sku: string;
  original_url: string;
  result_url: string | null;
  prompt: string;
  model: string;
  aspect_ratio: string;
  status: TaskStatus;
  error: string | null;
  processing_time: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskParams {
  sku: string;
  originalUrl: string;
  prompt: string;
  model: AIModelId;
  aspectRatio: AspectRatioId;
}

// 内存中的任务处理器（用于跟踪正在处理的任务）
const processingTasks = new Set<string>();

/**
 * 创建新的 AI 处理任务
 */
export async function createTask(params: CreateTaskParams): Promise<AIImageTask> {
  const { data, error } = await supabase
    .from('ai_image_tasks')
    .insert({
      sku: params.sku,
      original_url: params.originalUrl,
      prompt: params.prompt,
      model: params.model,
      aspect_ratio: params.aspectRatio,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create AI task:', error);
    throw error;
  }

  // 自动开始处理任务
  startTaskProcessing(data.id);

  return data;
}

/**
 * 批量创建任务
 */
export async function createBatchTasks(
  sku: string,
  imageUrls: string[],
  prompt: string,
  model: AIModelId,
  aspectRatio: AspectRatioId
): Promise<AIImageTask[]> {
  const tasks = imageUrls.map(url => ({
    sku,
    original_url: url,
    prompt,
    model,
    aspect_ratio: aspectRatio,
    status: 'pending' as const,
  }));

  const { data, error } = await supabase
    .from('ai_image_tasks')
    .insert(tasks)
    .select();

  if (error) {
    console.error('Failed to create batch AI tasks:', error);
    throw error;
  }

  // 自动开始处理所有任务
  data.forEach(task => startTaskProcessing(task.id));

  return data;
}

/**
 * 开始处理任务（在后台异步执行）
 */
async function startTaskProcessing(taskId: string) {
  // 防止重复处理
  if (processingTasks.has(taskId)) return;
  processingTasks.add(taskId);

  try {
    // 获取任务详情
    const { data: task, error: fetchError } = await supabase
      .from('ai_image_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      console.error('Failed to fetch task:', fetchError);
      processingTasks.delete(taskId);
      return;
    }

    // 更新状态为处理中
    await supabase
      .from('ai_image_tasks')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', taskId);

    // 调用 AI 处理
    const startTime = Date.now();
    const result = await processImage({
      prompt: task.prompt,
      images: [task.original_url],
      model: task.model as AIModelId,
      aspectRatio: task.aspect_ratio as AspectRatioId,
    });
    const processingTime = (Date.now() - startTime) / 1000;

    // 更新任务结果
    if (result.success && result.images[0]) {
      const gcsUrl = result.images[0];
      
      // 先保存 GCS URL，标记为 transferring 状态
      await supabase
        .from('ai_image_tasks')
        .update({
          status: 'completed',
          result_url: gcsUrl,
          processing_time: processingTime,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      // 异步转存到 Supabase Storage（不自动替换，等用户审核）
      transferImageToStorage(gcsUrl, task.sku, 'ai-processed')
        .then(async (supabaseUrl) => {
          console.log(`[AI Task ${taskId}] 转存成功: ${supabaseUrl}`);
          
          // 更新任务的 result_url 为 Supabase URL
          await supabase
            .from('ai_image_tasks')
            .update({
              result_url: supabaseUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', taskId);
          
          console.log(`[AI Task ${taskId}] 任务完成，等待用户审核`);
        })
        .catch((err) => {
          console.warn(`[AI Task ${taskId}] 转存失败:`, err);
          // 转存失败保留 GCS URL，用户可以手动重试
        });
    } else {
      await supabase
        .from('ai_image_tasks')
        .update({
          status: 'failed',
          error: result.error || '处理失败',
          processing_time: processingTime,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
    }
  } catch (err) {
    console.error('Task processing error:', err);
    await supabase
      .from('ai_image_tasks')
      .update({
        status: 'failed',
        error: err instanceof Error ? err.message : '处理出错',
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  } finally {
    processingTasks.delete(taskId);
  }
}

/**
 * 获取商品的所有 AI 任务
 */
export async function getTasksBySku(sku: string): Promise<AIImageTask[]> {
  const { data, error } = await supabase
    .from('ai_image_tasks')
    .select('*')
    .eq('sku', sku)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch tasks:', error);
    throw error;
  }

  return data || [];
}

/**
 * 获取商品的未完成任务
 */
export async function getPendingTasksBySku(sku: string): Promise<AIImageTask[]> {
  const { data, error } = await supabase
    .from('ai_image_tasks')
    .select('*')
    .eq('sku', sku)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch pending tasks:', error);
    throw error;
  }

  return data || [];
}

/**
 * 获取商品的已完成任务（最近的）
 */
export async function getCompletedTasksBySku(sku: string, limit = 20): Promise<AIImageTask[]> {
  const { data, error } = await supabase
    .from('ai_image_tasks')
    .select('*')
    .eq('sku', sku)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch completed tasks:', error);
    throw error;
  }

  return data || [];
}

/**
 * 删除任务
 */
export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('ai_image_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('Failed to delete task:', error);
    throw error;
  }
}

/**
 * 清理商品的所有任务
 */
export async function clearTasksBySku(sku: string): Promise<void> {
  const { error } = await supabase
    .from('ai_image_tasks')
    .delete()
    .eq('sku', sku);

  if (error) {
    console.error('Failed to clear tasks:', error);
    throw error;
  }
}

/**
 * 重试失败的任务
 */
export async function retryTask(taskId: string): Promise<void> {
  // 重置状态为 pending
  await supabase
    .from('ai_image_tasks')
    .update({
      status: 'pending',
      error: null,
      result_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  // 重新开始处理
  startTaskProcessing(taskId);
}

/**
 * 转存单个任务的图片到 Supabase Storage
 * 用于将旧的 GCS URL 转存为 WooCommerce 兼容的格式
 */
export async function transferTaskImage(taskId: string): Promise<string | null> {
  // 获取任务
  const { data: task, error: fetchError } = await supabase
    .from('ai_image_tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (fetchError || !task) {
    console.error('Failed to fetch task:', fetchError);
    return null;
  }

  if (!task.result_url) {
    console.warn('Task has no result URL');
    return null;
  }

  // 检查是否已经是 Supabase URL
  if (task.result_url.includes('supabase.co')) {
    console.log('Already a Supabase URL, skipping');
    return task.result_url;
  }

  try {
    // 转存到 Supabase Storage
    const newUrl = await transferImageToStorage(task.result_url, task.sku, 'ai-processed');
    
    // 更新数据库
    await supabase
      .from('ai_image_tasks')
      .update({ 
        result_url: newUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId);

    console.log(`Task ${taskId} transferred: ${newUrl}`);
    return newUrl;
  } catch (err) {
    console.error(`Failed to transfer task ${taskId}:`, err);
    throw err;
  }
}

/**
 * 批量转存所有 GCS 图片到 Supabase Storage
 */
export async function transferAllGcsImages(
  sku?: string,
  onProgress?: (current: number, total: number, url: string) => void
): Promise<{ success: number; failed: number; skipped: number }> {
  // 获取所有已完成且使用 GCS URL 的任务
  let query = supabase
    .from('ai_image_tasks')
    .select('*')
    .eq('status', 'completed')
    .like('result_url', '%storage.googleapis.com%');

  if (sku) {
    query = query.eq('sku', sku);
  }

  const { data: tasks, error } = await query;

  if (error) {
    console.error('Failed to fetch tasks:', error);
    throw error;
  }

  if (!tasks || tasks.length === 0) {
    return { success: 0, failed: 0, skipped: 0 };
  }

  let success = 0;
  let failed = 0;
  const skipped = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    try {
      onProgress?.(i + 1, tasks.length, task.result_url);
      
      const newUrl = await transferImageToStorage(task.result_url, task.sku, 'ai-processed');
      
      await supabase
        .from('ai_image_tasks')
        .update({ 
          result_url: newUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      success++;
    } catch (err) {
      console.error(`Failed to transfer task ${task.id}:`, err);
      failed++;
    }
  }

  return { success, failed, skipped };
}

/**
 * 订阅任务状态变化（实时更新）
 */
export function subscribeToTasks(
  sku: string,
  callback: (tasks: AIImageTask[]) => void
) {
  console.log(`📡 [${sku}] 建立 AI 任务实时订阅...`);
  
  // 首次加载
  getTasksBySku(sku).then(callback);

  // 使用更唯一的 channel 名称避免冲突
  const channelName = `ai_tasks_${sku}_${Date.now()}`;
  
  // 订阅实时更新
  const subscription = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ai_image_tasks',
        filter: `sku=eq.${sku}`,
      },
      async (payload) => {
        console.log(`📡 [${sku}] 收到实时更新:`, payload.eventType, payload.new);
        // 有变化时立即重新获取所有任务
        try {
          const tasks = await getTasksBySku(sku);
          console.log(`📡 [${sku}] 获取到最新数据:`, tasks.length, '个任务');
          callback(tasks);
        } catch (err) {
          console.error(`📡 [${sku}] 获取任务失败:`, err);
        }
      }
    )
    .subscribe((status, err) => {
      console.log(`📡 [${sku}] 订阅状态:`, status, err || '');
      if (status === 'SUBSCRIBED') {
        console.log(`📡 [${sku}] ✅ 实时订阅已建立`);
      }
    });

  // 返回取消订阅函数
  return () => {
    console.log(`📡 [${sku}] 取消订阅`);
    supabase.removeChannel(subscription);
  };
}

