import { useState, useRef } from 'react';
import { Plus, GripVertical, Image as ImageIcon, Loader2, ZoomIn, Trash2, Copy, CheckCircle2, Sparkles, Video, Link, Play, Pause, Volume2, VolumeX, ArrowDownToLine } from 'lucide-react';
import { uploadImageToStorage, transferVideoToStorage, uploadVideoToStorage } from '../lib/supabase';
import { ImageLightbox } from './ImageLightbox';
import { AIImageModal } from './AIImageModal';

// 判断 URL 是否是视频
function isVideoUrl(url: string): boolean {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.m4v'];
  const lowerUrl = url.toLowerCase().split('?')[0];
  return videoExtensions.some(ext => lowerUrl.endsWith(ext));
}

// 判断 URL 是否已经是我们的存储 URL
function isStorageUrl(url: string): boolean {
  return url.includes('supabase.co') || url.includes('supabase.in');
}

interface MediaItem {
  type: 'image' | 'video';
  url: string;
}

interface MediaGalleryProps {
  images: string[];
  videoUrl?: string | null;
  onImagesChange: (images: string[]) => void;
  onVideoChange: (videoUrl: string | null) => void;
  editable?: boolean;
  showLinks?: boolean;
  onCopyLink?: (url: string, index: number) => void;
  copiedIndex?: number | null;
  showAIButton?: boolean;
  sku?: string;
}

export function MediaGallery({
  images,
  videoUrl,
  onImagesChange,
  onVideoChange,
  editable = true,
  showLinks = false,
  onCopyLink,
  copiedIndex = null,
  showAIButton = true,
  sku = ''
}: MediaGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [urlInputType, setUrlInputType] = useState<'auto' | 'image' | 'video'>('auto');
  const [transferring, setTransferring] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 构建媒体列表：视频在前，图片在后
  const mediaItems: MediaItem[] = [
    ...(videoUrl ? [{ type: 'video' as const, url: videoUrl }] : []),
    ...images.map(url => ({ type: 'image' as const, url }))
  ];

  const selectedMedia = mediaItems[selectedIndex];
  const hasVideo = !!videoUrl;

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

  // 删除媒体
  const handleDeleteClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setDeleteConfirmIndex(index);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmIndex === null) return;

    const media = mediaItems[deleteConfirmIndex];
    if (media.type === 'video') {
      onVideoChange(null);
    } else {
      // 图片在 mediaItems 中的索引 = deleteConfirmIndex - (hasVideo ? 1 : 0)
      const imageIndex = deleteConfirmIndex - (hasVideo ? 1 : 0);
      const newImages = images.filter((_, i) => i !== imageIndex);
      onImagesChange(newImages);
    }

    if (selectedIndex >= mediaItems.length - 1) {
      setSelectedIndex(Math.max(0, mediaItems.length - 2));
    }
    setDeleteConfirmIndex(null);
  };

  // 打开 lightbox（仅图片）
  const handleOpenLightbox = () => {
    if (selectedMedia?.type === 'image') {
      setLightboxOpen(true);
    }
  };

  // 上传文件（图片或视频）
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    const newImages: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/');

        if (isVideo) {
          // 视频：检查大小（最大 50MB）
          if (file.size > 50 * 1024 * 1024) {
            throw new Error(`视频 ${file.name} 过大，最大支持 50MB`);
          }

          // 直接上传到 Supabase Storage（自动转存）
          if (!sku) {
            throw new Error('需要 SKU 才能上传视频');
          }
          const result = await uploadVideoToStorage(file, sku);
          onVideoChange(result.url);
          setSelectedIndex(0); // 选中视频
          const sizeMB = (result.size / 1024 / 1024).toFixed(2);
          console.log(`✅ 视频已上传: ${sizeMB}MB`);
        } else {
          // 图片处理
          const reader = new FileReader();
          const base64Data = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const publicUrl = await uploadImageToStorage(base64Data, file.name);
          newImages.push(publicUrl);
        }
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 通过 URL 添加媒体
  const handleAddByUrl = async () => {
    if (!urlInputValue.trim()) return;

    const url = urlInputValue.trim();
    const isVideo = urlInputType === 'video' || (urlInputType === 'auto' && isVideoUrl(url));

    setUrlInputValue('');
    setShowUrlInput(false);

    if (isVideo) {
      // 视频 URL 自动转存到 Storage
      if (!sku) {
        setUploadError('需要 SKU 才能转存视频');
        return;
      }
      
      // 如果已经是 Storage URL，直接使用
      if (isStorageUrl(url)) {
        onVideoChange(url);
        setSelectedIndex(0);
        return;
      }

      // 转存到 Storage
      setTransferring(true);
      setUploadError(null);
      try {
        const result = await transferVideoToStorage(url, sku);
        onVideoChange(result.url);
        setSelectedIndex(0);
        const sizeMB = (result.size / 1024 / 1024).toFixed(2);
        console.log(`✅ 视频已转存: ${sizeMB}MB`);
      } catch (err) {
        console.error('Transfer video failed:', err);
        setUploadError(err instanceof Error ? err.message : '转存失败');
        // 转存失败时使用原始 URL
        onVideoChange(url);
        setSelectedIndex(0);
      } finally {
        setTransferring(false);
      }
    } else {
      onImagesChange([...images, url]);
    }
  };

  // 转存视频到 Storage
  const handleTransferVideo = async () => {
    if (!videoUrl || !sku) return;
    if (isStorageUrl(videoUrl)) {
      setUploadError('视频已在存储中，无需转存');
      return;
    }

    setTransferring(true);
    setUploadError(null);

    try {
      const result = await transferVideoToStorage(videoUrl, sku);
      onVideoChange(result.url);
      const sizeMB = (result.size / 1024 / 1024).toFixed(2);
      console.log(`视频转存成功: ${sizeMB}MB`);
    } catch (err) {
      console.error('Transfer video failed:', err);
      setUploadError(err instanceof Error ? err.message : '转存失败');
    } finally {
      setTransferring(false);
    }
  };

  // 拖拽排序
  const handleDragStart = (index: number) => {
    // 视频不支持拖拽排序（始终在第一位）
    if (hasVideo && index === 0) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    // 不能拖到视频位置
    if (hasVideo && index === 0) return;

    // 图片在 mediaItems 中的索引需要转换
    const fromImageIndex = draggedIndex - (hasVideo ? 1 : 0);
    const toImageIndex = index - (hasVideo ? 1 : 0);

    if (fromImageIndex < 0 || toImageIndex < 0) return;

    const newImages = [...images];
    const [removed] = newImages.splice(fromImageIndex, 1);
    newImages.splice(toImageIndex, 0, removed);

    onImagesChange(newImages);
    setDraggedIndex(index);

    if (selectedIndex === draggedIndex) {
      setSelectedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // 视频控制
  const toggleVideoPlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setVideoPlaying(true);
      } else {
        videoRef.current.pause();
        setVideoPlaying(false);
      }
    }
  };

  const toggleVideoMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setVideoMuted(videoRef.current.muted);
    }
  };

  // 获取 lightbox 图片列表（仅图片）
  const lightboxImages = images;
  const lightboxIndex = selectedIndex - (hasVideo ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* 主预览区 */}
      <div
        className={`flex-1 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl overflow-hidden mb-4 sm:mb-5 flex items-center justify-center min-h-[300px] sm:min-h-[350px] relative group shadow-inner ${
          selectedMedia?.type === 'image' ? 'cursor-zoom-in' : ''
        }`}
        onClick={selectedMedia?.type === 'image' ? handleOpenLightbox : undefined}
      >
        {selectedMedia ? (
          selectedMedia.type === 'video' ? (
            // 视频播放器
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                src={selectedMedia.url}
                className="max-w-full max-h-full object-contain"
                autoPlay
                loop
                muted={videoMuted}
                playsInline
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
              />
              {/* 视频控制栏 */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVideoPlay(); }}
                    className="p-2 bg-black/70 backdrop-blur-sm rounded-lg text-white hover:bg-black/80 transition-colors"
                  >
                    {videoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVideoMute(); }}
                    className="p-2 bg-black/70 backdrop-blur-sm rounded-lg text-white hover:bg-black/80 transition-colors"
                  >
                    {videoMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
                {/* 转存按钮 */}
                {editable && !isStorageUrl(selectedMedia.url) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleTransferVideo(); }}
                    disabled={transferring}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {transferring ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowDownToLine className="w-4 h-4" />
                    )}
                    {transferring ? '转存中...' : '转存到存储'}
                  </button>
                )}
              </div>
              {/* 视频标识 */}
              <div className="absolute top-4 left-4 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-white text-xs flex items-center gap-1">
                <Video className="w-3 h-3" />
                视频
              </div>
            </div>
          ) : (
            // 图片预览
            <>
              <img
                src={selectedMedia.url}
                alt=""
                className="max-w-full max-h-full object-contain drop-shadow-lg"
              />
              <div className="absolute bottom-4 right-4 px-3 py-2 bg-black/70 backdrop-blur-sm rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 shadow-lg">
                <ZoomIn className="w-4 h-4" />
                <span className="text-xs font-medium">点击放大</span>
              </div>
              {showAIButton && editable && (
                <button
                  onClick={(e) => { e.stopPropagation(); setAiModalOpen(true); }}
                  className="absolute top-4 right-4 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 shadow-lg hover:from-purple-700 hover:to-indigo-700"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-medium">AI 处理</span>
                </button>
              )}
            </>
          )
        ) : (
          <div className="text-gray-400 flex flex-col items-center gap-3">
            <div className="p-4 bg-white/50 rounded-full">
              <ImageIcon className="w-12 h-12" />
            </div>
            <span className="text-sm font-medium">暂无媒体</span>
          </div>
        )}
      </div>

      {/* 缩略图列表 */}
      <div className="flex gap-3 flex-wrap">
        {mediaItems.map((media, index) => (
          <div key={`${media.type}-${index}`} className="relative group">
            <div className="flex flex-col gap-2">
              <div
                draggable={editable && !(hasVideo && index === 0)}
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
                {media.type === 'video' ? (
                  // 视频缩略图
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <video
                      src={media.url}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="p-2 bg-white/90 rounded-full">
                        <Play className="w-4 h-4 text-gray-800" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={media.url}
                    alt=""
                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                  />
                )}

                {selectedIndex === index && (
                  <div className="absolute inset-0 bg-blue-500/10 pointer-events-none" />
                )}

                {editable && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent transition-opacity flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <div className="flex items-center gap-2">
                      {!(hasVideo && index === 0) && (
                        <GripVertical className="w-4 h-4 text-white/90 cursor-grab" />
                      )}
                      <button
                        onClick={(e) => handleDeleteClick(e, index)}
                        className="p-1.5 bg-red-500 hover:bg-red-600 rounded-lg transition-all shadow-lg hover:scale-110"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="absolute top-2 left-2 w-6 h-6 bg-black/70 backdrop-blur-sm rounded-lg text-white text-xs flex items-center justify-center font-bold shadow-md">
                  {media.type === 'video' ? <Video className="w-3 h-3" /> : index + 1 - (hasVideo ? 1 : 0)}
                </div>
              </div>

              {showLinks && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopyLink(media.url, index); }}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all ${
                    copiedIndex === index
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                  title="复制链接"
                >
                  {copiedIndex === index ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* 添加按钮 */}
        {editable && (
          <div className="flex gap-2">
            {/* 上传文件 */}
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
                  <span className="text-xs mt-1.5 font-medium">上传</span>
                </>
              )}
            </button>

            {/* 添加链接 */}
            <button
              onClick={() => setShowUrlInput(true)}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all shadow-sm border-gray-300 hover:border-green-400 hover:bg-green-50/50 text-gray-400 hover:text-green-500 hover:shadow-md hover:scale-105"
            >
              <Link className="w-6 h-6" />
              <span className="text-xs mt-1.5 font-medium">链接</span>
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* URL 输入弹窗 */}
      {showUrlInput && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowUrlInput(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">添加媒体链接</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">媒体类型</label>
                <div className="flex gap-2">
                  {(['auto', 'image', 'video'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setUrlInputType(type)}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        urlInputType === type
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {type === 'auto' ? '自动识别' : type === 'image' ? '图片' : '视频'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={urlInputValue}
                  onChange={(e) => setUrlInputValue(e.target.value)}
                  placeholder="https://example.com/media.mp4"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowUrlInput(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddByUrl}
                disabled={!urlInputValue.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {uploadError && (
        <div className="mt-3 p-3 text-xs text-red-600 text-center bg-red-50 border border-red-200 rounded-lg shadow-sm">
          {uploadError}
        </div>
      )}

      {/* 媒体数量统计 */}
      <div className="mt-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-600 font-medium">
            {hasVideo && <span className="text-purple-600 font-semibold">1 视频</span>}
            {hasVideo && images.length > 0 && <span className="text-gray-400 mx-1">+</span>}
            {images.length > 0 && <span className="text-gray-900 font-semibold">{images.length} 图片</span>}
            {!hasVideo && images.length === 0 && <span className="text-gray-400">暂无媒体</span>}
            {editable && <span className="text-gray-400 mx-1">·</span>}
            {editable && <span className="text-gray-500">拖拽可排序</span>}
          </div>
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

      {/* Lightbox */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          currentIndex={Math.max(0, lightboxIndex)}
          onClose={() => setLightboxOpen(false)}
          onNavigate={(index) => setSelectedIndex(index + (hasVideo ? 1 : 0))}
        />
      )}

      {/* AI 图片处理弹窗 */}
      {aiModalOpen && images.length > 0 && (
        <AIImageModal
          sku={sku}
          images={images}
          initialIndex={Math.max(0, lightboxIndex)}
          onClose={() => setAiModalOpen(false)}
          onUpdateImages={onImagesChange}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmIndex !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirmIndex(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-600 mb-4">
              确定要删除这个{mediaItems[deleteConfirmIndex]?.type === 'video' ? '视频' : '图片'}吗？此操作无法撤销。
            </p>
            <div className="mb-4 flex justify-center">
              {mediaItems[deleteConfirmIndex]?.type === 'video' ? (
                <div className="w-24 h-24 bg-gray-800 rounded-lg flex items-center justify-center">
                  <Video className="w-8 h-8 text-white" />
                </div>
              ) : (
                <img
                  src={mediaItems[deleteConfirmIndex]?.url}
                  alt=""
                  className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                />
              )}
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
