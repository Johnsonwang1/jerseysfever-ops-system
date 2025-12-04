import { useState, useEffect } from 'react';
import { X, Save, Upload, Loader2, CheckCircle, XCircle, Clock, ExternalLink, Package, AlertCircle, Image, Edit2, Check } from 'lucide-react';
import type { SiteKey } from '../lib/types';
import type { LocalProduct } from '../lib/products';
import { updateProductDetails, getAllCategories } from '../lib/products';
import { syncProductToSites, type SyncResult, type SyncOptions } from '../lib/sync-api';
import { ImageGallery } from './ImageGallery';
import { SitePriceEditor } from './SitePriceEditor';
import { SiteContentEditor } from './SiteContentEditor';
import { SITES } from '../lib/attributes';
import { startSync, endSync } from './SyncToast';
import { CategorySelector } from './products/CategorySelector';

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
  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, _setIsSyncing] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [selectedSites, setSelectedSites] = useState<SiteKey[]>([]);
  const [syncImages, setSyncImages] = useState(false);  // 是否同步图片（默认不同步）
  const [syncResults, _setSyncResults] = useState<SyncResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 编辑状态 - 使用新的 JSONB 结构
  const [editData, setEditData] = useState({
    name: product.name,
    images: product.images || [],
    categories: product.categories || [],
    prices: product.prices || {},
    regular_prices: product.regular_prices || {},
    stock_quantities: product.stock_quantities || {},
    stock_statuses: product.stock_statuses || {},
    statuses: product.statuses || {},
    content: product.content || {},
  });

  // 分类编辑状态
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [allCategories, setAllCategories] = useState<{ id: number; name: string; parent: number }[]>([]);
  const [categoryMode, setCategoryMode] = useState<'and' | 'or'>('or');

  // 加载所有分类（用于选择器）
  useEffect(() => {
    getAllCategories().then(setAllCategories).catch(console.error);
  }, []);

  // 检查是否有修改
  const hasChanges = JSON.stringify({
    name: product.name,
    images: product.images,
    categories: product.categories,
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
      
      // 后台异步执行同步（不等待结果）
      // 使用 SKU 调用 Edge Function，而不是传递整个 product 对象
      const sitesToSync = [...selectedSites];
      const syncOptions: SyncOptions = { syncImages };
      syncProductToSites(updated.sku, sitesToSync, syncOptions)
        .then((results) => {
          const successCount = results.filter(r => r.success).length;
          const failCount = results.length - successCount;
          
          // 结束同步（显示结果）
          if (failCount === 0) {
            endSync(true, '同步成功');
          } else if (successCount === 0) {
            endSync(false, results[0]?.error || '同步失败');
          } else {
            endSync(true, `${successCount}/${results.length} 成功`);
          }
          
          console.log(`✅ 同步完成: ${successCount} 成功, ${failCount} 失败`);
        })
        .catch((err) => {
          console.error('同步出错:', err);
          endSync(false, err instanceof Error ? err.message : '同步出错');
        });
        
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
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
        <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={siteStatus}
                    onChange={(e) => updateSiteData(site.key, 'statuses', e.target.value)}
                    disabled={!hasWooId}
                    className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
                    title="发布状态"
                  >
                    <option value="publish">已发布</option>
                    <option value="draft">草稿</option>
                  </select>
                  <select
                    value={siteStockStatus}
                    onChange={(e) => updateSiteData(site.key, 'stock_statuses', e.target.value)}
                    disabled={!hasWooId}
                    className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
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
                    className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100 w-full"
                    title="库存数量"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 属性展示 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">商品属性</label>
        <div className="flex flex-wrap gap-2">
          {product.attributes?.team && (
            <span className="px-2.5 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg">
              球队: {product.attributes.team}
            </span>
          )}
          {product.attributes?.season && (
            <span className="px-2.5 py-1 text-sm bg-blue-50 text-blue-700 rounded-lg">
              赛季: {product.attributes.season}
            </span>
          )}
          {product.attributes?.type && (
            <span className="px-2.5 py-1 text-sm bg-purple-50 text-purple-700 rounded-lg">
              类型: {product.attributes.type}
            </span>
          )}
          {product.attributes?.gender && (
            <span className="px-2.5 py-1 text-sm bg-pink-50 text-pink-700 rounded-lg">
              性别: {product.attributes.gender}
            </span>
          )}
          {product.attributes?.version && (
            <span className="px-2.5 py-1 text-sm bg-orange-50 text-orange-700 rounded-lg">
              版本: {product.attributes.version}
            </span>
          )}
          {product.attributes?.sleeve && (
            <span className="px-2.5 py-1 text-sm bg-green-50 text-green-700 rounded-lg">
              袖长: {product.attributes.sleeve}
            </span>
          )}
        </div>
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

    return (
      <div className="space-y-4">
        {/* 各站点状态 */}
        {SITES.map((site) => {
          const wooId = wooIds[site.key];
          const status = syncStatus[site.key];
          const sitePrice = product.prices?.[site.key];
          const siteStockQty = product.stock_quantities?.[site.key];

          return (
            <div
              key={site.key}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{site.flag}</span>
                <div>
                  <div className="font-medium text-gray-900">{site.name}</div>
                  <div className="text-sm text-gray-500">
                    {wooId ? `ID: ${wooId}` : '未发布'}
                    {sitePrice !== undefined && ` · $${sitePrice}`}
                    {siteStockQty !== undefined && ` · 库存: ${siteStockQty}`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* 状态徽章 */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                  status === 'synced' ? 'bg-green-100 text-green-700' :
                  status === 'error' ? 'bg-red-100 text-red-700' :
                  status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  status === 'deleted' ? 'bg-gray-100 text-gray-500' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {status === 'synced' && <CheckCircle className="w-4 h-4" />}
                  {status === 'error' && <XCircle className="w-4 h-4" />}
                  {status === 'pending' && <Clock className="w-4 h-4" />}
                  {status === 'synced' ? '已同步' :
                   status === 'error' ? '同步失败' :
                   status === 'pending' ? '待同步' :
                   status === 'deleted' ? '已删除' : '未发布'}
                </div>

                {/* 查看链接 */}
                {wooId && (
                  <a
                    href={`${SITE_URLS[site.key]}/?p=${wooId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="在站点查看"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">商品详情</h2>
              <p className="text-sm text-gray-500">{product.sku}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主体内容 */}
        <div className="flex-1 overflow-hidden flex">
          {/* 左侧 - 图片区域 */}
          <div className="w-2/5 p-6 border-r border-gray-200 overflow-y-auto">
            <ImageGallery
              images={editData.images}
              onChange={(images) => setEditData({ ...editData, images })}
            />
          </div>

          {/* 右侧 - 信息区域 */}
          <div className="w-3/5 flex flex-col overflow-hidden">
            {/* Tab 切换 */}
            <div className="flex gap-1 p-2 bg-gray-50 border-b border-gray-200">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all ${
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
            <div className="flex-1 overflow-y-auto p-6">
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {!error && (
            <div className="text-sm text-gray-500">
              {hasChanges && <span className="text-orange-600">有未保存的更改</span>}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              关闭
            </button>
            
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              保存本地
            </button>

            <button
              onClick={() => setShowSyncDialog(true)}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              同步到站点
            </button>
          </div>
        </div>

        {/* 同步站点选择弹窗 */}
        {showSyncDialog && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setShowSyncDialog(false)}
            />
            <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">选择同步站点</h3>
              
              <div className="space-y-3 mb-6">
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

              {/* 同步图片选项 */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
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
                      {syncImages ? '将清理旧图片并上传新图片（较慢，约3-5秒/站点）' : '跳过图片同步（快速，约1-2秒/站点）'}
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSyncDialog(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleSync}
                  disabled={selectedSites.length === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white hover:bg-gray-800 rounded-lg disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {syncImages ? '完整同步' : '快速同步'} ({selectedSites.length} 站点)
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
