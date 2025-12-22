/**
 * 图片网格组件
 * 展示 AI 生成的图片，点击打开预览弹窗
 */

import { useState } from 'react';
import { Check, ImageOff, ZoomIn } from 'lucide-react';
import type { GeneratedImage } from '@/lib/ad-creative/types';

interface ImageGridProps {
  images: GeneratedImage[];
  onImageClick: (imageId: string, imageUrl: string) => void;
}

// 构建图片 src
// GCP 函数可能返回 URL 或 base64
function getImageSrc(imageData: string): string {
  if (!imageData) return '';
  // 如果是 HTTP URL，直接返回
  if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
    return imageData;
  }
  // 如果已经是 data URL，直接返回
  if (imageData.startsWith('data:')) return imageData;
  // 如果是纯 base64，添加前缀
  return `data:image/png;base64,${imageData}`;
}

export function ImageGrid({ images, onImageClick }: ImageGridProps) {
  const [loadErrors, setLoadErrors] = useState<Set<string>>(new Set());

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/92fbfe0c-e455-47e3-a678-8da60b30f029',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageGrid.tsx:render',message:'ImageGrid rendering',data:{imagesCount:images?.length,firstImageData:images?.[0]?.base64?.slice(0,100),isUrl:images?.[0]?.base64?.startsWith('http')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  if (!images || images.length === 0) return null;

  const handleImageError = (imgId: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/92fbfe0c-e455-47e3-a678-8da60b30f029',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageGrid.tsx:handleImageError',message:'Image load error',data:{imgId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.error('Image load error for:', imgId);
    setLoadErrors(prev => new Set(prev).add(imgId));
  };

  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {images.map((img) => {
        const hasError = loadErrors.has(img.id);
        const imgSrc = getImageSrc(img.base64);

        return (
          <div
            key={img.id}
            onClick={() => !hasError && imgSrc && onImageClick(img.id, imgSrc)}
            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02] group ${
              img.selected
                ? 'border-purple-500 ring-2 ring-purple-500/30'
                : 'border-gray-200 hover:border-purple-300'
            }`}
          >
            {hasError || !imgSrc ? (
              // 加载失败显示占位符
              <div className="w-full aspect-square bg-gray-100 flex flex-col items-center justify-center text-gray-400">
                <ImageOff className="w-8 h-8 mb-1" />
                <span className="text-xs">加载失败</span>
              </div>
            ) : (
              <>
                <img
                  src={imgSrc}
                  alt="AI generated"
                  className="w-full aspect-square object-cover"
                  onError={() => handleImageError(img.id)}
                />
                {/* 悬停遮罩 */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/90 px-3 py-1.5 rounded-full">
                    <ZoomIn className="w-4 h-4 text-gray-700" />
                    <span className="text-sm font-medium text-gray-700">查看</span>
                  </div>
                </div>
              </>
            )}

            {/* 选中标记 */}
            {img.selected && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
