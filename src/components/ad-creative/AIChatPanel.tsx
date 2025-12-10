/**
 * AI 对话面板
 * 提供对话式的广告图生成界面
 */

import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Trash2,
  Image,
  DollarSign,
  Type,
  Upload,
  X,
  ChevronDown,
  Check,
  Zap,
} from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ImagePreviewModal } from './ImagePreviewModal';
import { useAIChat } from '@/hooks/useAIChat';
import { SUPPORTED_MODELS } from '@/lib/ai-image';
import type { AdProductContext, AdAspectRatio, AIContext } from '@/lib/ad-creative/types';

interface AIChatPanelProps {
  product: AdProductContext | null;
  aspectRatio: AdAspectRatio;
  onAspectRatioChange: (ratio: AdAspectRatio) => void;
  onImageSelect: (imageUrl: string) => void;
  onSaveDraft: (imageUrl: string) => Promise<void>;
  onConfirmComplete: (imageUrl: string) => Promise<void>;
  onSiteExport: (imageUrl: string) => void;
}

// 尺寸选项
const ASPECT_RATIO_OPTIONS: { id: AdAspectRatio; label: string; desc: string }[] = [
  { id: '1:1', label: '1:1', desc: 'Feed' },
  { id: '9:16', label: '9:16', desc: 'Story' },
  { id: '1.91:1', label: '1.91:1', desc: 'Link' },
];

export function AIChatPanel({ product, aspectRatio, onAspectRatioChange, onImageSelect, onSaveDraft, onConfirmComplete, onSiteExport }: AIChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; messageId: string; imageId: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
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
  } = useAIChat({
    product,
    aspectRatio,
    onImageSelect,
  });

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 发送消息
  const handleSend = () => {
    if (inputValue.trim() && !isGenerating) {
      sendMessage(inputValue.trim(), uploadedImages);
      setInputValue('');
      setUploadedImages([]);
    }
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 图片点击 - 打开预览弹窗
  const handleImageClick = (messageId: string, imageId: string, imageUrl: string) => {
    setPreviewImage({ url: imageUrl, messageId, imageId });
  };

  // 预览弹窗中选择图片
  const handlePreviewSelect = () => {
    if (previewImage) {
      selectImage(previewImage.messageId, previewImage.imageId);
      setSelectedImageForIteration(previewImage.url);
      setPreviewImage(null);
    }
  };

  // 预览弹窗中保存草稿
  const handlePreviewSaveDraft = async () => {
    if (previewImage) {
      await onSaveDraft(previewImage.url);
      setPreviewImage(null);
    }
  };

  // 预览弹窗中确认完成
  const handlePreviewConfirm = async () => {
    if (previewImage) {
      await onConfirmComplete(previewImage.url);
      setPreviewImage(null);
    }
  };

  // 预览弹窗中生成多站点版本
  const handlePreviewSiteExport = () => {
    if (previewImage) {
      onSiteExport(previewImage.url);
      setPreviewImage(null);
    }
  };

  // 上传图片处理
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setUploadedImages(prev => [...prev, base64]);
        };
        reader.readAsDataURL(file);
      }
    });

    // 清空 input 以便重复上传同一文件
    e.target.value = '';
  };

  // 移除上传的图片
  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // 上下文选项组件
  const ContextToggle = ({
    contextKey,
    label,
    icon: Icon,
  }: {
    contextKey: keyof AIContext;
    label: string;
    icon: React.ElementType;
  }) => (
    <button
      onClick={() => updateContext(contextKey, !aiContext[contextKey])}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
        aiContext[contextKey]
          ? 'bg-purple-100 text-purple-700 border border-purple-200'
          : 'bg-gray-100 text-gray-500 border border-gray-200'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );

  const selectedModelInfo = SUPPORTED_MODELS.find(m => m.id === model);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="h-8" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">AI 助手</h3>
            <p className="text-xs text-gray-500">广告图设计</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="清空对话"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 模型选择 */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="relative">
          <button
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-left flex items-center justify-between hover:border-gray-300 transition-colors text-sm"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-500" />
              <span className="font-medium text-gray-700">{selectedModelInfo?.name}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showModelDropdown && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {SUPPORTED_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setModel(m.id); setShowModelDropdown(false); }}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors text-sm ${model === m.id ? 'bg-purple-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">{m.name}</span>
                      <p className="text-xs text-gray-500">{m.description}</p>
                    </div>
                    {model === m.id && <Check className="w-4 h-4 text-purple-500" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 尺寸选择 */}
        <div className="flex gap-1 mt-2">
          {ASPECT_RATIO_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onAspectRatioChange(opt.id)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                aspectRatio === opt.id
                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-[10px] opacity-70 ml-1">({opt.desc})</span>
            </button>
          ))}
        </div>
      </div>

      {/* 当前选中的图片（用于迭代修改） */}
      {selectedImageUrl && (
        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100">
          <div className="flex items-center gap-2">
            <img src={selectedImageUrl} alt="Selected" className="w-10 h-10 object-cover rounded" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-purple-700">基于此图继续修改</p>
              <p className="text-xs text-purple-500 truncate">输入修改要求，AI 将在此基础上调整</p>
            </div>
            <button
              onClick={() => setSelectedImageForIteration(null)}
              className="p-1 text-purple-400 hover:text-purple-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onImageClick={msg.images ? (imageId, imageUrl) => handleImageClick(msg.id, imageId, imageUrl) : undefined}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部操作区 */}
      <div className="border-t border-gray-200">
        {/* AI 上下文设置 */}
        <div className="px-4 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-500 mb-2">AI 上下文:</p>
          <div className="flex flex-wrap gap-2">
            <ContextToggle
              contextKey="includeProductImage"
              label="商品图"
              icon={Image}
            />
            <ContextToggle
              contextKey="includePrice"
              label="价格"
              icon={DollarSign}
            />
            <ContextToggle
              contextKey="includeTitle"
              label="标题"
              icon={Type}
            />
            <ContextToggle
              contextKey="includeLogo"
              label="Logo"
              icon={Image}
            />
          </div>
        </div>

        {/* 上传的图片预览 */}
        {uploadedImages.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-2">参考图片:</p>
            <div className="flex gap-2 flex-wrap">
              {uploadedImages.map((img, index) => (
                <div key={index} className="relative group">
                  <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                  <button
                    onClick={() => removeUploadedImage(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 输入区域 */}
        <div className="p-4">
          {!product && (
            <div className="mb-2 px-3 py-2 bg-amber-50 text-amber-700 text-xs rounded-lg">
              请先选择商品后再生成广告图
            </div>
          )}
          <div className="relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                product
                  ? selectedImageUrl
                    ? '输入修改要求...'
                    : '描述你想要的广告图效果...'
                  : '请先选择商品'
              }
              disabled={!product || isGenerating}
              className="w-full px-4 py-3 pr-24 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
              rows={2}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {/* 上传图片按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!product || isGenerating}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="上传参考图片"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              {/* 发送按钮 */}
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isGenerating || !product}
                className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage.url}
          onClose={() => setPreviewImage(null)}
          onSelect={handlePreviewSelect}
          onSaveDraft={handlePreviewSaveDraft}
          onConfirm={handlePreviewConfirm}
          onSiteExport={handlePreviewSiteExport}
        />
      )}
    </div>
  );
}
