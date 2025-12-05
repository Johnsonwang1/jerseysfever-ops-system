import { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function ImageLightbox({ images, currentIndex, onClose, onNavigate }: ImageLightboxProps) {
  const hasMultiple = images.length > 1;

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, images.length, onNavigate]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goToPrev();
          break;
        case 'ArrowRight':
          goToNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // 防止背景滚动
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, goToPrev, goToNext]);

  if (images.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* 背景遮罩 - 半透明，点击关闭 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗容器 */}
      <div
        className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-4xl max-h-[85vh] w-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <span className="text-sm text-gray-600">
            {hasMultiple ? `${currentIndex + 1} / ${images.length}` : '图片预览'}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="关闭 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 图片区域 */}
        <div className="flex-1 relative flex items-center justify-center bg-gray-50 min-h-0 overflow-hidden">
          {/* 左箭头 */}
          {hasMultiple && currentIndex > 0 && (
            <button
              onClick={goToPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/90 hover:bg-white shadow-lg rounded-full text-gray-600 hover:text-gray-900 transition-colors"
              title="上一张 (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* 右箭头 */}
          {hasMultiple && currentIndex < images.length - 1 && (
            <button
              onClick={goToNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/90 hover:bg-white shadow-lg rounded-full text-gray-600 hover:text-gray-900 transition-colors"
              title="下一张 (→)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* 主图片 */}
          <img
            src={images[currentIndex]}
            alt=""
            className="max-w-full max-h-[60vh] object-contain select-none"
            draggable={false}
          />
        </div>

        {/* 缩略图导航 */}
        {hasMultiple && (
          <div className="flex-shrink-0 border-t border-gray-200 p-3 bg-white">
            <div className="flex gap-2 justify-center overflow-x-auto">
              {images.map((img, index) => (
                <button
                  key={index}
                  onClick={() => onNavigate(index)}
                  className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    index === currentIndex
                      ? 'border-blue-500 shadow-md'
                      : 'border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-300'
                  }`}
                >
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
