import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Save, Upload, Loader2, CheckCircle, XCircle, Clock, ExternalLink, Package, AlertCircle, Image, Edit2, Check, Palette, Video } from 'lucide-react';
import type { SiteKey } from '../lib/types';
import type { LocalProduct } from '../lib/products';
import { updateProductDetails } from '../lib/products';
import { syncProductToSites, type SyncResult, type SyncOptions } from '../lib/sync-api';
import { MediaGallery } from './MediaGallery';
import { SitePriceEditor } from './SitePriceEditor';
import { SiteContentEditor } from './SiteContentEditor';
import { SITES } from '../lib/attributes';
import { startSync, endSync } from './SyncToast';
import { CategorySelector } from './products/CategorySelector';
import { ATTRIBUTE_OPTIONS } from '../lib/attributes';
import { useAllCategories } from '../hooks/useProducts';

interface ProductDetailModalProps {
  product: LocalProduct;
  onClose: () => void;
  onSaved?: (product: LocalProduct) => void;
}

type TabKey = 'basic' | 'prices' | 'content' | 'sync';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'basic', label: '基础信息' },
  { key: 'prices', label: '各站点价格' },
  { key: 'content', label: '各站点资料' },
  { key: 'sync', label: '同步状态' },
];

const SITE_URLS: Record<SiteKey, string> = {
  com: 'https://jerseysfever.com',
  uk: 'https://jerseysfever.uk',
  de: 'https://jerseysfever.de',
  fr: 'https://jerseysfever.fr',
};

export function ProductDetailModal({ product, onClose, onSaved }: ProductDetailModalProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, _setIsSyncing] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [selectedSites, setSelectedSites] = useState<SiteKey[]>([]);
  const [syncImages, setSyncImages] = useState(true);  // 是否同步图片（默认同步）
  const [syncVideo, setSyncVideo] = useState(true);   // 是否同步视频（默认同步）
  const [syncResults, _setSyncResults] = useState<SyncResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 计算初始原价：如果没有原价或原价<=现价，则设为现价的2倍
  const getInitialRegularPrices = () => {
    const prices = product.prices || {};
    const regularPrices = product.regular_prices || {};
    const result: Partial<Record<SiteKey, number>> = { ...regularPrices };
    
    (Object.keys(prices) as SiteKey[]).forEach((site) => {
      const salePrice = prices[site];
      const regularPrice = regularPrices[site];
      // 如果没有原价或原价<=现价，自动设为现价的2倍
      if (salePrice && (!regularPrice || regularPrice <= salePrice)) {
        result[site] = Math.round(salePrice * 2 * 100) / 100;
      }
    });
    
    return result;
  };

  // 编辑状态 - 使用新的 JSONB 结构
  const [editData, setEditData] = useState({
    name: product.name,
    images: product.images || [],
    video_url: product.video_url || '',
    categories: product.categories || [],
    attributes: product.attributes || {},
    prices: product.prices || {},
    regular_prices: getInitialRegularPrices(),
    stock_quantities: product.stock_quantities || {},
    stock_statuses: product.stock_statuses || {},
    statuses: product.statuses || {},
    content: product.content || {},
  });

  // 分类编辑状态
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const { data: allCategories = [] } = useAllCategories();
  const [categoryMode, setCategoryMode] = useState<'and' | 'or'>('or');

  // 属性编辑状态
  const [isEditingAttributes, setIsEditingAttributes] = useState(false);

  // 图片链接复制状态
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);


  // 检查是否有修改
  const hasChanges = JSON.stringify({
    name: product.name,
    images: product.images,
    video_url: product.video_url || '',
    categories: product.categories,
    attributes: product.attributes,
    prices: product.prices,
    regular_prices: product.regular_prices,
    stock_quantities: product.stock_quantities,
    stock_statuses: product.stock_statuses,
    statuses: product.statuses,
    content: product.content,
  }) !== JSON.stringify(editData);

  // 初始化选中的站点（只选择已发布的）
  useEffect(() => {
    const publishedSites = (Object.entries(product.woo_ids || {}) as [SiteKey, number][])
      .filter(([_, id]) => id != null)
      .map(([site]) => site);
    setSelectedSites(publishedSites);
  }, [product.woo_ids]);

  // 保存到本地
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateProductDetails(product.sku, editData);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 同步到站点（异步执行，立即关闭窗口）
  // 分批同步避免超时：每批最多 2 个站点
  const handleSync = async () => {
    if (selectedSites.length === 0) return;

    try {
      // 先保存本地更改
      const updated = await updateProductDetails(product.sku, editData);
      
      // 通知父组件
      onSaved?.(updated);
      
      // 开始同步（显示转圈）
      startSync();
      
      // 立即关闭窗口
      onClose();
      
      // 分批同步：每批最多 2 个站点（避免超时）
      const BATCH_SIZE = 2;
      const sitesToSync = [...selectedSites];
      const syncOptions: SyncOptions = { syncImages, syncVideo };
      const allResults: SyncResult[] = [];
      
      // 将站点分批
      const batches: SiteKey[][] = [];
      for (let i = 0; i < sitesToSync.length; i += BATCH_SIZE) {
        batches.push(sitesToSync.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`🚀 分 ${batches.length} 批同步到 ${sitesToSync.length} 个站点`);
      
      // 串行执行每批（避免并行超时）
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`📦 第 ${i + 1}/${batches.length} 批: ${batch.join(', ')}`);
        
        try {
          const results = await syncProductToSites(updated.sku, batch, syncOptions);
          allResults.push(...results);
        } catch (err) {
          console.error(`第 ${i + 1} 批同步失败:`, err);
          // 添加失败结果
          batch.forEach(site => {
            allResults.push({
              site,
              success: false,
              error: err instanceof Error ? err.message : '同步超时',
            });
          });
        }
      }
      
      const successCount = allResults.filter(r => r.success).length;
      const failCount = allResults.length - successCount;
      const failedResults = allResults.filter(r => !r.success);
      
      // 结束同步（显示结果 + 具体错误）
      if (failCount === 0) {
        endSync(true, '同步成功');
      } else if (successCount === 0) {
        // 全部失败 - 显示详细错误
        const errorDetails = failedResults.map(r => `${r.site}: ${r.error}`).join('\n');
        console.error('❌ 同步失败详情:\n', errorDetails);
        endSync(false, `同步失败: ${failedResults[0]?.error || '未知错误'}`);
      } else {
        // 部分失败 - 显示哪些站点失败了
        const failedSites = failedResults.map(r => r.site).join(', ');
        const firstError = failedResults[0]?.error || '未知错误';
        console.warn(`⚠️ 部分失败 (${failedSites}): ${firstError}`);
        endSync(true, `${successCount}/${allResults.length} 成功，${failedSites} 失败: ${firstError}`);
      }
      
      console.log(`✅ 同步完成: ${successCount} 成功, ${failCount} 失败`);
        
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      endSync(false, err instanceof Error ? err.message : '同步出错');
    }
  };

  // 更新某个站点的状态/库存
  const updateSiteData = (site: SiteKey, field: 'statuses' | 'stock_quantities' | 'stock_statuses', value: string | number) => {
    setEditData(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        [site]: value,
      },
    }));
  };

  // 复制图片链接
  const handleCopyImageLink = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 渲染基础信息 Tab
  const renderBasicTab = () => (
    <div className="space-y-6">
      {/* SKU（只读）*/}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">SKU</label>
        <input
          type="text"
          value={product.sku}
          disabled
          className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-500"
        />
      </div>

      {/* 商品名称 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">商品名称（主站）</label>
        <input
          type="text"
          value={editData.name}
          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
          className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* 各站点状态和库存 */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">各站点状态与库存</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SITES.map((site) => {
            const siteStatus = editData.statuses[site.key] || 'publish';
            const siteStockQty = editData.stock_quantities[site.key] ?? 100;
            const siteStockStatus = editData.stock_statuses[site.key] || 'instock';
            const hasWooId = !!product.woo_ids?.[site.key];

            return (
              <div 
                key={site.key} 
                className={`p-3 border rounded-lg ${hasWooId ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{site.flag}</span>
                  <span className="text-sm font-medium">{site.name}</span>
                  {!hasWooId && <span className="text-xs text-gray-400">(未发布)</span>}
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  <select
                    value={siteStatus}
                    onChange={(e) => updateSiteData(site.key, 'statuses', e.target.value)}
                    disabled={!hasWooId}
                    className="text-xs px-1.5 sm:px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
                    title="发布状态"
                  >
                    <option value="publish">已发布</option>
                    <option value="draft">草稿</option>
                  </select>
                  <select
                    value={siteStockStatus}
                    onChange={(e) => updateSiteData(site.key, 'stock_statuses', e.target.value)}
                    disabled={!hasWooId}
                    className="text-xs px-1.5 sm:px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
                    title="库存状态"
                  >
                    <option value="instock">有库存</option>
                    <option value="outofstock">缺货</option>
                  </select>
                  <input
                    type="number"
                    value={siteStockQty}
                    onChange={(e) => updateSiteData(site.key, 'stock_quantities', parseInt(e.target.value) || 0)}
                    disabled={!hasWooId}
                    min="0"
                    className="text-xs px-1.5 sm:px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100 w-full"
                    title="库存数量"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 属性编辑 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">商品属性</label>
          <button
            onClick={() => setIsEditingAttributes(!isEditingAttributes)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            {isEditingAttributes ? (
              <>
                <Check className="w-3.5 h-3.5" />
                完成
              </>
            ) : (
              <>
                <Edit2 className="w-3.5 h-3.5" />
                编辑
              </>
            )}
          </button>
        </div>

        {isEditingAttributes ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 赛季 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">赛季</label>
                <select
                  value={editData.attributes?.season || ''}
                  onChange={(e) => setEditData({
                    ...editData,
                    attributes: { ...editData.attributes, season: e.target.value || undefined }
                  })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">-- 选择赛季 --</option>
                  {ATTRIBUTE_OPTIONS.season.map((season) => (
                    <option key={season} value={season}>{season}</option>
                  ))}
                </select>
              </div>

              {/* 类型 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">类型</label>
                <select
                  value={editData.attributes?.type || ''}
                  onChange={(e) => setEditData({
                    ...editData,
                    attributes: { ...editData.attributes, type: e.target.value || undefined }
                  })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">-- 选择类型 --</option>
                  {ATTRIBUTE_OPTIONS.type.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* 版本 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">版本</label>
                <select
                  value={editData.attributes?.version || ''}
                  onChange={(e) => setEditData({
                    ...editData,
                    attributes: { ...editData.attributes, version: e.target.value || undefined }
                  })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">-- 选择版本 --</option>
                  {ATTRIBUTE_OPTIONS.version.map((version) => (
                    <option key={version} value={version}>{version}</option>
                  ))}
                </select>
              </div>

              {/* 性别 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">性别</label>
                <select
                  value={editData.attributes?.gender || ''}
                  onChange={(e) => setEditData({
                    ...editData,
                    attributes: { ...editData.attributes, gender: e.target.value || undefined }
                  })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">-- 选择性别 --</option>
                  {ATTRIBUTE_OPTIONS.gender.map((gender) => (
                    <option key={gender} value={gender}>{gender}</option>
                  ))}
                </select>
              </div>

              {/* 袖长 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">袖长</label>
                <select
                  value={editData.attributes?.sleeve || ''}
                  onChange={(e) => setEditData({
                    ...editData,
                    attributes: { ...editData.attributes, sleeve: e.target.value || undefined }
                  })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">-- 选择袖长 --</option>
                  {ATTRIBUTE_OPTIONS.sleeve.map((sleeve) => (
                    <option key={sleeve} value={sleeve}>{sleeve}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 事件（多选） */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">事件</label>
              <div className="flex flex-wrap gap-2">
                {ATTRIBUTE_OPTIONS.event.map((event) => {
                  const isSelected = editData.attributes?.events?.includes(event) || false;
                  return (
                    <button
                      key={event}
                      type="button"
                      onClick={() => {
                        const currentEvents = editData.attributes?.events || [];
                        const newEvents = isSelected
                          ? currentEvents.filter(e => e !== event)
                          : [...currentEvents, event];
                        setEditData({
                          ...editData,
                          attributes: {
                            ...editData.attributes,
                            events: newEvents.length > 0 ? newEvents : undefined
                          }
                        });
                      }}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {event}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {editData.attributes?.season && (
              <span className="px-2.5 py-1 text-sm bg-blue-50 text-blue-700 rounded-lg">
                赛季: {editData.attributes.season}
              </span>
            )}
            {editData.attributes?.type && (
              <span className="px-2.5 py-1 text-sm bg-purple-50 text-purple-700 rounded-lg">
                类型: {editData.attributes.type}
              </span>
            )}
            {editData.attributes?.gender && (
              <span className="px-2.5 py-1 text-sm bg-pink-50 text-pink-700 rounded-lg">
                性别: {editData.attributes.gender}
              </span>
            )}
            {editData.attributes?.version && (
              <span className="px-2.5 py-1 text-sm bg-orange-50 text-orange-700 rounded-lg">
                版本: {editData.attributes.version}
              </span>
            )}
            {editData.attributes?.sleeve && (
              <span className="px-2.5 py-1 text-sm bg-green-50 text-green-700 rounded-lg">
                袖长: {editData.attributes.sleeve}
              </span>
            )}
            {editData.attributes?.events && editData.attributes.events.length > 0 && (
              <span className="px-2.5 py-1 text-sm bg-indigo-50 text-indigo-700 rounded-lg">
                事件: {editData.attributes.events.join(', ')}
              </span>
            )}
            {(!editData.attributes || Object.keys(editData.attributes).length === 0) && (
              <span className="text-sm text-gray-400">暂无属性</span>
            )}
          </div>
        )}
      </div>

      {/* 分类编辑 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">商品分类</label>
          <button
            onClick={() => setIsEditingCategories(!isEditingCategories)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            {isEditingCategories ? (
              <>
                <Check className="w-3.5 h-3.5" />
                完成
              </>
            ) : (
              <>
                <Edit2 className="w-3.5 h-3.5" />
                编辑
              </>
            )}
          </button>
        </div>
        
        {isEditingCategories ? (
          <CategorySelector
            categories={allCategories}
            value={editData.categories}
            mode={categoryMode}
            onChange={(categories, mode) => {
              setEditData({ ...editData, categories });
              setCategoryMode(mode);
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(editData.categories || []).map((cat, i) => (
              <span key={i} className="px-2.5 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg">
                {cat}
              </span>
            ))}
            {(!editData.categories || editData.categories.length === 0) && (
              <span className="text-sm text-gray-400">暂无分类</span>
            )}
          </div>
        )}
      </div>

    </div>
  );

  // 渲染同步状态 Tab
  const renderSyncTab = () => {
    const wooIds = product.woo_ids || {};
    const syncStatus = product.sync_status || {};
    const variations = product.variations || {};
    const variationCounts = product.variation_counts || {};

    // 检查变体 SKU 是否与父商品 SKU 匹配
    const checkVariationSkuMatch = (variationSku: string, parentSku: string): 'match' | 'mismatch' | 'empty' => {
      if (!variationSku) return 'empty';
      // 变体 SKU 应该以父 SKU 开头或包含父 SKU
      if (variationSku.startsWith(parentSku) || variationSku.includes(parentSku)) return 'match';
      return 'mismatch';
    };

    return (
      <div className="space-y-4">
        {/* 各站点状态 */}
        {SITES.map((site) => {
          const wooId = wooIds[site.key];
          const status = syncStatus[site.key];
          const sitePrice = product.prices?.[site.key];
          const siteStockQty = product.stock_quantities?.[site.key];
          const siteVariations = variations[site.key] || [];
          const variationCount = variationCounts[site.key] || 0;

          // 统计 SKU 匹配情况
          const skuStats = siteVariations.reduce((acc, v) => {
            const matchStatus = checkVariationSkuMatch(v.sku, product.sku);
            acc[matchStatus]++;
            return acc;
          }, { match: 0, mismatch: 0, empty: 0 });

          return (
            <div key={site.key} className="bg-gray-50 rounded-xl overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <span className="text-xl sm:text-2xl flex-shrink-0">{site.flag}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{site.name}</div>
                    <div className="text-xs sm:text-sm text-gray-500 break-words">
                      {wooId ? `ID: ${wooId}` : '未发布'}
                      {sitePrice !== undefined && ` · $${sitePrice}`}
                      {siteStockQty !== undefined && ` · 库存: ${siteStockQty}`}
                      {variationCount > 0 && ` · ${variationCount}个变体`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  {/* 状态徽章 */}
                  <div className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm whitespace-nowrap ${
                    status === 'synced' ? 'bg-green-100 text-green-700' :
                    status === 'error' ? 'bg-red-100 text-red-700' :
                    status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    status === 'deleted' ? 'bg-gray-100 text-gray-500' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {status === 'synced' && <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    {status === 'error' && <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    {status === 'pending' && <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    <span className="hidden sm:inline">
                      {status === 'synced' ? '已同步' :
                       status === 'error' ? '同步失败' :
                       status === 'pending' ? '待同步' :
                       status === 'deleted' ? '已删除' : '未发布'}
                    </span>
                  </div>

                  {/* 查看链接 */}
                  {wooId && (
                    <a
                      href={`${SITE_URLS[site.key]}/?p=${wooId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                      title="在站点查看"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>

              {/* 变体信息 */}
              {siteVariations.length > 0 && (
                <div className="border-t border-gray-200 px-3 sm:px-4 py-2 sm:py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600">变体 SKU 状态:</span>
                    {skuStats.match > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                        匹配: {skuStats.match}
                      </span>
                    )}
                    {skuStats.mismatch > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                        不匹配: {skuStats.mismatch}
                      </span>
                    )}
                    {skuStats.empty > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                        无SKU: {skuStats.empty}
                      </span>
                    )}
                  </div>
                  <div className="max-h-32 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left text-gray-600 font-medium">ID</th>
                          <th className="px-2 py-1 text-left text-gray-600 font-medium">SKU</th>
                          <th className="px-2 py-1 text-left text-gray-600 font-medium">尺码</th>
                          <th className="px-2 py-1 text-right text-gray-600 font-medium">库存</th>
                        </tr>
                      </thead>
                      <tbody>
                        {siteVariations.map((v) => {
                          const skuMatch = checkVariationSkuMatch(v.sku, product.sku);
                          const sizeAttr = v.attributes?.find((a: { name: string }) => a.name.toLowerCase() === 'size' || a.name === '尺码');
                          return (
                            <tr key={v.id} className="border-b border-gray-100 last:border-0">
                              <td className="px-2 py-1 text-gray-500">{v.id}</td>
                              <td className={`px-2 py-1 font-mono ${
                                skuMatch === 'match' ? 'text-green-600' :
                                skuMatch === 'mismatch' ? 'text-red-600 font-semibold' :
                                'text-gray-400 italic'
                              }`}>
                                {v.sku || '(无)'}
                              </td>
                              <td className="px-2 py-1 text-gray-700">
                                {sizeAttr?.option || v.attributes?.map((a: { option: string }) => a.option).join(', ') || '-'}
                              </td>
                              <td className="px-2 py-1 text-right">
                                <span className={v.stock_status === 'instock' ? 'text-green-600' : 'text-red-600'}>
                                  {v.stock_quantity ?? '-'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* 最后同步时间 */}
        {product.last_synced_at && (
          <div className="text-sm text-gray-500 text-center pt-4 border-t border-gray-200">
            最后同步时间: {new Date(product.last_synced_at).toLocaleString('zh-CN')}
          </div>
        )}
      </div>
    );
  };

  // 渲染同步结果
  const renderSyncResults = () => {
    if (!syncResults) return null;

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-xl space-y-2">
        <div className="text-sm font-medium text-gray-700 mb-2">同步结果</div>
        {syncResults.map((result) => (
          <div
            key={result.site}
            className={`flex items-center justify-between p-3 rounded-lg ${
              result.success ? 'bg-green-50' : 'bg-red-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{SITES.find(s => s.key === result.site)?.flag}</span>
              <span className="text-sm font-medium">
                {SITES.find(s => s.key === result.site)?.name}
              </span>
            </div>
            <div className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
              {result.success ? '同步成功' : result.error}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-t-2xl lg:rounded-2xl shadow-2xl w-full h-full lg:h-auto lg:max-w-5xl lg:max-h-[90vh] lg:mx-4 overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Package className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">商品详情</h2>
              <p className="text-xs sm:text-sm text-gray-500 truncate">{product.sku}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 生成广告图按钮 */}
            <button
              onClick={() => {
                onClose();
                navigate(`/ad-creative/${product.sku}`);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg transition-colors"
              title="生成广告图"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">广告图</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 主体内容 */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {/* 左侧/顶部 - 媒体区域 */}
          <div className="h-[280px] sm:h-[320px] lg:h-auto lg:w-2/5 p-3 sm:p-4 lg:p-6 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto flex-shrink-0">
            <MediaGallery
              images={editData.images}
              videoUrl={editData.video_url}
              onImagesChange={(images) => setEditData({ ...editData, images })}
              onVideoChange={(video_url) => setEditData({ ...editData, video_url: video_url || '' })}
              showLinks={true}
              onCopyLink={handleCopyImageLink}
              copiedIndex={copiedIndex}
              sku={product.sku}
            />
          </div>

          {/* 右侧/底部 - 信息区域 */}
          <div className="flex-1 lg:w-3/5 flex flex-col overflow-hidden min-h-0">
            {/* Tab 切换 */}
            <div className="flex gap-1 p-1.5 sm:p-2 bg-gray-50 border-b border-gray-200 overflow-x-auto flex-shrink-0">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-shrink-0 py-2 px-3 sm:px-4 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 内容 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {activeTab === 'basic' && renderBasicTab()}
              
              {activeTab === 'prices' && (
                <SitePriceEditor
                  prices={editData.prices}
                  regularPrices={editData.regular_prices}
                  onChange={(prices, regular_prices) => setEditData({ ...editData, prices, regular_prices })}
                  syncStatus={product.sync_status}
                />
              )}
              
              {activeTab === 'content' && (
                <SiteContentEditor
                  content={editData.content}
                  defaultName={editData.name}
                  onChange={(content) => setEditData({ ...editData, content })}
                  syncStatus={product.sync_status}
                />
              )}
              
              {activeTab === 'sync' && renderSyncTab()}

              {/* 同步结果显示 */}
              {renderSyncResults()}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex flex-col gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {!error && hasChanges && (
            <div className="text-xs sm:text-sm text-orange-600">
              有未保存的更改
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              关闭
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>保存</span>
            </button>

            <button
              onClick={() => setShowSyncDialog(true)}
              disabled={isSyncing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-sm bg-gray-900 text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">同步到站点</span>
              <span className="sm:hidden">同步</span>
            </button>
          </div>
        </div>

        {/* 同步站点选择弹窗 */}
        {showSyncDialog && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setShowSyncDialog(false)}
            />
            <div className="relative bg-white rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">选择同步站点</h3>
              
              <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                {SITES.map((site) => {
                  const wooId = product.woo_ids?.[site.key];
                  const isSelected = selectedSites.includes(site.key);
                  const isDisabled = !wooId;

                  return (
                    <label
                      key={site.key}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isDisabled
                          ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-50'
                          : isSelected
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSites([...selectedSites, site.key]);
                          } else {
                            setSelectedSites(selectedSites.filter(s => s !== site.key));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-xl">{site.flag}</span>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{site.name}</div>
                        <div className="text-xs text-gray-500">
                          {wooId ? `ID: ${wooId}` : '未发布，无法同步'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* 同步选项 */}
              <div className="mb-4 space-y-2">
                {/* 同步图片 */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncImages}
                      onChange={(e) => setSyncImages(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <Image className="w-4 h-4 text-gray-400" />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 text-sm">同步图片</div>
                      <div className="text-xs text-gray-500">
                        {syncImages ? '将清理旧图片并上传新图片（较慢，约3-5秒/站点）' : '跳过图片同步'}
                      </div>
                    </div>
                  </label>
                </div>
                {/* 同步视频 */}
                {editData.video_url && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncVideo}
                        onChange={(e) => setSyncVideo(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <Video className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 text-sm">同步视频</div>
                        <div className="text-xs text-gray-500">
                          {syncVideo ? '将视频 URL 同步到站点' : '跳过视频同步'}
                        </div>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  onClick={() => setShowSyncDialog(false)}
                  className="w-full sm:w-auto px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleSync}
                  disabled={selectedSites.length === 0}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 text-sm bg-gray-900 text-white hover:bg-gray-800 rounded-lg disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">{syncImages ? '完整同步' : '快速同步'} ({selectedSites.length} 站点)</span>
                  <span className="sm:hidden">{syncImages ? '完整同步' : '快速同步'}</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center">
                点击同步后窗口将关闭，后台自动执行
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
