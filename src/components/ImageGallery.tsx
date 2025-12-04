import { useState, useRef } from 'react';
import { X, Plus, GripVertical, Image as ImageIcon, Loader2 } from 'lucide-react';
import { uploadImageToStorage } from '../lib/supabase';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 删除图片
  const handleRemove = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);
    if (selectedIndex >= newImages.length) {
      setSelectedIndex(Math.max(0, newImages.length - 1));
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
      <div className="flex-1 bg-gray-50 rounded-xl overflow-hidden mb-4 flex items-center justify-center min-h-[300px]">
        {images.length > 0 ? (
          <img
            src={images[selectedIndex]}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
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
            className={`relative group w-16 h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
              selectedIndex === index
                ? 'border-gray-900 shadow-md'
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
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <GripVertical className="w-4 h-4 text-white cursor-grab" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(index);
                  }}
                  className="p-0.5 bg-red-500 rounded-full hover:bg-red-600"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}

            {/* 序号标记 */}
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-black/60 rounded text-white text-[10px] flex items-center justify-center">
              {index + 1}
            </div>
          </div>
        ))}

        {/* 添加图片按钮 */}
        {editable && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`w-16 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-colors ${
              uploading 
                ? 'border-blue-300 bg-blue-50 text-blue-400 cursor-wait' 
                : 'border-gray-300 hover:border-gray-400 text-gray-400 hover:text-gray-500'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-[10px]">上传中</span>
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span className="text-[10px]">添加</span>
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
    </div>
  );
}

