/**
 * AI 对话 Hook
 * 管理 AI 广告图生成的对话状态和交互
 */

import { useState, useCallback, useRef } from 'react';
import type { AIModelId } from '@/lib/ai-image';
import {
  type ChatMessage,
  type AIContext,
  type AdProductContext,
  type AdAspectRatio,
  DEFAULT_AI_CONTEXT,
} from '@/lib/ad-creative/types';
import {
  buildPrompt,
  getImageContext,
  generateMultipleImages,
} from '@/lib/ad-creative/ai-chat';
import { uploadImageToStorage } from '@/lib/supabase';

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface UseAIChatOptions {
  products: AdProductContext[];
  aspectRatio: AdAspectRatio;
  onImageSelect?: (imageUrl: string) => void;
}

export function useAIChat({ products, aspectRatio, onImageSelect }: UseAIChatOptions) {
  // 对话消息列表
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: '我是你的广告图设计助手！告诉我你想要什么风格的广告图，我会为你生成多个设计方案。',
      timestamp: new Date(),
    },
  ]);

  // AI 上下文设置
  const [aiContext, setAIContext] = useState<AIContext>(DEFAULT_AI_CONTEXT);

  // AI 模型选择 - 默认使用 Gemini 3 Pro
  const [model, setModel] = useState<AIModelId>('gemini-3-pro-image-preview');

  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);

  // 当前选中用于迭代修改的图片
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  // 对话历史引用（用于记忆功能）
  const conversationHistoryRef = useRef<string[]>([]);

  // 发送消息
  const sendMessage = useCallback(async (content: string, uploadedImages?: string[]) => {
    if (!content.trim() || isGenerating) return;

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      uploadedImages: uploadedImages,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // 添加到对话历史
    conversationHistoryRef.current.push(`User: ${content.trim()}`);

    // 添加 AI 加载消息
    const loadingMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '正在生成广告图...',
      timestamp: new Date(),
      isLoading: true,
    };
    setMessages(prev => [...prev, loadingMessage]);

    setIsGenerating(true);

    try {
      // 构建 prompt（支持多商品）
      const prompt = buildPrompt(
        content,
        products,
        aiContext,
        conversationHistoryRef.current
      );

      // 用户上传的参考图片：先转存到 Storage 获取 URL
      let uploadedUrls: string[] = [];
      if (uploadedImages && uploadedImages.length > 0) {
        console.log('Uploading user images to Storage...');
        for (let i = 0; i < uploadedImages.length; i++) {
          const base64 = uploadedImages[i];
          // 移除 data:image/xxx;base64, 前缀
          const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
          const filename = `ad-ref-${Date.now()}-${i}.png`;
          try {
            const url = await uploadImageToStorage(base64Data, filename);
            console.log('Uploaded image URL:', url);
            uploadedUrls.push(url);
          } catch (err) {
            console.error('Failed to upload image:', err);
          }
        }
      }

      // 构建图片数组，顺序：
      // 1. 选中的图片（基于此图修改）
      // 2. 用户上传的参考图片（紧跟选中图片）
      // 3. 商品图片
      // 4. Logo
      let images: string[] = [];

      // 如果有选中的图片用于迭代修改
      if (selectedImageUrl) {
        images.push(selectedImageUrl);
      }

      // 用户上传的参考图片紧跟在后面
      if (uploadedUrls.length > 0) {
        images = [...images, ...uploadedUrls];
      }

      // 商品图片
      const productImages = getImageContext(products, aiContext);
      images = [...images, ...productImages];

      // 如果勾选了 Logo，添加 Logo 图片
      if (aiContext.includeLogo) {
        const logoUrl = `${window.location.origin}/logo.png`;
        images.push(logoUrl);
      }

      console.log('Final images array:', images);

      // 生成多张图片
      const generatedImages = await generateMultipleImages(
        prompt,
        images,
        aspectRatio,
        model,
        4 // 生成4张
      );

      // 移除加载消息，添加结果
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id);

        if (generatedImages.length > 0) {
          const successMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `已为你生成 ${generatedImages.length} 张广告图设计，点击查看大图：`,
            images: generatedImages,
            timestamp: new Date(),
          };
          conversationHistoryRef.current.push(
            `AI: Generated ${generatedImages.length} images for "${content}"`
          );
          return [...filtered, successMessage];
        } else {
          const errorMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: '抱歉，生成失败了。请稍后重试或换个描述试试。',
            timestamp: new Date(),
          };
          return [...filtered, errorMessage];
        }
      });
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id);
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: '生成过程中出现错误，请稍后重试。',
          timestamp: new Date(),
        };
        return [...filtered, errorMessage];
      });
    } finally {
      setIsGenerating(false);
    }
  }, [products, aspectRatio, aiContext, model, isGenerating, selectedImageUrl]);

  // 选择图片（标记选中状态）
  const selectImage = useCallback((messageId: string, imageId: string) => {
    setMessages(prev =>
      prev.map(msg => {
        if (msg.id === messageId && msg.images) {
          const updatedImages = msg.images.map(img => ({
            ...img,
            selected: img.id === imageId,
          }));

          // 触发回调
          const selectedImage = updatedImages.find(img => img.id === imageId);
          if (selectedImage && onImageSelect) {
            onImageSelect(selectedImage.base64);
          }

          return { ...msg, images: updatedImages };
        }
        return msg;
      })
    );
  }, [onImageSelect]);

  // 设置选中的图片用于迭代修改
  const setSelectedImageForIteration = useCallback((imageUrl: string | null) => {
    setSelectedImageUrl(imageUrl);
  }, []);

  // 清空对话
  const clearChat = useCallback(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'system',
        content: '对话已清空。告诉我你想要什么风格的广告图吧！',
        timestamp: new Date(),
      },
    ]);
    conversationHistoryRef.current = [];
    setSelectedImageUrl(null);
  }, []);

  // 更新 AI 上下文
  const updateContext = useCallback((key: keyof AIContext, value: boolean) => {
    setAIContext(prev => ({ ...prev, [key]: value }));
  }, []);

  return {
    messages,
    aiContext,
    model,
    isGenerating,
    selectedImageUrl,
    sendMessage,
    selectImage,
    clearChat,
    updateContext,
    setModel,
    setSelectedImageForIteration,
  };
}
