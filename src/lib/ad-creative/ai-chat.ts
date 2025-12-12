/**
 * AI 对话逻辑
 * 处理 AI 广告图生成的对话交互
 */

import { processImage, type AIModelId } from '../ai-image';
import type {
  AdProductContext,
  AdAspectRatio,
  AIContext,
  GeneratedImage,
} from './types';

// 构建 AI Prompt（支持多商品）
export function buildPrompt(
  userInput: string,
  products: AdProductContext[],
  context: AIContext,
  conversationHistory?: string[]
): string {
  let prompt = '';

  // 添加对话历史作为上下文（记忆功能）
  if (conversationHistory && conversationHistory.length > 0) {
    prompt += 'Previous conversation context:\n';
    prompt += conversationHistory.slice(-4).join('\n'); // 保留最近4条记录
    prompt += '\n\n';
  }

  prompt += `Create an advertisement image.\n\nUser request: ${userInput}\n\n`;

  if (products.length > 0) {
    if (products.length === 1) {
      // 单商品模式
      const product = products[0];
      if (context.includeTitle) {
        prompt += `Product: ${product.name}\n`;
      }

      if (context.includePrice) {
        const price = product.prices?.com;
        const originalPrice = product.regular_prices?.com;
        if (price) {
          prompt += `Price: $${price}`;
          if (originalPrice && originalPrice > price) {
            prompt += ` (was $${originalPrice}, ${Math.round((1 - price / originalPrice) * 100)}% OFF)`;
          }
          prompt += '\n';
        }
      }

      if (product.attributes?.team) {
        prompt += `Team: ${product.attributes.team}\n`;
      }

      if (product.attributes?.season) {
        prompt += `Season: ${product.attributes.season}\n`;
      }
    } else {
      // 多商品模式
      prompt += `Multiple products (${products.length} items):\n`;
      products.forEach((product, index) => {
        prompt += `\nProduct ${index + 1}: ${product.name}`;
        if (product.attributes?.team) {
          prompt += ` (${product.attributes.team})`;
        }
        if (context.includePrice && product.prices?.com) {
          prompt += ` - $${product.prices.com}`;
        }
        prompt += '\n';
      });
    }

    if (context.includeLogo) {
      prompt += '\nInclude a small "JerseysFever" brand watermark in the corner.\n';
    }
  }

  prompt += '\nStyle: Professional e-commerce advertisement. The jersey should be the main focus with clear, readable text overlay. High quality, modern design.';

  return prompt;
}

// 获取图片上下文（支持多商品）
export function getImageContext(
  products: AdProductContext[],
  context: AIContext
): string[] {
  if (!context.includeProductImage || products.length === 0) {
    return [];
  }

  // 收集所有商品的主图
  const images: string[] = [];
  for (const product of products) {
    if (product.images?.length) {
      images.push(product.images[0]);
    }
  }
  return images;
}

// 转换 aspectRatio 格式给 AI API
export function convertAspectRatio(aspectRatio: AdAspectRatio): '1:1' | '16:9' | '9:16' {
  if (aspectRatio === '1.91:1') return '16:9';
  return aspectRatio as '1:1' | '9:16';
}

// 生成多张图片（并行调用）
export async function generateMultipleImages(
  prompt: string,
  images: string[],
  aspectRatio: AdAspectRatio,
  model: AIModelId = 'gemini-2.5-flash-image',
  count: number = 4
): Promise<GeneratedImage[]> {
  const aiAspectRatio = convertAspectRatio(aspectRatio);
  const results: GeneratedImage[] = [];

  console.log('=== AI Image Generation Start ===');
  console.log('Prompt:', prompt.slice(0, 200) + '...');
  console.log('Input images:', images.length);
  console.log('Aspect ratio:', aiAspectRatio);
  console.log('Model:', model);

  // 并行调用，每次使用不同的 temperature 来获得变化
  const temperatures = [0.7, 0.8, 0.9, 1.0].slice(0, count);

  const promises = temperatures.map(async (temp, index) => {
    try {
      console.log(`Generating image ${index + 1}/${count} with temp=${temp}...`);

      const result = await processImage({
        prompt,
        images,
        model,
        aspectRatio: aiAspectRatio,
        temperature: temp,
        maxRetries: 2,
      });

      console.log(`Image ${index + 1} result:`, {
        success: result.success,
        hasImages: result.images?.length > 0,
        imageData: result.images?.[0]?.slice(0, 100), // 查看开头
        error: result.error,
      });

      if (result.success && result.images?.length) {
        const imageData = result.images[0];

        console.log(`Image ${index + 1} data length:`, imageData.length);
        console.log(`Image ${index + 1} is URL:`, imageData.startsWith('http'));

        return {
          id: `img-${Date.now()}-${index}`,
          // GCP 函数返回的是 URL，不是 base64
          base64: imageData, // 实际上存储的是 URL
          selected: false,
        };
      }
      return null;
    } catch (error) {
      console.error(`Image generation ${index} failed:`, error);
      return null;
    }
  });

  const settled = await Promise.all(promises);
  settled.forEach(img => {
    if (img) results.push(img);
  });

  console.log('=== AI Image Generation Complete ===');
  console.log('Generated images:', results.length);

  return results;
}

// 生成单张图片
export async function generateSingleImage(
  prompt: string,
  images: string[],
  aspectRatio: AdAspectRatio,
  model: AIModelId = 'gemini-2.5-flash-image'
): Promise<GeneratedImage | null> {
  const aiAspectRatio = convertAspectRatio(aspectRatio);

  try {
    const result = await processImage({
      prompt,
      images,
      model,
      aspectRatio: aiAspectRatio,
      temperature: 0.8,
      maxRetries: 3,
    });

    if (result.success && result.images?.length) {
      return {
        id: `img-${Date.now()}`,
        base64: result.images[0],
        selected: false,
      };
    }

    return null;
  } catch (error) {
    console.error('Image generation failed:', error);
    return null;
  }
}

// 格式化对话历史（用于 AI 上下文记忆）
export function formatConversationHistory(
  messages: { role: string; content: string }[]
): string[] {
  return messages
    .filter(msg => msg.role !== 'system')
    .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`);
}
