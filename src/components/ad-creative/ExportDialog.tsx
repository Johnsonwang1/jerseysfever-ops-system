/**
 * 导出对话框
 */

import { useState, useCallback } from 'react';
import { Canvas } from 'fabric';
import { X, Download, Image, Loader2 } from 'lucide-react';
import { AD_ASPECT_RATIOS, type AdAspectRatio, type AdProductContext } from '@/lib/ad-creative/types';

interface ExportDialogProps {
  canvas: Canvas | null;
  aspectRatio: AdAspectRatio;
  productContext: AdProductContext | null;
  onClose: () => void;
}

type ExportFormat = 'png' | 'jpeg';
type ExportQuality = 1 | 2 | 3;

export function ExportDialog({
  canvas,
  aspectRatio,
  productContext,
  onClose,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState<ExportQuality>(2);
  const [isExporting, setIsExporting] = useState(false);

  const size = AD_ASPECT_RATIOS[aspectRatio];
  const outputWidth = size.width * quality;
  const outputHeight = size.height * quality;

  // 导出图片
  const handleExport = useCallback(async () => {
    if (!canvas) return;

    setIsExporting(true);

    try {
      // 临时调整画布大小为导出尺寸
      const currentZoom = canvas.getZoom();
      const currentWidth = canvas.getWidth();
      const currentHeight = canvas.getHeight();

      // 设置导出尺寸
      canvas.setDimensions({
        width: outputWidth,
        height: outputHeight,
      });
      canvas.setZoom(quality);

      // 生成图片
      const dataUrl = canvas.toDataURL({
        format: format,
        quality: format === 'jpeg' ? 0.9 : undefined,
        multiplier: 1,
      });

      // 恢复原始尺寸
      canvas.setDimensions({
        width: currentWidth,
        height: currentHeight,
      });
      canvas.setZoom(currentZoom);
      canvas.renderAll();

      // 下载图片
      const fileName = productContext
        ? `ad-${productContext.sku}-${aspectRatio}.${format}`
        : `ad-creative-${Date.now()}.${format}`;

      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();

      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [canvas, format, quality, outputWidth, outputHeight, aspectRatio, productContext, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Image className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">导出广告图</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-5">
          {/* 尺寸预览 */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">输出尺寸</div>
            <div className="text-lg font-semibold text-gray-900">
              {outputWidth} × {outputHeight} px
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {AD_ASPECT_RATIOS[aspectRatio].label}
            </div>
          </div>

          {/* 格式选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              导出格式
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormat('png')}
                className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                  format === 'png'
                    ? 'bg-purple-50 border-purple-300 text-purple-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                PNG
                <span className="block text-xs font-normal text-gray-500 mt-0.5">
                  无损压缩，支持透明
                </span>
              </button>
              <button
                onClick={() => setFormat('jpeg')}
                className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                  format === 'jpeg'
                    ? 'bg-purple-50 border-purple-300 text-purple-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                JPEG
                <span className="block text-xs font-normal text-gray-500 mt-0.5">
                  文件更小，不支持透明
                </span>
              </button>
            </div>
          </div>

          {/* 分辨率选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              导出质量
            </label>
            <div className="flex gap-2">
              {([1, 2, 3] as ExportQuality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                    quality === q
                      ? 'bg-purple-50 border-purple-300 text-purple-800'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {q}x
                  <span className="block text-xs text-gray-500">
                    {size.width * q}px
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || !canvas}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                导出图片
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
