/**
 * 上架商品弹窗
 * 左侧草稿列表 + 右侧编辑区
 * 支持多草稿并行 AI 生成和发布
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Loader2, Sparkles, Send, Trash2, GripVertical, X, Plus, ChevronDown, ChevronUp, Check, AlertCircle, Link, Clipboard } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SiteKey, UploadedImage, ProductContent } from '../lib/types';
import { SITES, DEFAULT_PRODUCT_INFO, calculatePrice, generateProductTitle, getTeamFromCategories, generateSKU } from '../lib/attributes';
import { setGeminiModel, getGeminiModel, recognizeJerseyAttributes, generateProductContent, setAvailableCategories, type GeminiModel } from '../lib/ai';
import { uploadImageToStorage, getCategoriesFromDb } from '../lib/supabase';
import { publishProduct, type PublishResult } from '../lib/sync-api';
import { ProductForm } from './ProductForm';
import { getLeafCategories } from '../lib/products';
import { loadDrafts, saveDraft, deleteDraft, createEmptyDraft, debouncedSaveDraft, type ProductDraft } from '../lib/drafts';

// ==================== 类型定义 ====================

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 每个草稿的操作状态
interface DraftStatus {
  isGenerating: boolean;
  isPublishing: boolean;
  publishResults: PublishResult[];
  error?: string;
}

// ==================== 可拖拽图片组件 ====================

function SortableImage({
  image,
  isFirst,
  onRemove,
}: {
  image: UploadedImage;
  isFirst: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative group rounded-lg overflow-hidden bg-gray-50 border border-gray-200
        ${isFirst ? 'col-span-2 row-span-2' : ''}
        ${isDragging ? 'opacity-50 ring-2 ring-black' : ''}
      `}
    >
      <img
        src={image.url}
        alt=""
        className={`w-full object-contain ${isFirst ? 'h-40' : 'h-20'}`}
      />
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 p-1 bg-white/90 rounded cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-3 h-3 text-gray-500" />
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1 right-1 p-1 bg-white/90 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3 text-gray-500 hover:text-red-500" />
      </button>
      {isFirst && (
        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black text-white text-[10px] rounded">
          主图
        </div>
      )}
    </div>
  );
}

// ==================== 辅助函数 ====================

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getImageBase64(image: UploadedImage): Promise<string | null> {
  if (image.base64) return image.base64;
  if (!image.url) return null;
  
  try {
    const response = await fetch(image.url);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('获取图片 base64 失败:', e);
    return null;
  }
}

// ==================== 主组件 ====================

export function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSite, setExpandedSite] = useState<SiteKey | null>(null);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(getGeminiModel());
  
  // 使用 ref 存储最新的 drafts 状态，确保异步操作中能获取最新值
  const draftsRef = useRef<ProductDraft[]>([]);
  draftsRef.current = drafts;
  
  // 图片上传相关状态
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  
  // 每个草稿的操作状态（异步支持）
  const [draftStatuses, setDraftStatuses] = useState<Record<string, DraftStatus>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 当前选中的草稿
  const selectedDraft = drafts.find(d => d.id === selectedDraftId) || null;
  const selectedStatus = selectedDraftId ? draftStatuses[selectedDraftId] : null;

  // 获取或创建草稿状态
  const getDraftStatus = useCallback((draftId: string): DraftStatus => {
    return draftStatuses[draftId] || { isGenerating: false, isPublishing: false, publishResults: [] };
  }, [draftStatuses]);

  // 更新草稿状态
  const updateDraftStatus = useCallback((draftId: string, updates: Partial<DraftStatus>) => {
    setDraftStatuses(prev => ({
      ...prev,
      [draftId]: { ...getDraftStatus(draftId), ...updates }
    }));
  }, [getDraftStatus]);

  // 加载草稿和分类
  useEffect(() => {
    if (!isOpen) return;

    const init = async () => {
      setIsLoading(true);
      try {
        const teams = await getLeafCategories();
        setAvailableCategories(teams);

        const loaded = await loadDrafts();
        setDrafts(loaded);

        if (loaded.length > 0 && !selectedDraftId) {
          setSelectedDraftId(loaded[0].id);
        }
      } catch (error) {
        console.error('初始化失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [isOpen]);

  // 切换 AI 模型
  const handleModelChange = (model: GeminiModel) => {
    setSelectedModel(model);
    setGeminiModel(model);
  };

  // 新建草稿
  const handleNewDraft = async () => {
    const newDraft = createEmptyDraft();
    const saved = await saveDraft(newDraft);
    if (saved) {
      setDrafts(prev => [saved, ...prev]);
      setSelectedDraftId(saved.id);
    }
  };

  // 更新草稿
  const handleUpdateDraft = useCallback((updated: ProductDraft) => {
    // 检查关键属性是否改变（version, season, type, gender, sleeve）
    // 如果改变且已有 AI 生成内容，清除旧内容提示重新生成
    setDrafts(prev => {
      const oldDraft = prev.find(d => d.id === updated.id);
      if (oldDraft && Object.keys(oldDraft.content).length > 0) {
        const keyFieldsChanged = 
          oldDraft.info.version !== updated.info.version ||
          oldDraft.info.season !== updated.info.season ||
          oldDraft.info.type !== updated.info.type ||
          oldDraft.info.gender !== updated.info.gender ||
          oldDraft.info.sleeve !== updated.info.sleeve;
        
        // 如果关键属性改变，清除旧内容
        if (keyFieldsChanged) {
          updated.content = {};
        }
      }
      return prev.map(d => d.id === updated.id ? updated : d);
    });
    debouncedSaveDraft(updated);
  }, []);

  // 删除草稿
  const handleDeleteDraft = useCallback(async (id: string) => {
    const success = await deleteDraft(id);
    if (success) {
      setDrafts(prev => {
        const filtered = prev.filter(d => d.id !== id);
        // 如果删除的是当前选中的草稿，切换到其他草稿
        if (selectedDraftId === id) {
          // 优先选择第一个草稿，如果列表为空则设为 null
          setSelectedDraftId(filtered.length > 0 ? filtered[0].id : null);
        }
        return filtered;
      });
      setDraftStatuses(prev => {
        const newStatuses = { ...prev };
        delete newStatuses[id];
        return newStatuses;
      });
    }
  }, [selectedDraftId]);

  // 添加图片
  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedDraft) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImages: UploadedImage[] = await Promise.all(
      files.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: URL.createObjectURL(file),
          file,
          base64,
        };
      })
    );

    const updated = { ...selectedDraft, images: [...selectedDraft.images, ...newImages] };
    handleUpdateDraft(updated);

    // 如果是第一张图片，自动进行 AI 识别
    if (selectedDraft.images.length === 0 && newImages[0].base64) {
      handleRecognizeAttributes(selectedDraft.id, updated, newImages[0].base64);
    }

    e.target.value = '';
  };

  // 处理粘贴图片
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (!selectedDraft) return;
    
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length === 0) return;
    
    e.preventDefault();
    setImageError(null);

    try {
      const newImages: UploadedImage[] = await Promise.all(
        imageFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: URL.createObjectURL(file),
            file,
            base64,
          };
        })
      );

      const updated = { ...selectedDraft, images: [...selectedDraft.images, ...newImages] };
      handleUpdateDraft(updated);

      // 如果是第一张图片，自动进行 AI 识别
      if (selectedDraft.images.length === 0 && newImages[0].base64) {
        handleRecognizeAttributes(selectedDraft.id, updated, newImages[0].base64);
      }
    } catch (err) {
      console.error('粘贴图片失败:', err);
      setImageError('粘贴图片失败');
    }
  }, [selectedDraft, handleUpdateDraft]);

  // 监听粘贴事件
  useEffect(() => {
    if (!isOpen) return;
    
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, handlePaste]);

  // 从 URL 下载图片
  const handleUrlDownload = async () => {
    if (!selectedDraft || !imageUrl.trim()) return;

    setUrlLoading(true);
    setImageError(null);

    try {
      // 使用 fetch 获取图片
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`获取图片失败: ${response.status}`);
      }

      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) {
        throw new Error('链接不是有效的图片');
      }

      // 转换为 base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 从 URL 提取文件名
      const urlPath = new URL(imageUrl).pathname;
      const filename = urlPath.split('/').pop() || `download-${Date.now()}.jpg`;

      const newImage: UploadedImage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: URL.createObjectURL(blob),
        file: new File([blob], filename, { type: blob.type }),
        base64,
      };

      const updated = { ...selectedDraft, images: [...selectedDraft.images, newImage] };
      handleUpdateDraft(updated);

      // 如果是第一张图片，自动进行 AI 识别
      if (selectedDraft.images.length === 0 && base64) {
        handleRecognizeAttributes(selectedDraft.id, updated, base64);
      }

      setImageUrl('');
      setShowUrlInput(false);
    } catch (err) {
      console.error('URL 下载失败:', err);
      // 如果 CORS 失败，尝试直接使用 URL
      if (err instanceof TypeError && err.message.includes('fetch')) {
        try {
          const testImg = new Image();
          testImg.crossOrigin = 'anonymous';
          await new Promise((resolve, reject) => {
            testImg.onload = resolve;
            testImg.onerror = reject;
            testImg.src = imageUrl;
          });
          // 图片可以加载，尝试通过 canvas 获取 base64
          const canvas = document.createElement('canvas');
          canvas.width = testImg.naturalWidth;
          canvas.height = testImg.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(testImg, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg');
          const base64 = dataUrl.split(',')[1];
          
          const newImage: UploadedImage = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: imageUrl,
            base64,
          };

          const updated = { ...selectedDraft, images: [...selectedDraft.images, newImage] };
          handleUpdateDraft(updated);

          if (selectedDraft.images.length === 0 && base64) {
            handleRecognizeAttributes(selectedDraft.id, updated, base64);
          }

          setImageUrl('');
          setShowUrlInput(false);
          return;
        } catch {
          setImageError('无法加载图片，请检查链接是否有效或尝试下载后手动上传');
          return;
        }
      }
      setImageError(err instanceof Error ? err.message : '下载图片失败');
    } finally {
      setUrlLoading(false);
    }
  };

  // AI 识别属性（异步）
  const handleRecognizeAttributes = async (draftId: string, draft: ProductDraft, imageBase64: string) => {
    updateDraftStatus(draftId, { isGenerating: true, error: undefined });
    
    try {
      const attributes = await recognizeJerseyAttributes(imageBase64);
      
      let categories: string[] = [];
      if (attributes.team) {
        const allCategories = await getCategoriesFromDb('com');
        const teamCat = allCategories.find(c => c.name === attributes.team);
        if (teamCat) {
          categories.push(attributes.team);
          if (teamCat.parent > 0) {
            const parentCat = allCategories.find(c => c.id === teamCat.parent);
            if (parentCat) categories.push(parentCat.name);
          }
        } else {
          categories.push(attributes.team);
        }
      }
      categories = [...DEFAULT_PRODUCT_INFO.categories, ...categories];

      const season = attributes.season || DEFAULT_PRODUCT_INFO.season;
      const type = attributes.type || DEFAULT_PRODUCT_INFO.type;
      const gender = attributes.gender || DEFAULT_PRODUCT_INFO.gender;
      const sleeve = attributes.sleeve || DEFAULT_PRODUCT_INFO.sleeve;
      const version = season === 'Retro' ? 'Retro' : 'Standard';
      const price = calculatePrice({ season, type, gender, sleeve });

      const updatedDraft = {
        ...draft,
        info: {
          ...draft.info,
          categories,
          season,
          type,
          version,
          gender,
          sleeve,
          events: attributes.events || draft.info.events,
          price,
        },
      };
      
      handleUpdateDraft(updatedDraft);
    } catch (error) {
      console.error('AI 识别失败:', error);
      updateDraftStatus(draftId, { error: 'AI 识别失败' });
    } finally {
      updateDraftStatus(draftId, { isGenerating: false });
    }
  };

  // 移除图片
  const handleRemoveImage = (imageId: string) => {
    if (!selectedDraft) return;
    const newImages = selectedDraft.images.filter(img => img.id !== imageId);
    handleUpdateDraft({ ...selectedDraft, images: newImages });
  };

  // 拖拽排序
  const handleDragEnd = (event: DragEndEvent) => {
    if (!selectedDraft) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = selectedDraft.images.findIndex(img => img.id === active.id);
      const newIndex = selectedDraft.images.findIndex(img => img.id === over.id);
      handleUpdateDraft({
        ...selectedDraft,
        images: arrayMove(selectedDraft.images, oldIndex, newIndex),
      });
    }
  };

  // AI 生成内容（异步，支持并行）
  const handleAIGenerate = async (draftId?: string) => {
    const targetId = draftId || selectedDraftId;
    if (!targetId) return;
    
    // 使用 ref 获取最新的草稿状态（确保获取到用户最新修改的属性）
    const latestDraft = draftsRef.current.find(d => d.id === targetId);
    
    if (!latestDraft || latestDraft.images.length === 0) {
      alert('请先上传图片');
      return;
    }

    const team = getTeamFromCategories(latestDraft.info.categories);
    if (!team) {
      alert('请先选择球队分类');
      return;
    }

    updateDraftStatus(targetId, { isGenerating: true, error: undefined });

    try {
      const imageBase64 = await getImageBase64(latestDraft.images[0]);
      if (!imageBase64) {
        throw new Error('图片数据不可用');
      }

      // 使用最新的草稿信息生成属性（确保使用最新的 version、season 等）
      const attributes = {
        team,
        season: latestDraft.info.season,
        type: latestDraft.info.type,
        version: latestDraft.info.version,
        gender: latestDraft.info.gender,
        sleeve: latestDraft.info.sleeve,
        events: latestDraft.info.events,
      };

      // 使用最新的草稿信息生成标题（确保标题包含最新的 version）
      const generatedTitle = generateProductTitle(latestDraft.info);
      
      console.log('AI 生成参数:', {
        version: latestDraft.info.version,
        season: latestDraft.info.season,
        type: latestDraft.info.type,
        generatedTitle,
      });

      const results = await Promise.all(
        latestDraft.selectedSites.map(site =>
          generateProductContent(imageBase64, site, attributes, generatedTitle)
        )
      );

      // 更新草稿（再次从 ref 获取最新状态，保留其他站点的内容）
      const currentDraft = draftsRef.current.find(d => d.id === targetId);
      if (currentDraft) {
        const newContent: Partial<Record<SiteKey, ProductContent>> = { ...currentDraft.content };
        results.forEach((content, index) => {
          newContent[latestDraft.selectedSites[index]] = content;
        });
        
        const updatedDraft = { ...currentDraft, content: newContent };
        setDrafts(prev => prev.map(d => d.id === targetId ? updatedDraft : d));
        debouncedSaveDraft(updatedDraft);
      }
      
    } catch (error) {
      console.error('AI 生成失败:', error);
      updateDraftStatus(targetId, { error: 'AI 生成失败' });
    } finally {
      updateDraftStatus(targetId, { isGenerating: false });
    }
  };

  // 发布商品（异步，支持并行）
  const handlePublish = async (draftId?: string) => {
    const targetId = draftId || selectedDraftId;
    if (!targetId) return;

    const draft = drafts.find(d => d.id === targetId);
    if (!draft) return;

    const team = getTeamFromCategories(draft.info.categories);
    if (draft.images.length === 0 || !team) {
      alert('请先上传图片并选择球队分类');
      return;
    }

    updateDraftStatus(targetId, { isPublishing: true, publishResults: [], error: undefined });

    try {
      // 上传图片
      const imageUrls: string[] = [];
      for (let i = 0; i < draft.images.length; i++) {
        const img = draft.images[i];
        const base64 = await getImageBase64(img);
        if (base64) {
          const filename = `jersey-${Date.now()}-${i}.jpg`;
          const publicUrl = await uploadImageToStorage(base64, filename);
          imageUrls.push(publicUrl);
        } else if (img.url && !img.url.startsWith('blob:')) {
          imageUrls.push(img.url);
        }
      }

      const sku = generateSKU(team, draft.info.season, draft.info.type);

      const result = await publishProduct(draft.selectedSites, {
        sku,
        name: generateProductTitle(draft.info) || `${team} ${draft.info.type} Jersey ${draft.info.season}`,
        images: imageUrls,
        categories: draft.info.categories,
        attributes: {
          team,
          season: draft.info.season,
          type: draft.info.type,
          version: draft.info.version,
          gender: draft.info.gender,
          sleeve: draft.info.sleeve,
          events: draft.info.events,
        },
        price: draft.info.price,
        content: draft.content,
      });

      updateDraftStatus(targetId, { publishResults: result.results });

      if (result.results.every(r => r.success)) {
        // 全部成功，延迟删除草稿
        // handleDeleteDraft 会自动处理选中草稿的切换：
        // - 如果删除的是当前选中的草稿，会自动切换到其他草稿
        // - 如果用户已经切换到其他草稿，则保持当前选中的草稿不变
        setTimeout(async () => {
          await handleDeleteDraft(targetId);
        }, 2000);
      }
    } catch (error) {
      console.error('发布失败:', error);
      updateDraftStatus(targetId, { error: '发布失败: ' + (error instanceof Error ? error.message : '未知错误') });
    } finally {
      updateDraftStatus(targetId, { isPublishing: false });
    }
  };

  // 批量 AI 生成（所有待处理的草稿）
  const handleBatchAIGenerate = () => {
    drafts.forEach(draft => {
      const status = getDraftStatus(draft.id);
      const team = getTeamFromCategories(draft.info.categories);
      // 只处理有图片、有球队、未在处理中、还没有生成内容的草稿
      if (draft.images.length > 0 && team && !status.isGenerating && !status.isPublishing && Object.keys(draft.content).length === 0) {
        handleAIGenerate(draft.id);
      }
    });
  };

  // 批量发布（所有已生成内容的草稿）
  const handleBatchPublish = () => {
    drafts.forEach(draft => {
      const status = getDraftStatus(draft.id);
      const team = getTeamFromCategories(draft.info.categories);
      // 只处理有图片、有球队、未在处理中、已有内容的草稿
      if (draft.images.length > 0 && team && !status.isGenerating && !status.isPublishing && Object.keys(draft.content).length > 0) {
        handlePublish(draft.id);
      }
    });
  };

  const team = selectedDraft ? getTeamFromCategories(selectedDraft.info.categories) : '';
  const title = selectedDraft ? generateProductTitle(selectedDraft.info) : '';
  const sku = selectedDraft && team ? generateSKU(team, selectedDraft.info.season, selectedDraft.info.type) : '';
  const hasAIContent = selectedDraft && Object.keys(selectedDraft.content).length > 0;
  const canPublish = selectedDraft && selectedDraft.images.length > 0 && team && selectedDraft.selectedSites.length > 0 && hasAIContent;
  
  // 统计
  const readyToGenerate = drafts.filter(d => {
    const status = getDraftStatus(d.id);
    const t = getTeamFromCategories(d.info.categories);
    return d.images.length > 0 && t && !status.isGenerating && !status.isPublishing && Object.keys(d.content).length === 0;
  }).length;
  
  const readyToPublish = drafts.filter(d => {
    const status = getDraftStatus(d.id);
    const t = getTeamFromCategories(d.info.categories);
    return d.images.length > 0 && t && !status.isGenerating && !status.isPublishing && Object.keys(d.content).length > 0;
  }).length;

  const processing = drafts.filter(d => {
    const status = getDraftStatus(d.id);
    return status.isGenerating || status.isPublishing;
  }).length;

  // 始终渲染，用 CSS 控制显示（保持状态不丢失）
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-[1100px] max-w-[95vw] h-[85vh] flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">上架商品</h2>
            {processing > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
                处理中 {processing}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* AI 模型选择 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">AI:</span>
              {(['gemini-2.5-flash', 'gemini-2.5-pro'] as GeminiModel[]).map((model) => (
                <button
                  key={model}
                  onClick={() => handleModelChange(model)}
                  className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                    selectedModel === model
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {model === 'gemini-2.5-flash' ? 'Flash' : 'Pro'}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 主体 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：草稿列表 */}
          <div className="w-60 border-r border-gray-200 bg-gray-50 flex flex-col">
            <div className="p-3 space-y-2">
              <button
                onClick={handleNewDraft}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                新建草稿
              </button>
              
              {/* 批量操作 */}
              {drafts.length > 0 && (
                <div className="flex gap-1.5">
                  <button
                    onClick={handleBatchAIGenerate}
                    disabled={readyToGenerate === 0}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={`${readyToGenerate} 个草稿待生成`}
                  >
                    <Sparkles className="w-3 h-3" />
                    生成 ({readyToGenerate})
                  </button>
                  <button
                    onClick={handleBatchPublish}
                    disabled={readyToPublish === 0}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={`${readyToPublish} 个草稿待发布`}
                  >
                    <Send className="w-3 h-3" />
                    发布 ({readyToPublish})
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : drafts.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">暂无草稿</p>
              ) : (
                drafts.map((draft) => {
                  const draftTitle = generateProductTitle(draft.info) || '新商品';
                  const isSelected = draft.id === selectedDraftId;
                  const status = getDraftStatus(draft.id);
                  const hasContent = Object.keys(draft.content).length > 0;
                  const draftTeam = getTeamFromCategories(draft.info.categories);

                  return (
                    <div
                      key={draft.id}
                      onClick={() => setSelectedDraftId(draft.id)}
                      className={`
                        p-2 rounded-lg cursor-pointer transition-colors relative
                        ${isSelected ? 'bg-white shadow-sm ring-1 ring-gray-200' : 'hover:bg-gray-100'}
                        ${status.isGenerating || status.isPublishing ? 'animate-pulse' : ''}
                      `}
                    >
                      <div className="flex gap-2">
                        {/* 缩略图 */}
                        <div className="w-12 h-12 rounded bg-gray-200 flex-shrink-0 overflow-hidden relative">
                          {draft.images[0] ? (
                            <img src={draft.images[0].url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Upload className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          {/* 状态指示器 */}
                          {status.isGenerating && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                            </div>
                          )}
                          {status.isPublishing && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 text-white animate-spin" />
                            </div>
                          )}
                          {status.publishResults.length > 0 && status.publishResults.every(r => r.success) && (
                            <div className="absolute inset-0 bg-green-500/80 flex items-center justify-center">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                        {/* 信息 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate" title={draftTitle}>
                            {draftTitle}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[10px] text-gray-500">
                              {draft.images.length} 图
                            </span>
                            {hasContent && (
                              <span className="text-[10px] text-green-600">• 已生成</span>
                            )}
                            {!draftTeam && draft.images.length > 0 && (
                              <span className="text-[10px] text-orange-500">• 待选队</span>
                            )}
                          </div>
                          {status.error && (
                            <p className="text-[10px] text-red-500 truncate mt-0.5">{status.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 右侧：编辑区 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedDraft ? (
              <>
                {/* 标题和 SKU */}
                <div className="px-6 py-4 border-b border-gray-100 bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-medium text-gray-900 break-words">
                        {title || '新商品'}
                      </h3>
                      {sku && (
                        <p className="text-sm text-gray-500 mt-1 font-mono">
                          SKU: {sku}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteDraft(selectedDraft.id)}
                      disabled={selectedStatus?.isGenerating || selectedStatus?.isPublishing}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* 滚动内容 */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* 图片区域 */}
                  <div className="mb-6">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={selectedDraft.images.map(img => img.id)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-5 gap-2">
                          {selectedDraft.images.map((image, index) => (
                            <SortableImage
                              key={image.id}
                              image={image}
                              isFirst={index === 0}
                              onRemove={() => handleRemoveImage(image.id)}
                            />
                          ))}
                          {/* 文件上传按钮 */}
                          <label className="aspect-square border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 cursor-pointer transition-colors">
                            <Plus className="w-5 h-5" />
                            <span className="text-xs mt-1">文件</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              className="hidden"
                              onChange={handleAddImages}
                            />
                          </label>
                          {/* URL 下载按钮 */}
                          <button
                            type="button"
                            onClick={() => setShowUrlInput(!showUrlInput)}
                            disabled={urlLoading}
                            className={`aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors ${
                              showUrlInput
                                ? 'border-blue-400 bg-blue-50 text-blue-500'
                                : urlLoading
                                  ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                                  : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-500'
                            }`}
                            title="从链接下载图片"
                          >
                            {urlLoading ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Link className="w-5 h-5" />
                            )}
                            <span className="text-xs mt-1">链接</span>
                          </button>
                        </div>
                      </SortableContext>
                    </DndContext>

                    {/* URL 输入框 */}
                    {showUrlInput && (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="url"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleUrlDownload();
                            }
                          }}
                          placeholder="输入图片链接，如 https://example.com/image.jpg"
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={urlLoading}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleUrlDownload}
                          disabled={!imageUrl.trim() || urlLoading}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            !imageUrl.trim() || urlLoading
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-500 text-white hover:bg-blue-600'
                          }`}
                        >
                          {urlLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            '下载'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowUrlInput(false);
                            setImageUrl('');
                          }}
                          className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
                        >
                          取消
                        </button>
                      </div>
                    )}

                    {/* 错误提示 */}
                    {imageError && (
                      <div className="mt-2 text-xs text-red-500 bg-red-50 rounded-lg p-2 flex items-center gap-2">
                        <AlertCircle className="w-3 h-3" />
                        {imageError}
                      </div>
                    )}

                    {/* 粘贴提示 */}
                    {selectedDraft.images.length === 0 && (
                      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
                        <Clipboard className="w-3.5 h-3.5" />
                        <span>可直接粘贴图片 (Ctrl/Cmd + V)</span>
                      </div>
                    )}
                  </div>

                  {/* 表单 */}
                  <ProductForm
                    info={selectedDraft.info}
                    onChange={(info) => handleUpdateDraft({ ...selectedDraft, info })}
                  />

                  {/* AI 生成预览 */}
                  {Object.keys(selectedDraft.content).length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-500 mb-3">AI 生成预览</p>
                      <div className="space-y-2">
                        {selectedDraft.selectedSites.map((site) => {
                          const content = selectedDraft.content[site];
                          if (!content) return null;
                          const siteConfig = SITES.find(s => s.key === site);
                          const isExpanded = expandedSite === site;

                          return (
                            <div key={site} className="border border-gray-100 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setExpandedSite(isExpanded ? null : site)}
                                className="w-full px-3 py-2 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span>{siteConfig?.flag}</span>
                                  <span className="text-sm text-gray-600 truncate">{content.name}</span>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                )}
                              </button>

                              {isExpanded && (
                                <>
                                  <div className="px-3 py-2 border-t border-gray-100">
                                    <p className="text-xs text-gray-400 mb-1">Short Description</p>
                                    <div
                                      className="text-sm text-gray-700 prose prose-sm max-w-none"
                                      dangerouslySetInnerHTML={{ __html: content.short_description }}
                                    />
                                  </div>
                                  <div className="px-3 py-2 border-t border-gray-100">
                                    <p className="text-xs text-gray-400 mb-1">Description</p>
                                    <div
                                      className="text-sm text-gray-700 prose prose-sm max-w-none"
                                      dangerouslySetInnerHTML={{ __html: content.description }}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 底部操作栏 */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between gap-4">
                    {/* 站点选择 */}
                    <div className="flex items-center gap-1.5">
                      {SITES.map((site) => (
                        <button
                          key={site.key}
                          onClick={() => {
                            const isSelected = selectedDraft.selectedSites.includes(site.key);
                            handleUpdateDraft({
                              ...selectedDraft,
                              selectedSites: isSelected
                                ? selectedDraft.selectedSites.filter(s => s !== site.key)
                                : [...selectedDraft.selectedSites, site.key],
                            });
                          }}
                          className={`px-2.5 py-1 text-sm rounded-full transition-colors ${
                            selectedDraft.selectedSites.includes(site.key)
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {site.flag}
                        </button>
                      ))}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAIGenerate()}
                        disabled={selectedStatus?.isGenerating || selectedStatus?.isPublishing || selectedDraft.images.length === 0}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {selectedStatus?.isGenerating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        AI 生成
                      </button>
                      <div className="relative group">
                        <button
                          onClick={() => handlePublish()}
                          disabled={!canPublish || selectedStatus?.isGenerating || selectedStatus?.isPublishing}
                          className="flex items-center gap-1.5 px-5 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {selectedStatus?.isPublishing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          发布
                        </button>
                        {/* 发布条件提示 */}
                        {!canPublish && selectedDraft && !selectedStatus?.isPublishing && (
                          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            {selectedDraft.images.length === 0 ? '请先上传图片' :
                             !team ? '请先选择球队分类' :
                             selectedDraft.selectedSites.length === 0 ? '请先选择发布站点' :
                             !hasAIContent ? '请先点击「AI 生成」生成商品资料' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 发布状态 */}
                  {selectedStatus?.publishResults && selectedStatus.publishResults.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {selectedStatus.publishResults.map((result) => {
                        const siteConfig = SITES.find(s => s.key === result.site);
                        return (
                          <div key={result.site} className="flex items-center gap-1.5 text-sm">
                            <span>{siteConfig?.flag}</span>
                            {result.success ? (
                              <a
                                href={result.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:underline"
                              >
                                成功
                              </a>
                            ) : (
                              <span className="text-red-500">{result.error || '失败'}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* 错误提示 */}
                  {selectedStatus?.error && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-red-500">
                      <AlertCircle className="w-4 h-4" />
                      {selectedStatus.error}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <Upload className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-sm">选择草稿或新建一个</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
