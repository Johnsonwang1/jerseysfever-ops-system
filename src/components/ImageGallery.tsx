import { useState, useRef } from 'react';
import { Plus, GripVertical, Image as ImageIcon, Loader2, ZoomIn, Trash2, Copy, CheckCircle2, Sparkles } from 'lucide-react';
import { uploadImageToStorage } from '../lib/supabase';
import { ImageLightbox } from './ImageLightbox';
import { AIImageModal } from './AIImageModal';

interface ImageGalleryProps {
  images: string[];
  onChange: (images: string[]) => void;
  editable?: boolean;
  showLinks?: boolean; // 是否显示图片链接
  onCopyLink?: (url: string, index: number) => void; // 复制链接回调
  copiedIndex?: number | null; // 已复制的索引
  showAIButton?: boolean; // 是否显示 AI 处理按钮
  sku?: string; // 商品 SKU（用于 AI 任务管理）
}

export function ImageGallery({ images, onChange, editable = true, showLinks = false, onCopyLink, copiedIndex = null, showAIButton = true, sku = '' }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 复制链接
  const handleCopyLink = async (url: string, index: number) => {
    if (onCopyLink) {
      onCopyLink(url, index);
    } else {
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        console.error('复制失败:', err);
      }
    }
  };

  // 打开删除确认弹窗
  const handleDeleteClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setDeleteConfirmIndex(index);
  };

  // 确认删除
  const handleConfirmDelete = () => {
    if (deleteConfirmIndex === null) return;

    const newImages = images.filter((_, i) => i !== deleteConfirmIndex);
    onChange(newImages);
    if (selectedIndex >= newImages.length) {
      setSelectedIndex(Math.max(0, newImages.length - 1));
    }
    setDeleteConfirmIndex(null);
  };

  // 打开 lightbox
  const handleOpenLightbox = () => {
    if (images.length > 0) {
      setLightboxOpen(true);
    }
  };

  // 上传新图片到 Supabase Storage
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    const newImages: string[] = [];

    try {
      for (const file of Array.from(files)) {
        // 读取文件为 base64
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            // 移除 data:image/xxx;base64, 前缀
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // 上传到 Supabase Storage
        const publicUrl = await uploadImageToStorage(base64Data, file.name);
        newImages.push(publicUrl);
      }

      onChange([...images, ...newImages]);
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      // 清空 input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 拖拽排序
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newImages = [...images];
    const [removed] = newImages.splice(draggedIndex, 1);
    newImages.splice(index, 0, removed);

    onChange(newImages);
    setDraggedIndex(index);

    if (selectedIndex === draggedIndex) {
      setSelectedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 主图预览 */}
      <div
        className={`flex-1 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl overflow-hidden mb-4 sm:mb-5 flex items-center justify-center min-h-[300px] sm:min-h-[350px] relative group shadow-inner ${
          images.length > 0 ? 'cursor-zoom-in' : ''
        }`}
        onClick={handleOpenLightbox}
      >
        {images.length > 0 ? (
          <>
            <img
              src={images[selectedIndex]}
              alt=""
              className="max-w-full max-h-full object-contain drop-shadow-lg"
            />
            {/* 放大提示 */}
            <div className="absolute bottom-4 right-4 px-3 py-2 bg-black/70 backdrop-blur-sm rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 shadow-lg">
              <ZoomIn className="w-4 h-4" />
              <span className="text-xs font-medium">点击放大</span>
            </div>
            {/* AI 处理按钮 */}
            {showAIButton && editable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAiModalOpen(true);
                }}
                className="absolute top-4 right-4 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 shadow-lg hover:from-purple-700 hover:to-indigo-700"
              >
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-medium">AI 处理</span>
              </button>
            )}
          </>
        ) : (
          <div className="text-gray-400 flex flex-col items-center gap-3">
            <div className="p-4 bg-white/50 rounded-full">
              <ImageIcon className="w-12 h-12" />
            </div>
            <span className="text-sm font-medium">暂无图片</span>
          </div>
        )}
      </div>

      {/* 缩略图列表 */}
      <div className="flex gap-3 flex-wrap">
        {images.map((img, index) => (
          <div
            key={index}
            className="relative group"
          >
            <div className="flex flex-col gap-2">
              {/* 图片容器 */}
              <div
                draggable={editable}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => setSelectedIndex(index)}
                className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden cursor-pointer border-2 transition-all shadow-sm ${
                  selectedIndex === index
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/20 scale-105'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                } ${draggedIndex === index ? 'opacity-50 scale-95' : ''}`}
              >
                <img
                  src={img}
                  alt=""
                  className="w-full h-full object-cover transition-transform group-hover:scale-110"
                />

                {/* 选中指示器 */}
                {selectedIndex === index && (
                  <div className="absolute inset-0 bg-blue-500/10 pointer-events-none" />
                )}

                {/* 拖拽手柄和删除按钮 */}
                {editable && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent transition-opacity flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-white/90 cursor-grab" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(e, index);
                        }}
                        className="p-1.5 bg-red-500 hover:bg-red-600 rounded-lg transition-all shadow-lg hover:scale-110"
                        title="删除图片"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 序号标记 */}
                <div className="absolute top-2 left-2 w-6 h-6 bg-black/70 backdrop-blur-sm rounded-lg text-white text-xs flex items-center justify-center font-bold shadow-md">
                  {index + 1}
                </div>
              </div>

              {/* 复制链接按钮（显示在图片下方） */}
              {showLinks && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyLink(img, index);
                  }}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all ${
                    copiedIndex === index
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                  title="复制图片链接"
                >
                  {copiedIndex === index ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制链接</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* 添加图片按钮 */}
        {editable && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all shadow-sm ${
              uploading
                ? 'border-blue-400 bg-blue-50 text-blue-500 cursor-wait'
                : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 text-gray-400 hover:text-blue-500 hover:shadow-md hover:scale-105'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs mt-1.5 font-medium">上传中</span>
              </>
            ) : (
              <>
                <Plus className="w-6 h-6" />
                <span className="text-xs mt-1.5 font-medium">添加</span>
              </>
            )}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* 上传错误提示 */}
      {uploadError && (
        <div className="mt-3 p-3 text-xs text-red-600 text-center bg-red-50 border border-red-200 rounded-lg shadow-sm">
          {uploadError}
        </div>
      )}

      {/* 图片数量提示和 AI 按钮 */}
      <div className="mt-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-600 font-medium">
            共 <span className="text-gray-900 font-semibold">{images.length}</span> 张图片
            {editable && <span className="text-gray-400 mx-1">·</span>}
            {editable && <span className="text-gray-500">拖拽可排序</span>}
          </div>
          {/* 移动端 AI 按钮 */}
          {showAIButton && editable && images.length > 0 && (
            <button
              onClick={() => setAiModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-xs font-medium hover:from-purple-700 hover:to-indigo-700 transition-all lg:hidden"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI 处理
            </button>
          )}
        </div>
      </div>

      {/* Lightbox 弹窗预览 */}
      {lightboxOpen && (
        <ImageLightbox
          images={images}
          currentIndex={selectedIndex}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setSelectedIndex}
        />
      )}

      {/* AI 图片处理弹窗 */}
      {aiModalOpen && images.length > 0 && (
        <AIImageModal
          sku={sku}
          images={images}
          initialIndex={selectedIndex}
          onClose={() => setAiModalOpen(false)}
          onUpdateImages={onChange}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmIndex !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDeleteConfirmIndex(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-600 mb-4">
              确定要删除第 {deleteConfirmIndex + 1} 张图片吗？此操作无法撤销。
            </p>
            {/* 预览要删除的图片 */}
            <div className="mb-4 flex justify-center">
              <img
                src={images[deleteConfirmIndex]}
                alt=""
                className="w-24 h-24 object-cover rounded-lg border border-gray-200"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmIndex(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
