/**
 * AI 图片服务模块
 * 调用 GCP Cloud Function 进行图片处理
 */

// GCP 函数 URL
const GCP_FUNCTION_URL = 'https://asia-southeast1-snapnest-453114.cloudfunctions.net/snapnest-generative-gemini-image';

// 支持的模型
export const SUPPORTED_MODELS = [
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', description: '快速生成，适合大多数场景' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview', description: '高质量生成，适合精细处理' },
] as const;

export type AIModelId = typeof SUPPORTED_MODELS[number]['id'];

// 支持的宽高比
export const SUPPORTED_ASPECT_RATIOS = [
  { id: '1:1', name: '1:1 正方形', description: '1024x1024' },
  { id: '16:9', name: '16:9 宽屏', description: '1344x768' },
  { id: '9:16', name: '9:16 竖屏', description: '768x1344' },
  { id: '4:3', name: '4:3', description: '1184x864' },
  { id: '3:4', name: '3:4', description: '864x1184' },
  { id: '3:2', name: '3:2', description: '1248x832' },
  { id: '2:3', name: '2:3', description: '832x1248' },
  { id: 'auto', name: '自动', description: '根据输入图片自动适配' },
] as const;

export type AspectRatioId = typeof SUPPORTED_ASPECT_RATIOS[number]['id'];

// 请求参数
export interface AIImageRequest {
  prompt: string;
  images?: string[];
  model?: AIModelId;
  aspectRatio?: AspectRatioId;
  temperature?: number;
  maxRetries?: number;
}

// 响应结果
export interface AIImageResponse {
  success: boolean;
  images: string[];
  message?: string;
  processingTime?: number;
  model?: string;
  error?: string;
}

/**
 * 调用 GCP 函数生成/处理图片
 */
export async function processImage(request: AIImageRequest): Promise<AIImageResponse> {
  try {
    const response = await fetch(GCP_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        images: request.images || [],
        model: request.model || 'gemini-3-pro-image-preview',
        aspect_ratio: request.aspectRatio || '1:1',
        temperature: request.temperature ?? 0.7,
        force_return_image: true,
        max_retries: request.maxRetries ?? 5,
      }),
    });

    const data = await response.json();

    if (data.status === 'success' && data.images && data.images.length > 0) {
      return {
        success: true,
        images: data.images,
        message: data.message,
        processingTime: data.processing_time,
        model: data.model,
      };
    } else if (data.status === 'error') {
      return {
        success: false,
        images: [],
        error: data.message || '图片处理失败',
      };
    } else {
      return {
        success: false,
        images: [],
        error: '未能生成图片，请重试',
      };
    }
  } catch (error) {
    console.error('AI Image processing error:', error);
    return {
      success: false,
      images: [],
      error: error instanceof Error ? error.message : '网络请求失败',
    };
  }
}

/**
 * 图片增强 - 高清 + 白底
 */
export async function enhanceImage(
  imageUrl: string,
  options?: {
    model?: AIModelId;
    aspectRatio?: AspectRatioId;
    customPrompt?: string;
  }
): Promise<AIImageResponse> {
  const defaultPrompt = 'Enhance this product image: make it high resolution, remove the background and replace with pure white background (#FFFFFF). Keep the product in the center. Professional e-commerce product photo style.';
  
  return processImage({
    prompt: options?.customPrompt || defaultPrompt,
    images: [imageUrl],
    model: options?.model,
    aspectRatio: options?.aspectRatio || '1:1',
  });
}

/**
 * 生成产品细节图
 */
export async function generateDetailImage(
  imageUrl: string,
  prompt: string,
  options?: {
    model?: AIModelId;
    aspectRatio?: AspectRatioId;
  }
): Promise<AIImageResponse> {
  return processImage({
    prompt,
    images: [imageUrl],
    model: options?.model,
    aspectRatio: options?.aspectRatio || '1:1',
  });
}

/**
 * 获取 GCP 函数支持的模型列表
 */
export async function getSupportedModels(): Promise<string[]> {
  try {
    const response = await fetch(GCP_FUNCTION_URL, {
      method: 'GET',
    });
    const data = await response.json();
    return data.supported_models || SUPPORTED_MODELS.map(m => m.id);
  } catch {
    return SUPPORTED_MODELS.map(m => m.id);
  }
}

