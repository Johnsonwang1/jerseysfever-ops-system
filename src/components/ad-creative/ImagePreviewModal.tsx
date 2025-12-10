/**
 * 图片预览弹窗
 * 放大查看 AI 生成的图片，选择继续修改、保存草稿或确认完成
 */

import { useState } from 'react';
import { X, Edit3, Check, Download, Save, Loader2, Globe } from 'lucide-react';

interface ImagePreviewModalProps {
  imageUrl: string;
  onClose: () => void;
  onSelect: () => void;  // 选择此图继续修改
  onSaveDraft: () => Promise<void>;  // 保存为草稿
  onConfirm: () => Promise<void>; // 确认完成
  onSiteExport?: () => void; // 生成多站点版本
  isSaving?: boolean;
}

export function ImagePreviewModal({
  imageUrl,
  onClose,
  onSelect,
  onSaveDraft,
  onConfirm,
  onSiteExport,
  isSaving = false,
}: ImagePreviewModalProps) {
  const [saveAction, setSaveAction] = useState<'draft' | 'complete' | null>(null);

  // 下载图片
  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ad-creative-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // 保存草稿
  const handleSaveDraft = async () => {
    setSaveAction('draft');
    try {
      await onSaveDraft();
    } finally {
      setSaveAction(null);
    }
  };

  // 确认完成
  const handleConfirm = async () => {
    setSaveAction('complete');
    try {
      await onConfirm();
    } finally {
      setSaveAction(null);
    }
  };

  const isProcessing = isSaving || saveAction !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">图片预览</h3>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 图片区域 */}
        <div className="flex-1 overflow-auto p-6 bg-gray-50 flex items-center justify-center">
          <img
            src={imageUrl}
            alt="Preview"
            className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-lg"
          />
        </div>

        {/* 操作按钮 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white">
          {/* 第一行：主要操作 */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={onSelect}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <Edit3 className="w-4 h-4" />
              继续修改
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveDraft}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {saveAction === 'draft' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                保存草稿
              </button>
              <button
                onClick={handleConfirm}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white hover:bg-purple-700 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {saveAction === 'complete' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                确认完成
              </button>
            </div>
          </div>

          {/* 第二行：辅助操作 */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <button
              onClick={handleDownload}
              disabled={isProcessing}
              className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              下载
            </button>

            {onSiteExport && (
              <button
                onClick={onSiteExport}
                disabled={isProcessing}
                className="flex items-center gap-2 px-3 py-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                <Globe className="w-4 h-4" />
                生成多站点版本
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
