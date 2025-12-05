import { useState, useRef } from 'react';
import { Plus, GripVertical, Image as ImageIcon, Loader2, ZoomIn, Trash2 } from 'lucide-react';
import { uploadImageToStorage } from '../lib/supabase';
import { ImageLightbox } from './ImageLightbox';

interface ImageGalleryProps {
  images: string[];
  onChange: (images: string[]) => void;
  editable?: boolean;
}

export function ImageGallery({ images, onChange, editable = true }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        className={`flex-1 bg-gray-50 rounded-xl overflow-hidden mb-4 flex items-center justify-center min-h-[300px] relative group ${
          images.length > 0 ? 'cursor-zoom-in' : ''
        }`}
        onClick={handleOpenLightbox}
      >
        {images.length > 0 ? (
          <>
            <img
              src={images[selectedIndex]}
              alt=""
              className="max-w-full max-h-full object-contain"
            />
            {/* 放大提示 */}
            <div className="absolute bottom-3 right-3 p-2 bg-black/50 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
              <ZoomIn className="w-4 h-4" />
              <span className="text-xs">点击放大</span>
            </div>
          </>
        ) : (
          <div className="text-gray-400 flex flex-col items-center gap-2">
            <ImageIcon className="w-16 h-16" />
            <span className="text-sm">暂无图片</span>
          </div>
        )}
      </div>

      {/* 缩略图列表 */}
      <div className="flex gap-2 flex-wrap">
        {images.map((img, index) => (
          <div
            key={index}
            draggable={editable}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => setSelectedIndex(index)}
            className={`relative group w-20 h-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
              selectedIndex === index
                ? 'border-blue-500 shadow-md'
                : 'border-transparent hover:border-gray-300'
            } ${draggedIndex === index ? 'opacity-50' : ''}`}
          >
            <img
              src={img}
              alt=""
              className="w-full h-full object-cover"
            />

            {/* 拖拽手柄和删除按钮 */}
            {editable && (
              <div className="absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <GripVertical className="w-5 h-5 text-white/80 cursor-grab" />
                <button
                  onClick={(e) => handleDeleteClick(e, index)}
                  className="p-1.5 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
                  title="删除图片"
                >
                  <Trash2 className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            )}

            {/* 序号标记 */}
            <div className="absolute top-1 left-1 w-5 h-5 bg-black/60 rounded text-white text-xs flex items-center justify-center font-medium">
              {index + 1}
            </div>
          </div>
        ))}

        {/* 添加图片按钮 */}
        {editable && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-colors ${
              uploading
                ? 'border-blue-300 bg-blue-50 text-blue-400 cursor-wait'
                : 'border-gray-300 hover:border-gray-400 text-gray-400 hover:text-gray-500'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs mt-1">上传中</span>
              </>
            ) : (
              <>
                <Plus className="w-6 h-6" />
                <span className="text-xs mt-1">添加</span>
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
        <div className="mt-2 text-xs text-red-500 text-center bg-red-50 rounded-lg p-2">
          {uploadError}
        </div>
      )}

      {/* 图片数量提示 */}
      <div className="mt-3 text-xs text-gray-500 text-center">
        共 {images.length} 张图片 {editable && '· 拖拽可排序'}
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
