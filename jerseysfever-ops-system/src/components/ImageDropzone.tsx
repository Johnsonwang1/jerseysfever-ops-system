import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Image as ImageIcon } from 'lucide-react';
import type { UploadedImage } from '../lib/types';

interface ImageDropzoneProps {
  onImagesAdded: (images: UploadedImage[]) => void;
  isUploading?: boolean;
}

// 将文件转换为 base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除 data:image/xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImageDropzone({ onImagesAdded, isUploading }: ImageDropzoneProps) {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const images: UploadedImage[] = await Promise.all(
        acceptedFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: URL.createObjectURL(file),
            file,
            base64,
          };
        })
      );
      onImagesAdded(images);
    },
    [onImagesAdded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    disabled: isUploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
        ${isDragActive ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        {isDragActive ? (
          <>
            <ImageIcon className="w-12 h-12 text-black" />
            <p className="text-lg font-medium">放开以添加图片</p>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 text-gray-400" />
            <p className="text-lg font-medium text-gray-600">
              拖拽图片到这里，或点击选择
            </p>
            <p className="text-sm text-gray-400">
              支持 JPG, PNG, WebP 格式
            </p>
          </>
        )}
      </div>
    </div>
  );
}
