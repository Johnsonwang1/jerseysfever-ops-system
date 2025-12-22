/**
 * 广告图设计页面
 * 支持新建和编辑已有广告创作
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Palette, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AIChatPanel } from '@/components/ad-creative/AIChatPanel';
import { ProductContextBar } from '@/components/ad-creative/ProductContextBar';
import { SiteExportDialog } from '@/components/ad-creative/SiteExportDialog';
import { ProductSelector } from '@/components/ad-creative/ProductSelector';
import { useProduct } from '@/hooks/useProducts';
import { useAdCreative, useSaveAdCreative } from '@/hooks/useAdCreatives';
import type { AdAspectRatio, AdProductContext } from '@/lib/ad-creative/types';

export function AdCreativePage() {
  const { id, sku } = useParams<{ id?: string; sku?: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id && id !== 'new';

  // 加载已有创作（编辑模式）
  const { data: existingCreative } = useAdCreative(isEditMode ? id : null);

  // 如果有 SKU 参数，加载商品数据
  const { data: product } = useProduct(sku || null);

  // 保存 mutation
  const saveMutation = useSaveAdCreative();

  // 编辑器状态
  const [aspectRatio, setAspectRatio] = useState<AdAspectRatio>('1:1');
  const [confirmedImageUrl, setConfirmedImageUrl] = useState<string | null>(null);
  const [showSiteExportDialog, setShowSiteExportDialog] = useState(false);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [currentCreativeId, setCurrentCreativeId] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string>('');
  const [lastModel, setLastModel] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<'draft' | 'complete' | null>(null);

  // 当前选中的商品上下文（支持多商品）
  const [productContexts, setProductContexts] = useState<AdProductContext[]>([]);

  // 加载已有创作数据
  useEffect(() => {
    if (existingCreative) {
      setAspectRatio(existingCreative.aspect_ratio);
      setConfirmedImageUrl(existingCreative.image_url);
      setCurrentCreativeId(existingCreative.id);
      if (existingCreative.prompt) setLastPrompt(existingCreative.prompt);
      if (existingCreative.model) setLastModel(existingCreative.model);
      // TODO: 加载关联的商品信息
    }
  }, [existingCreative]);

  // 当 URL 参数的商品加载完成后，设置商品上下文
  useEffect(() => {
    if (product) {
      setProductContexts([{
        sku: product.sku,
        name: product.name,
        images: product.images || [],
        prices: product.prices || {},
        regular_prices: product.regular_prices,
        attributes: product.attributes,
      }]);
    }
  }, [product]);

  // 尺寸变更回调
  const handleAspectRatioChange = useCallback((ratio: AdAspectRatio) => {
    setAspectRatio(ratio);
  }, []);

  // 处理 AI 生成的图片选择（继续修改）
  const handleAIImageSelect = useCallback((_imageUrl: string) => {
    // 选择图片后，在 AIChatPanel 内部处理（设置为迭代修改的基础图）
  }, []);

  // 保存草稿
  const handleSaveDraft = useCallback(async (imageUrl: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/92fbfe0c-e455-47e3-a678-8da60b30f029',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdCreativePage.tsx:handleSaveDraft:entry',message:'handleSaveDraft called',data:{imageUrlPreview:imageUrl?.slice(0,100),isUrl:imageUrl?.startsWith('http'),hasCurrentCreativeId:!!currentCreativeId,aspectRatio},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const firstProduct = productContexts[0];
    try {
      const result = await saveMutation.mutateAsync({
        id: currentCreativeId || undefined,
        name: firstProduct ? `${firstProduct.name} 广告图` : '广告图',
        sku: firstProduct?.sku || null,
        aspect_ratio: aspectRatio,
        image_url: imageUrl,
        prompt: lastPrompt || null,
        model: lastModel || null,
        status: 'draft',
      });
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/92fbfe0c-e455-47e3-a678-8da60b30f029',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdCreativePage.tsx:handleSaveDraft:success',message:'Draft saved successfully',data:{resultId:result.id,resultImageUrl:result.image_url?.slice(0,100)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      setCurrentCreativeId(result.id);
      setConfirmedImageUrl(imageUrl);
      setSaveSuccess('draft');
      setTimeout(() => setSaveSuccess(null), 2000);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/92fbfe0c-e455-47e3-a678-8da60b30f029',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdCreativePage.tsx:handleSaveDraft:error',message:'Draft save failed',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      throw err;
    }
  }, [productContexts, aspectRatio, lastPrompt, lastModel, currentCreativeId, saveMutation]);

  // 确认完成
  const handleConfirmComplete = useCallback(async (imageUrl: string) => {
    const firstProduct = productContexts[0];
    const result = await saveMutation.mutateAsync({
      id: currentCreativeId || undefined,
      name: firstProduct ? `${firstProduct.name} 广告图` : '广告图',
      sku: firstProduct?.sku || null,
      aspect_ratio: aspectRatio,
      image_url: imageUrl,
      prompt: lastPrompt || null,
      model: lastModel || null,
      status: 'completed',
    });

    setCurrentCreativeId(result.id);
    setConfirmedImageUrl(imageUrl);
    setSaveSuccess('complete');
    setTimeout(() => setSaveSuccess(null), 2000);
  }, [productContexts, aspectRatio, lastPrompt, lastModel, currentCreativeId, saveMutation]);

  // 打开多站点导出
  const handleSiteExport = useCallback((imageUrl: string) => {
    setConfirmedImageUrl(imageUrl);
    setShowSiteExportDialog(true);
  }, []);

  // 选择商品（支持多选）
  const handleSelectProducts = useCallback((products: AdProductContext[]) => {
    setProductContexts(products);
    setShowProductSelector(false);
  }, []);

  // 移除单个商品
  const handleRemoveProduct = useCallback((sku: string) => {
    setProductContexts(prev => prev.filter(p => p.sku !== sku));
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-100">
      {/* 顶部工具栏 */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/ad-creative')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-purple-600" />
            <h1 className="text-lg font-semibold text-gray-900">
              {isEditMode ? '编辑广告图' : '新建广告图'}
            </h1>
          </div>
        </div>

        {/* 保存成功提示 */}
        {saveSuccess && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">
              {saveSuccess === 'draft' ? '已保存草稿' : '已标记完成'}
            </span>
          </div>
        )}
      </header>

      {/* 商品上下文条 */}
      <ProductContextBar
        products={productContexts}
        onChangeProducts={() => setShowProductSelector(true)}
        onRemoveProduct={handleRemoveProduct}
      />

      {/* 主编辑区域 - 两栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：预览区域 */}
        <div className="flex-1 flex items-center justify-center bg-gray-50 p-8">
          {confirmedImageUrl ? (
            <div className="relative max-w-2xl w-full">
              <img
                src={confirmedImageUrl}
                alt="Confirmed"
                className="w-full h-auto rounded-lg shadow-xl"
              />
              <div className="absolute bottom-4 right-4">
                <button
                  onClick={() => setShowSiteExportDialog(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg shadow-lg hover:bg-purple-700 transition-colors"
                >
                  生成多站点版本
                </button>
              </div>
              {/* 状态标签 */}
              {currentCreativeId && existingCreative && (
                <div className="absolute top-4 left-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    existingCreative.status === 'completed'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {existingCreative.status === 'completed' ? '已完成' : '草稿'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <Palette className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">在右侧对话框生成广告图</p>
              <p className="text-sm mt-2">生成后可保存为草稿或标记完成</p>
            </div>
          )}
        </div>

        {/* 右侧：AI 对话面板 */}
        <div className="w-[420px] border-l border-gray-200 flex-shrink-0">
          <AIChatPanel
            products={productContexts}
            aspectRatio={aspectRatio}
            onAspectRatioChange={handleAspectRatioChange}
            onImageSelect={handleAIImageSelect}
            onSaveDraft={handleSaveDraft}
            onConfirmComplete={handleConfirmComplete}
            onSiteExport={handleSiteExport}
          />
        </div>
      </div>

      {/* 多站点导出对话框 */}
      {showSiteExportDialog && confirmedImageUrl && (
        <SiteExportDialog
          imageUrl={confirmedImageUrl}
          productContext={productContexts[0] || null}
          aspectRatio={aspectRatio}
          onClose={() => setShowSiteExportDialog(false)}
        />
      )}

      {/* 商品选择器 */}
      {showProductSelector && (
        <ProductSelector
          currentSkus={productContexts.map(p => p.sku)}
          multiSelect={true}
          onSelect={handleSelectProducts}
          onClose={() => setShowProductSelector(false)}
        />
      )}
    </div>
  );
}
