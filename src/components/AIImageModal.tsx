import { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, Loader2, Check, RefreshCw, Replace, ImagePlus, ChevronDown, ZoomIn, Trash2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { 
  SUPPORTED_MODELS, 
  SUPPORTED_ASPECT_RATIOS, 
  type AIModelId, 
  type AspectRatioId
} from '../lib/ai-image';
import { useAISettings, usePromptTemplates } from '../hooks/useSettings';
import {
  useAiTasks,
  useCreateAiTasks,
  useDeleteAiTask,
  useRetryAiTask,
  useClearAiTasks,
  useTransferTaskImage,
  useTransferAllGcsImages,
  useAiTasksRealtimeBySku,
  mergeTasksWithLocal,
  type LocalTask
} from '../hooks/useAiTasks';
import type { TaskStatus } from '../lib/ai-tasks';

interface AIImageModalProps {
  sku: string;
  images: string[];
  initialIndex: number;
  onClose: () => void;
  onUpdateImages: (newImages: string[]) => void;
}

export function AIImageModal({ sku, images, initialIndex, onClose, onUpdateImages }: AIImageModalProps) {
  // React Query hooks
  const { data: settings, isLoading: isLoadingSettings } = useAISettings();
  const { data: templates = [], isLoading: isLoadingTemplates } = usePromptTemplates();
  const { data: dbTasks = [], refetch: refetchTasks } = useAiTasks(sku);
  
  // Mutations
  const createTasksMutation = useCreateAiTasks();
  const deleteTaskMutation = useDeleteAiTask();
  const retryTaskMutation = useRetryAiTask();
  const clearTasksMutation = useClearAiTasks();
  const transferSingleMutation = useTransferTaskImage();
  const { mutate: transferAll, progress: transferProgress, isPending: isTransferring } = useTransferAllGcsImages();
  
  // Realtime 订阅
  useAiTasksRealtimeBySku(sku);

  // 用户选择状态
  const [selectedModel, setSelectedModel] = useState<AIModelId>(settings?.defaultModel || 'gemini-3-pro-image-preview');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatioId>(settings?.defaultAspectRatio || '1:1');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);

  // 批量选择状态
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set([initialIndex]));
  
  // 本地临时任务（乐观更新）
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);

  // 放大查看状态
  const [zoomedTask, setZoomedTask] = useState<LocalTask | null>(null);
  const [zoomView, setZoomView] = useState<'original' | 'result' | 'compare'>('compare');

  // 下拉菜单状态
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);

  // 成功提示
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2000);
  }, []);

  // 合并任务列表
  const allTasks = mergeTasksWithLocal(dbTasks, localTasks);

  // 当数据库任务更新时，移除对应的本地临时任务
  const cleanupLocalTasks = useCallback(() => {
    setLocalTasks(prev => prev.filter(lt => {
      const dbTask = dbTasks.find(dt => dt.original_url === lt.original_url);
      return !dbTask || (dbTask.status === 'pending' && lt.isLocal);
    }));
  }, [dbTasks]);

  // 当设置加载完成后，更新默认值
  useEffect(() => {
    if (settings) {
      setSelectedModel(settings.defaultModel);
      setSelectedAspectRatio(settings.defaultAspectRatio);
    }
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [settings, templates]);

  // 清理本地任务（当数据库任务变化时）
  useEffect(() => {
    cleanupLocalTasks();
  }, [cleanupLocalTasks]);

  // 获取当前选中的 prompt
  const getCurrentPrompt = (): string => {
    if (useCustomPrompt) {
      return customPrompt;
    }
    const template = templates.find(t => t.id === selectedTemplateId);
    return template?.prompt || '';
  };

  // 切换选择
  const toggleSelection = (index: number) => {
    const newSelection = new Set(selectedIndices);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedIndices(newSelection);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIndices.size === images.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(images.map((_, i) => i)));
    }
  };

  // 提交批量任务（乐观更新）
  const handleSubmitTasks = async () => {
    const prompt = getCurrentPrompt();
    if (!prompt.trim()) return;
    if (selectedIndices.size === 0) return;

    const selectedUrls = Array.from(selectedIndices).map(i => images[i]);
    const now = new Date().toISOString();

    // 1. 立即创建本地临时任务（乐观更新）
    const newLocalTasks: LocalTask[] = selectedUrls.map((url, idx) => ({
      id: `local-${Date.now()}-${idx}`,
      isLocal: true,
      original_url: url,
      result_url: null,
      prompt,
      model: selectedModel,
      aspect_ratio: selectedAspectRatio,
      status: 'pending' as TaskStatus,
      error: null,
      processing_time: null,
      created_at: now,
    }));

    setLocalTasks(prev => [...newLocalTasks, ...prev]);
    setSelectedIndices(new Set()); // 清空选择

    // 2. 异步写入数据库
    try {
      await createTasksMutation.mutateAsync({
        sku,
        imageUrls: selectedUrls,
        prompt,
        model: selectedModel,
        aspectRatio: selectedAspectRatio
      });
    } catch (err) {
      console.error('Failed to submit tasks:', err);
      setLocalTasks(prev => prev.map(t => 
        newLocalTasks.some(nt => nt.id === t.id)
          ? { ...t, status: 'failed' as TaskStatus, error: '提交失败，请重试' }
          : t
      ));
    }
  };

  // 应用单个结果
  const handleApplySingle = async (task: LocalTask) => {
    if (!task.result_url) return;
    
    const index = images.findIndex(img => img === task.original_url);
    
    if (index !== -1) {
      const newImages = [...images];
      newImages[index] = task.result_url;
      onUpdateImages(newImages);
      showSuccess(`✓ 已替换第 ${index + 1} 张图片`);
      
      // 替换成功后删除任务记录
      if (!task.isLocal) {
        try {
          await deleteTaskMutation.mutateAsync({ taskId: task.id, sku });
        } catch (err) {
          console.error('Failed to delete task after apply:', err);
        }
      }
    } else {
      alert('找不到匹配的原图，请尝试点击"添加"按钮');
    }
  };

  // 添加单个结果
  const handleAddSingle = async (task: LocalTask) => {
    if (!task.result_url) return;
    onUpdateImages([...images, task.result_url]);
    showSuccess('✓ 已添加 1 张图片');
    
    // 添加成功后删除任务记录
    if (!task.isLocal) {
      try {
        await deleteTaskMutation.mutateAsync({ taskId: task.id, sku });
      } catch (err) {
        console.error('Failed to delete task after add:', err);
      }
    }
  };

  // 应用所有已完成结果
  const handleApplyAll = async () => {
    const completedTasks = allTasks.filter(t => t.status === 'completed' && t.result_url && !t.result_url.includes('storage.googleapis.com'));
    if (completedTasks.length === 0) {
      alert('没有可替换的图片（需要先转存到 Supabase）');
      return;
    }
    const newImages = [...images];
    let replacedCount = 0;
    const taskIdsToDelete: string[] = [];
    
    completedTasks.forEach(task => {
      const index = newImages.findIndex(img => img === task.original_url);
      if (index !== -1) {
        newImages[index] = task.result_url!;
        replacedCount++;
        if (!task.isLocal) taskIdsToDelete.push(task.id);
      }
    });
    
    onUpdateImages(newImages);
    showSuccess(`✓ 已替换 ${replacedCount} 张图片`);
    
    // 删除已使用的任务
    setLocalTasks([]);
    for (const id of taskIdsToDelete) {
      try { await deleteTaskMutation.mutateAsync({ taskId: id, sku }); } catch {}
    }
  };

  // 添加所有已完成结果
  const handleAddAll = async () => {
    const completedTasks = allTasks.filter(t => t.status === 'completed' && t.result_url && !t.result_url.includes('storage.googleapis.com'));
    if (completedTasks.length === 0) {
      alert('没有可添加的图片（需要先转存到 Supabase）');
      return;
    }
    const newUrls = completedTasks.map(t => t.result_url!);
    const taskIdsToDelete = completedTasks.filter(t => !t.isLocal).map(t => t.id);
    
    onUpdateImages([...images, ...newUrls]);
    showSuccess(`✓ 已添加 ${newUrls.length} 张图片`);
    
    // 删除已使用的任务
    setLocalTasks([]);
    for (const id of taskIdsToDelete) {
      try { await deleteTaskMutation.mutateAsync({ taskId: id, sku }); } catch {}
    }
  };

  // 删除任务
  const handleDeleteTask = async (task: LocalTask) => {
    if (task.isLocal) {
      setLocalTasks(prev => prev.filter(t => t.id !== task.id));
      showSuccess('✓ 已删除');
    } else {
      try {
        await deleteTaskMutation.mutateAsync({ taskId: task.id, sku });
        showSuccess('✓ 已删除');
      } catch (err) {
        console.error('[Delete] Failed:', err);
        showSuccess('❌ 删除失败');
      }
    }
  };

  // 重试任务
  const handleRetryTask = async (task: LocalTask) => {
    showSuccess('⏳ 重新生成中...');
    
    if (task.isLocal) {
      setLocalTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, status: 'pending' as TaskStatus, error: null } : t
      ));
      try {
        await createTasksMutation.mutateAsync({
          sku,
          imageUrls: [task.original_url],
          prompt: task.prompt,
          model: task.model as AIModelId,
          aspectRatio: task.aspect_ratio as AspectRatioId
        });
        setLocalTasks(prev => prev.filter(t => t.id !== task.id));
      } catch (err) {
        setLocalTasks(prev => prev.map(t => 
          t.id === task.id ? { ...t, status: 'failed' as TaskStatus, error: '重试失败' } : t
        ));
      }
    } else {
      try {
        await retryTaskMutation.mutateAsync({ taskId: task.id, sku });
      } catch (err) {
        showSuccess('❌ 重试失败');
      }
    }
  };

  // 清理所有任务
  const handleClearAll = async () => {
    if (!confirm(`确定要删除全部 ${allTasks.length} 个任务吗？`)) return;
    
    setLocalTasks([]);
    showSuccess(`✓ 已删除 ${allTasks.length} 个任务`);
    
    try {
      await clearTasksMutation.mutateAsync(sku);
    } catch (err) {
      console.error('Failed to clear tasks:', err);
      refetchTasks();
    }
  };

  // 批量转存 GCS 图片
  const handleTransferAll = () => {
    transferAll(sku);
  };

  // 单个转存
  const handleTransferSingle = (task: LocalTask) => {
    if (task.isLocal || !task.result_url?.includes('storage.googleapis.com')) return;
    transferSingleMutation.mutate({ taskId: task.id, sku });
  };

  // 获取状态图标
  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-gray-400" />;
      case 'processing': return <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  // 获取状态文本
  const getStatusText = (status: TaskStatus) => {
    switch (status) {
      case 'pending': return '排队中';
      case 'processing': return '处理中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
    }
  };

  const selectedModelInfo = SUPPORTED_MODELS.find(m => m.id === selectedModel);
  const selectedRatioInfo = SUPPORTED_ASPECT_RATIOS.find(r => r.id === selectedAspectRatio);
  
  const pendingCount = allTasks.filter(t => t.status === 'pending' || t.status === 'processing').length;
  const completedCount = allTasks.filter(t => t.status === 'completed').length;
  const gcsTasksCount = allTasks.filter(t => 
    t.status === 'completed' && 
    t.result_url?.includes('storage.googleapis.com')
  ).length;

  const loading = isLoadingSettings || isLoadingTemplates;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl p-8">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-xl">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">AI 图片处理</h2>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>{sku}</span>
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1 text-purple-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {pendingCount} 处理中
                  </span>
                )}
                {completedCount > 0 && (
                  <span className="text-green-600">{completedCount} 已完成</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {allTasks.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                全部删除
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 提示信息 */}
        {pendingCount > 0 && (
          <div className="px-4 sm:px-6 py-2 bg-purple-50 border-b border-purple-100 flex items-center gap-2 text-sm text-purple-700">
            <AlertCircle className="w-4 h-4" />
            任务处理中，完成后需<strong>手动审核</strong>并点击替换，可关闭窗口
          </div>
        )}

        {/* GCS 转存提示 */}
        {gcsTasksCount > 0 && !isTransferring && (
          <div className="px-4 sm:px-6 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="w-4 h-4" />
              {gcsTasksCount} 张图片需要转存到 Supabase（WooCommerce 兼容）
            </div>
            <button
              onClick={handleTransferAll}
              className="px-3 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-xs font-medium"
            >
              一键转存
            </button>
          </div>
        )}

        {/* 转存进度 */}
        {isTransferring && transferProgress && (
          <div className="px-4 sm:px-6 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-3 text-sm text-blue-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            转存中... {transferProgress.current} / {transferProgress.total}
            <div className="flex-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(transferProgress.current / transferProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 成功提示 */}
        {successMessage && (
          <div className="px-4 sm:px-6 py-3 bg-green-50 border-b border-green-100 flex items-center gap-2 text-sm text-green-700 font-medium animate-pulse">
            <CheckCircle className="w-4 h-4" />
            {successMessage}
          </div>
        )}

        {/* 主体内容 */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {/* 左侧：配置面板 */}
          <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
            {/* 模型选择 */}
            <div className="relative mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">AI 模型</label>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-left flex items-center justify-between hover:border-gray-300 transition-colors text-sm"
              >
                <span className="font-medium text-gray-900 truncate">{selectedModelInfo?.name}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${showModelDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showModelDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {SUPPORTED_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => { setSelectedModel(model.id); setShowModelDropdown(false); }}
                      className={`w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors text-sm ${selectedModel === model.id ? 'bg-purple-50' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{model.name}</span>
                        {selectedModel === model.id && <Check className="w-4 h-4 text-purple-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 宽高比选择 */}
            <div className="relative mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">输出宽高比</label>
              <button
                onClick={() => setShowRatioDropdown(!showRatioDropdown)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-left flex items-center justify-between hover:border-gray-300 transition-colors text-sm"
              >
                <span className="font-medium text-gray-900">{selectedRatioInfo?.name}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showRatioDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showRatioDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {SUPPORTED_ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio.id}
                      onClick={() => { setSelectedAspectRatio(ratio.id); setShowRatioDropdown(false); }}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors text-sm flex items-center justify-between ${selectedAspectRatio === ratio.id ? 'bg-purple-50' : ''}`}
                    >
                      <span className="font-medium text-gray-900">{ratio.name}</span>
                      {selectedAspectRatio === ratio.id && <Check className="w-4 h-4 text-purple-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Prompt 选择 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Prompt</label>
                <button
                  onClick={() => setUseCustomPrompt(!useCustomPrompt)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${useCustomPrompt ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {useCustomPrompt ? '使用模板' : '自定义'}
                </button>
              </div>

              {useCustomPrompt ? (
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="输入自定义 Prompt..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"
                />
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all text-sm ${selectedTemplateId === template.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{template.name}</span>
                        {selectedTemplateId === template.id && <Check className="w-4 h-4 text-purple-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 图片选择区域 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">选择图片</label>
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-purple-600 hover:text-purple-700"
                >
                  {selectedIndices.size === images.length ? '取消全选' : '全选'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => toggleSelection(index)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedIndices.has(index) ? 'border-purple-500 shadow-md' : 'border-gray-200'}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${selectedIndices.has(index) ? 'bg-purple-500/20' : 'bg-black/0 hover:bg-black/10'}`}>
                      {selectedIndices.has(index) && <Check className="w-5 h-5 text-white drop-shadow-lg" />}
                    </div>
                    <div className="absolute top-1 left-1 w-5 h-5 bg-black/60 rounded text-white text-xs flex items-center justify-center">
                      {index + 1}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 提交任务按钮 */}
            <button
              onClick={handleSubmitTasks}
              disabled={selectedIndices.size === 0 || (!useCustomPrompt && !selectedTemplateId) || (useCustomPrompt && !customPrompt.trim())}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              <Sparkles className="w-4 h-4" />
              开始处理 {selectedIndices.size} 张图片
            </button>

            {/* 批量操作按钮 */}
            {completedCount > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={handleApplyAll}
                  className="py-2 px-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors flex items-center justify-center gap-1.5 text-sm"
                >
                  <Replace className="w-4 h-4" />
                  全部替换
                </button>
                <button
                  onClick={handleAddAll}
                  className="py-2 px-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center gap-1.5 text-sm"
                >
                  <ImagePlus className="w-4 h-4" />
                  全部添加
                </button>
              </div>
            )}
          </div>

          {/* 右侧：任务列表 */}
          <div className="flex-1 p-4 overflow-y-auto min-h-0">
            {allTasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Sparkles className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">选择图片并开始处理</p>
                <p className="text-xs mt-1">任务会在后台自动执行</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`bg-gray-50 rounded-xl overflow-hidden border transition-all ${
                      task.status === 'completed' ? 'border-green-200' :
                      task.status === 'failed' ? 'border-red-200' :
                      task.status === 'processing' ? 'border-purple-200' :
                      'border-gray-200'
                    } ${task.isLocal ? 'opacity-90' : ''}`}
                  >
                    {/* 任务头部 */}
                    <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        <span className="text-sm font-medium text-gray-700">{getStatusText(task.status)}</span>
                        {task.processing_time && (
                          <span className="text-xs text-gray-400">{task.processing_time.toFixed(1)}s</span>
                        )}
                        {task.isLocal && (
                          <span className="text-xs text-purple-500">提交中...</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {/* 重新生成按钮 - 仅在完成且有结果时显示 */}
                        {task.status === 'completed' && task.result_url && !task.result_url.includes('storage.googleapis.com') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRetryTask(task); }}
                            className="p-1 text-gray-400 hover:text-purple-500 rounded transition-colors"
                            title="重新生成"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTask(task)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 对比图 */}
                    <div
                      className="relative cursor-pointer"
                      onClick={() => { setZoomedTask(task); setZoomView('compare'); }}
                    >
                      <div className="flex p-3 gap-2">
                        {/* 原图 */}
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 text-center mb-1">原图</div>
                          <div className="aspect-square bg-white rounded-lg overflow-hidden border border-gray-200">
                            <img src={task.original_url} alt="" className="w-full h-full object-contain" />
                          </div>
                        </div>
                        {/* 结果 */}
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 text-center mb-1">结果</div>
                          <div className="aspect-square bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center">
                            {task.status === 'processing' || task.status === 'pending' ? (
                              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                            ) : task.result_url ? (
                              <img src={task.result_url} alt="" className="w-full h-full object-contain" />
                            ) : task.error ? (
                              <div className="text-center p-2">
                                <XCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
                                <div className="text-xs text-red-500 line-clamp-2">{task.error}</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="absolute bottom-4 right-4 p-1.5 bg-black/50 rounded-lg text-white opacity-0 hover:opacity-100 transition-opacity">
                        <ZoomIn className="w-4 h-4" />
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    {task.status === 'completed' && task.result_url && (
                      <div className="flex flex-col gap-1.5 p-2 bg-white border-t border-gray-100">
                        {/* GCS URL 需要先转存 */}
                        {task.result_url.includes('storage.googleapis.com') ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleTransferSingle(task); }}
                            className="w-full py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            转存到 Supabase
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleApplySingle(task); }}
                              className="flex-1 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center justify-center gap-1"
                            >
                              <Replace className="w-3 h-3" />
                              替换
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddSingle(task); }}
                              className="flex-1 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-1"
                            >
                              <ImagePlus className="w-3 h-3" />
                              添加
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {task.status === 'failed' && (
                      <div className="flex gap-2 p-2 bg-white border-t border-gray-100">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRetryTask(task); }}
                          className="flex-1 py-1.5 text-xs bg-gray-500 text-white rounded-lg hover:bg-gray-600 flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          重试
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 放大查看弹窗 */}
      {zoomedTask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setZoomedTask(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold">图片对比</h3>
                <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                  <button
                    onClick={() => setZoomView('original')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${zoomView === 'original' ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    原图
                  </button>
                  <button
                    onClick={() => setZoomView('compare')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${zoomView === 'compare' ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    对比
                  </button>
                  <button
                    onClick={() => setZoomView('result')}
                    disabled={!zoomedTask.result_url}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50 ${zoomView === 'result' ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    结果
                  </button>
                </div>
              </div>
              <button onClick={() => setZoomedTask(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-gray-50">
              {zoomView === 'compare' ? (
                <div className="flex gap-6 h-full">
                  <div className="flex-1 flex flex-col">
                    <div className="text-sm font-medium text-gray-500 mb-2 text-center">原图</div>
                    <div className="flex-1 bg-white rounded-xl border border-gray-200 flex items-center justify-center p-4 min-h-[400px]">
                      <img src={zoomedTask.original_url} alt="" className="max-w-full max-h-full object-contain" />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="text-sm font-medium text-gray-500 mb-2 text-center">处理结果</div>
                    <div className="flex-1 bg-white rounded-xl border border-gray-200 flex items-center justify-center p-4 min-h-[400px]">
                      {zoomedTask.result_url ? (
                        <img src={zoomedTask.result_url} alt="" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <div className="text-gray-400">暂无结果</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[500px]">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <img
                      src={zoomView === 'original' ? zoomedTask.original_url : (zoomedTask.result_url || '')}
                      alt=""
                      className="max-w-full max-h-[60vh] object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
