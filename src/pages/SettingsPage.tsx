import { useState, useRef, useEffect } from 'react';
import { Settings, Sparkles, Plus, Pencil, Trash2, Save, X, Loader2, Check, GripVertical, ToggleLeft, ToggleRight, ImageIcon, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SUPPORTED_MODELS, SUPPORTED_ASPECT_RATIOS, type AIModelId, type AspectRatioId } from '../lib/ai-image';
import { type PromptTemplate } from '../lib/ai-prompts';
import { 
  useAISettings, 
  usePromptTemplates, 
  useUpdateAISettings, 
  useCreatePromptTemplate, 
  useUpdatePromptTemplate, 
  useDeletePromptTemplate,
  useTogglePromptTemplate,
  useReorderPromptTemplates
} from '../hooks/useSettings';
import { 
  getImageMigrationStats, 
  migrateImagesBatch, 
  type ImageMigrationStats,
  type MigrationResult 
} from '../lib/supabase';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export function SettingsPage() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-muted rounded-xl">
          <Settings className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">设置</h1>
          <p className="text-sm text-muted-foreground">管理系统配置和 AI 功能</p>
        </div>
      </div>

      {/* Tab 导航 */}
      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="w-4 h-4" />
            AI 配置
          </TabsTrigger>
          <TabsTrigger value="images" className="gap-2">
            <ImageIcon className="w-4 h-4" />
            图片迁移
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <AISettingsTab />
        </TabsContent>

        <TabsContent value="images">
          <ImageMigrationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// AI 配置 Tab 组件
function AISettingsTab() {
  // React Query hooks
  const { data: settings, isLoading: settingsLoading } = useAISettings();
  const { data: templates = [], isLoading: templatesLoading } = usePromptTemplates();
  const updateSettingsMutation = useUpdateAISettings();
  const createTemplateMutation = useCreatePromptTemplate();
  const updateTemplateMutation = useUpdatePromptTemplate();
  const deleteTemplateMutation = useDeletePromptTemplate();
  const toggleTemplateMutation = useTogglePromptTemplate();
  const reorderMutation = useReorderPromptTemplates();

  const loading = settingsLoading || templatesLoading;
  const saving = updateSettingsMutation.isPending || createTemplateMutation.isPending || 
                 updateTemplateMutation.isPending || deleteTemplateMutation.isPending ||
                 toggleTemplateMutation.isPending || reorderMutation.isPending;
  const [error, setError] = useState<string | null>(null);

  // 编辑模板状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrompt, setEditingPrompt] = useState('');

  // 新建模板状态
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  // 拖拽排序状态
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [localTemplates, setLocalTemplates] = useState<PromptTemplate[]>([]);
  const dragOverRef = useRef<string | null>(null);

  // 同步模板数据到本地状态
  if (templates.length > 0 && localTemplates.length === 0) {
    setLocalTemplates(templates);
  }
  if (templates.length > 0 && localTemplates.length > 0 && !saving) {
    const templatesChanged = templates.some((t, i) => 
      localTemplates[i]?.id !== t.id || localTemplates[i]?.sort_order !== t.sort_order
    ) || templates.length !== localTemplates.length;
    if (templatesChanged && !draggedId) {
      setLocalTemplates(templates);
    }
  }

  // 更新模型设置
  const handleModelChange = async (model: AIModelId) => {
    if (!settings) return;
    try {
      await updateSettingsMutation.mutateAsync({ defaultModel: model });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 更新宽高比设置
  const handleAspectRatioChange = async (ratio: AspectRatioId) => {
    if (!settings) return;
    try {
      await updateSettingsMutation.mutateAsync({ defaultAspectRatio: ratio });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 开始编辑模板
  const startEditing = (template: PromptTemplate) => {
    setEditingId(template.id);
    setEditingName(template.name);
    setEditingPrompt(template.prompt);
  };

  // 保存编辑
  const saveEditing = async () => {
    if (!editingId) return;
    try {
      await updateTemplateMutation.mutateAsync({
        id: editingId,
        data: { name: editingName, prompt: editingPrompt },
      });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 删除模板
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      await deleteTemplateMutation.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 创建新模板
  const handleCreate = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    try {
      await createTemplateMutation.mutateAsync({ name: newName, prompt: newPrompt });
      setIsCreating(false);
      setNewName('');
      setNewPrompt('');
      setLocalTemplates([]); // 重置本地状态以触发同步
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  // 切换启用状态
  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      // 乐观更新
      setLocalTemplates(prev => 
        prev.map(t => t.id === id ? { ...t, enabled: !currentEnabled } : t)
      );
      await toggleTemplateMutation.mutateAsync({ id, enabled: !currentEnabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败');
      setLocalTemplates(templates); // 回滚
    }
  };

  // 拖拽开始
  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  // 拖拽经过
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id && dragOverRef.current !== id) {
      dragOverRef.current = id;
      // 实时更新位置
      setLocalTemplates(prev => {
        const draggedIndex = prev.findIndex(t => t.id === draggedId);
        const targetIndex = prev.findIndex(t => t.id === id);
        if (draggedIndex === -1 || targetIndex === -1) return prev;
        
        const newList = [...prev];
        const [draggedItem] = newList.splice(draggedIndex, 1);
        newList.splice(targetIndex, 0, draggedItem);
        return newList;
      });
    }
  };

  // 拖拽结束
  const handleDragEnd = async () => {
    if (!draggedId) return;
    
    const orderedIds = localTemplates.map(t => t.id);
    setDraggedId(null);
    dragOverRef.current = null;

    try {
      await reorderMutation.mutateAsync(orderedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序失败');
      setLocalTemplates(templates); // 回滚
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              关闭
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 默认模型设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            默认 AI 模型
          </CardTitle>
          <CardDescription>
            选择默认使用的 AI 图像生成模型，可在使用时临时切换
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SUPPORTED_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => handleModelChange(model.id)}
                disabled={saving}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  settings?.defaultModel === model.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-border hover:border-muted-foreground/50 bg-background'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{model.name}</span>
                  {settings?.defaultModel === model.id && (
                    <Check className="w-5 h-5 text-purple-500" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{model.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 默认宽高比设置 */}
      <Card>
        <CardHeader>
          <CardTitle>默认宽高比</CardTitle>
          <CardDescription>
            选择默认的图片输出宽高比，可在使用时临时切换
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_ASPECT_RATIOS.map((ratio) => (
              <Button
                key={ratio.id}
                onClick={() => handleAspectRatioChange(ratio.id)}
                disabled={saving}
                variant={settings?.defaultAspectRatio === ratio.id ? 'default' : 'outline'}
                size="sm"
              >
                {ratio.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Prompt 模板管理 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Prompt 模板</CardTitle>
              <CardDescription className="mt-1">
                管理 AI 图片处理的 Prompt 模板，拖拽调整顺序
              </CardDescription>
            </div>
            <Button
              onClick={() => setIsCreating(true)}
              disabled={isCreating}
            >
              <Plus className="w-4 h-4 mr-2" />
              新建模板
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 新建模板表单 */}
          {isCreating && (
            <div className="p-4 bg-muted rounded-xl border">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">模板名称</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例如：产品细节-袖口"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Prompt 内容</label>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="输入 AI 图片处理的提示词..."
                    rows={4}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsCreating(false);
                      setNewName('');
                      setNewPrompt('');
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={saving || !newName.trim() || !newPrompt.trim()}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    保存
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 模板列表 */}
          <div className="space-y-3">
            {localTemplates.map((template) => (
              <div
                key={template.id}
                draggable={editingId !== template.id}
                onDragStart={() => handleDragStart(template.id)}
                onDragOver={(e) => handleDragOver(e, template.id)}
                onDragEnd={handleDragEnd}
                className={`p-4 rounded-xl border transition-all cursor-move ${
                  draggedId === template.id
                    ? 'opacity-50 border-purple-400 bg-purple-50'
                    : template.enabled
                      ? 'bg-background border-border hover:border-muted-foreground/50'
                      : 'bg-muted border-border opacity-60'
                }`}
              >
                {editingId === template.id ? (
                  // 编辑模式
                  <div className="space-y-3">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                    <textarea
                      value={editingPrompt}
                      onChange={(e) => setEditingPrompt(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        onClick={saveEditing}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // 显示模式
                  <div className="flex gap-3">
                    {/* 拖拽手柄 */}
                    <div className="flex-shrink-0 pt-0.5">
                      <GripVertical className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    
                    {/* 内容区域 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className={`font-medium ${template.enabled ? '' : 'text-muted-foreground'}`}>
                            {template.name}
                          </span>
                          {!template.enabled && (
                            <Badge variant="secondary">已禁用</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {/* 启用/禁用开关 */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggle(template.id, template.enabled)}
                            disabled={saving}
                            className={template.enabled ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground'}
                          >
                            {template.enabled ? (
                              <ToggleRight className="w-5 h-5" />
                            ) : (
                              <ToggleLeft className="w-5 h-5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(template)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(template.id)}
                            className="hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <p className={`text-sm line-clamp-2 ${template.enabled ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                        {template.prompt}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {localTemplates.length === 0 && !isCreating && (
              <div className="text-center py-8 text-muted-foreground">
                暂无模板，点击「新建模板」添加
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// 图片迁移 Tab 组件
function ImageMigrationTab() {
  const [stats, setStats] = useState<ImageMigrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<MigrationResult[]>([]);

  // 加载统计信息
  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getImageMigrationStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取统计信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  // 开始批量迁移
  const startMigration = async () => {
    if (migrating) return;
    
    try {
      setMigrating(true);
      setError(null);
      setResults([]);
      setProgress({ current: 0, total: stats?.productsNeedMigration || 0 });

      let offset = 0;
      const limit = 20; // 每批处理 20 个
      let hasMore = true;
      const allResults: MigrationResult[] = [];

      while (hasMore) {
        const result = await migrateImagesBatch(limit, offset);
        allResults.push(...result.results);
        setResults([...allResults]);
        setProgress({ 
          current: allResults.length, 
          total: stats?.productsNeedMigration || result.total 
        });
        
        hasMore = result.hasMore && result.results.length > 0;
        offset += limit;

        // 短暂暂停，避免过载
        if (hasMore) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // 迁移完成，刷新统计
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : '迁移失败');
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  const totalMigrated = results.reduce((sum, r) => sum + r.migrated, 0);

  return (
    <div className="space-y-6">
      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              关闭
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 统计卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-blue-500" />
                图片存储迁移
              </CardTitle>
              <CardDescription className="mt-1">
                将产品图片从 WooCommerce (.com) 迁移到 Supabase Storage
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadStats}
              disabled={loading || migrating}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-muted rounded-xl text-center">
                <div className="text-2xl font-bold">{stats.totalProducts}</div>
                <div className="text-sm text-muted-foreground">总产品数</div>
              </div>
              <div className="p-4 bg-muted rounded-xl text-center">
                <div className="text-2xl font-bold">{stats.totalImages}</div>
                <div className="text-sm text-muted-foreground">总图片数</div>
              </div>
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.imagesOnCom}</div>
                <div className="text-sm text-orange-600">待迁移图片</div>
              </div>
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center">
                <div className="text-2xl font-bold text-green-600">{stats.imagesOnStorage}</div>
                <div className="text-sm text-green-600">已在 Storage</div>
              </div>
            </div>
          )}

          {/* 迁移进度 */}
          {migrating && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700">迁移中...</span>
                <span className="text-sm text-blue-600">
                  {progress.current} / {progress.total} 产品
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* 迁移结果 */}
          {results.length > 0 && !migrating && (
            <div className="mb-6 p-4 bg-muted rounded-xl">
              <div className="flex items-center gap-4 mb-2">
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">{successCount} 成功</span>
                </div>
                {failedCount > 0 && (
                  <div className="flex items-center gap-1 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium">{failedCount} 失败</span>
                  </div>
                )}
                <div className="text-muted-foreground">
                  共迁移 {totalMigrated} 张图片
                </div>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-4">
            <Button
              onClick={startMigration}
              disabled={migrating || (stats?.productsNeedMigration ?? 0) === 0}
              className="gap-2"
            >
              {migrating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
              {migrating ? '迁移中...' : `开始迁移 (${stats?.productsNeedMigration ?? 0} 个产品)`}
            </Button>
            
            {(stats?.productsNeedMigration ?? 0) === 0 && (stats?.totalImages ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span>所有图片已迁移到 Storage</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 说明 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">迁移说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• 迁移会将 <code className="bg-muted px-1 py-0.5 rounded">jerseysfever.com</code> 上的图片转存到 Supabase Storage</p>
          <p>• 使用 MD5 哈希自动去重，相同图片不会重复存储</p>
          <p>• 迁移完成后，新发布的商品会自动使用 Storage 图片</p>
          <p>• 原有 WooCommerce 图片不受影响，可继续使用</p>
        </CardContent>
      </Card>
    </div>
  );
}
