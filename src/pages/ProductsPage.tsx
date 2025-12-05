import { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Loader2, AlertCircle, Globe, ChevronDown, Plus, Wifi, Tag, X, RefreshCw, Trash2 } from 'lucide-react';
import { getLocalProducts, subscribeToProducts, getProductStats, type LocalProduct } from '../lib/products';
import { SITES } from '../lib/attributes';
import { getCategoriesFromDb } from '../lib/supabase';
import type { SiteKey, WooCategory } from '../lib/types';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { SyncProgressPanel, StatsCards, ProductFilters, ProductTable, DeleteConfirmModal, SyncConfirmModal, BatchActionModal } from '../components/products';
import { BatchCategoryModal } from '../components/products/BatchCategoryModal';
import { UploadModal } from '../components/UploadModal';
import { syncAllFromAllSites, syncAllFromSite, type SyncProgressCallback } from '../lib/sync-service';
import { deleteProductFromSites, syncProductToSites, type DeleteResult, type SyncResult } from '../lib/sync-api';
import { useAuth } from '../lib/auth';

export function ProductsPage() {
  const { isAdmin } = useAuth();

  // 数据状态
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isRealtime, setIsRealtime] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    bySyncStatus: Record<SiteKey, { synced: number; error: number; pending: number }>;
  }>({ total: 0, bySyncStatus: {} as any });

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [categoryMode, setCategoryMode] = useState<'and' | 'or'>('or');
  const [excludeMode, setExcludeMode] = useState(false);
  const [categories, setCategories] = useState<WooCategory[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 弹窗状态
  const [selectedProduct, setSelectedProduct] = useState<LocalProduct | null>(null);
  const [showBatchCategoryModal, setShowBatchCategoryModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // 批量选择状态
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

  // 同步状态
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<Partial<Record<SiteKey, {
    current: number;
    total: number;
    status: string;
  }>>>({});
  const [showSyncMenu, setShowSyncMenu] = useState(false);
  const syncMenuRef = useRef<HTMLDivElement>(null);
  const [deletingSku, setDeletingSku] = useState<string | null>(null);
  const [perPage, setPerPage] = useState(20);

  // 删除确认弹窗状态
  const [deleteModalProduct, setDeleteModalProduct] = useState<LocalProduct | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResults, setDeleteResults] = useState<DeleteResult[] | undefined>(undefined);

  // 同步单个商品弹窗状态
  const [syncModalProduct, setSyncModalProduct] = useState<LocalProduct | null>(null);
  const [isSyncingProduct, setIsSyncingProduct] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | undefined>(undefined);
  const [syncingSku, setSyncingSku] = useState<string | null>(null);

  // 批量操作弹窗状态
  const [batchAction, setBatchAction] = useState<'sync' | 'delete' | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState<{ sku: string; success: boolean; error?: string }[] | undefined>(undefined);

  // 实时搜索（防抖 300ms）
  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
      setPage(1);
    }, 300);
  };

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (syncMenuRef.current && !syncMenuRef.current.contains(event.target as Node)) {
        setShowSyncMenu(false);
      }
    };
    if (showSyncMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSyncMenu]);

  // 加载商品
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getLocalProducts({
        page,
        perPage,
        search: searchQuery || undefined,
        categories: categoryFilter.length > 0 ? categoryFilter : undefined,
        categoryMode: categoryFilter.length > 1 ? categoryMode : undefined,
        excludeMode: categoryFilter.length > 0 ? excludeMode : undefined,
      });
      setProducts(result.products);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage, searchQuery, categoryFilter, categoryMode, excludeMode]);

  // 加载分类（从数据库）
  const loadCategories = useCallback(async () => {
    try {
      const cats = await getCategoriesFromDb('com');
      setCategories(cats.filter(c => c.name !== 'Uncategorized'));
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  // 加载统计
  const loadStats = useCallback(async () => {
    try {
      const data = await getProductStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadStats();
    loadCategories();
  }, [loadProducts, loadStats, loadCategories]);

  // Realtime 订阅
  useEffect(() => {
    const unsubscribe = subscribeToProducts(() => {
      loadProducts();
      loadStats();
    });
    setIsRealtime(true);
    return () => {
      unsubscribe();
      setIsRealtime(false);
    };
  }, [loadProducts, loadStats]);

  // 同步回调
  const syncProgressCallback: SyncProgressCallback = (progress) => {
    setSyncProgress(prev => ({
      ...prev,
      [progress.site]: {
        current: progress.current,
        total: progress.total,
        status: progress.status,
      },
    }));
  };

  // 从单个站点同步
  const handleSyncFromSite = async (site: SiteKey) => {
    if (isSyncing) return;
    setShowSyncMenu(false);
    
    const siteConfig = SITES.find(s => s.key === site);
    if (!confirm(`确定要从 ${siteConfig?.flag} ${siteConfig?.name} 同步商品数据吗？`)) return;

    setIsSyncing(true);
    setSyncProgress({});

    try {
      const result = await syncAllFromSite(site, syncProgressCallback);
      await loadProducts();
      await loadStats();
      alert(`${siteConfig?.name} 同步完成！成功: ${result.synced} 条`);
    } catch (err) {
      alert('同步失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsSyncing(false);
      setSyncProgress({});
    }
  };

  // 从所有站点同步
  const handleSyncFromAllSites = async () => {
    if (isSyncing) return;
    setShowSyncMenu(false);
    
    if (!confirm('确定要从所有站点同步商品数据吗？')) return;

    setIsSyncing(true);
    setSyncProgress({});

    try {
      const results = await syncAllFromAllSites(syncProgressCallback);
      await loadProducts();
      await loadStats();
      
      const totalSynced = Object.values(results).reduce((sum, r) => sum + r.synced, 0);
      alert(`同步完成！共 ${totalSynced} 条`);
    } catch (err) {
      alert('同步失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsSyncing(false);
      setSyncProgress({});
    }
  };

  // 打开删除确认弹窗
  const handleDeleteProduct = (sku: string) => {
    const product = products.find(p => p.sku === sku);
    if (product) {
      setDeleteModalProduct(product);
      setDeleteResults(undefined);
    }
  };

  // 执行删除操作
  const handleConfirmDelete = async (sites: SiteKey[], deleteLocal: boolean) => {
    if (!deleteModalProduct) return;

    setIsDeleting(true);
    try {
      const result = await deleteProductFromSites(deleteModalProduct.sku, sites, deleteLocal);
      setDeleteResults(result.results);

      // 如果删除了本地数据，刷新列表
      if (result.localDeleted) {
        await loadProducts();
        await loadStats();
      }
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsDeleting(false);
    }
  };

  // 关闭删除弹窗
  const handleCloseDeleteModal = () => {
    setDeleteModalProduct(null);
    setDeleteResults(undefined);
  };

  // 打开同步单个商品弹窗
  const handleSyncProduct = (sku: string) => {
    const product = products.find(p => p.sku === sku);
    if (product) {
      setSyncModalProduct(product);
      setSyncResults(undefined);
    }
  };

  // 执行同步单个商品
  const handleConfirmSync = async (sites: SiteKey[]) => {
    if (!syncModalProduct) return;

    setIsSyncingProduct(true);
    setSyncingSku(syncModalProduct.sku);
    try {
      const results = await syncProductToSites(syncModalProduct.sku, sites);
      setSyncResults(results);
    } catch (err) {
      alert('同步失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsSyncingProduct(false);
      setSyncingSku(null);
    }
  };

  // 关闭同步弹窗
  const handleCloseSyncModal = () => {
    setSyncModalProduct(null);
    setSyncResults(undefined);
  };

  // 批量同步（推送到多个站点）
  const handleBatchSync = async (sites: SiteKey[]) => {
    const selectedProducts = products.filter(p => selectedSkus.has(p.sku));

    setIsBatchProcessing(true);
    try {
      const results: { sku: string; success: boolean; error?: string }[] = [];

      // 逐个同步商品到多站点
      for (const product of selectedProducts) {
        try {
          const syncResults = await syncProductToSites(product.sku, sites);
          const allSuccess = syncResults.every(r => r.success);
          results.push({
            sku: product.sku,
            success: allSuccess,
            error: syncResults.find(r => !r.success)?.error,
          });
        } catch (err) {
          results.push({
            sku: product.sku,
            success: false,
            error: err instanceof Error ? err.message : '同步失败',
          });
        }
      }

      setBatchResults(results);

      // 刷新列表
      await loadProducts();
      await loadStats();
    } catch (err) {
      alert('批量同步失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 批量删除
  const handleBatchDelete = async (sites: SiteKey[], deleteLocal: boolean) => {
    const selectedProducts = products.filter(p => selectedSkus.has(p.sku));

    setIsBatchProcessing(true);
    try {
      const results: { sku: string; success: boolean; error?: string }[] = [];

      // 逐个删除（避免并发过多）
      for (const product of selectedProducts) {
        try {
          const result = await deleteProductFromSites(product.sku, sites, deleteLocal);
          const allSuccess = result.results.every(r => r.success);
          results.push({
            sku: product.sku,
            success: allSuccess && (deleteLocal ? result.localDeleted : true),
            error: result.results.find(r => !r.success)?.error,
          });
        } catch (err) {
          results.push({
            sku: product.sku,
            success: false,
            error: err instanceof Error ? err.message : '删除失败',
          });
        }
      }

      setBatchResults(results);

      // 刷新列表
      if (deleteLocal) {
        await loadProducts();
        await loadStats();
        setSelectedSkus(new Set());
      }
    } catch (err) {
      alert('批量删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 关闭批量操作弹窗
  const handleCloseBatchModal = () => {
    setBatchAction(null);
    setBatchResults(undefined);
    // 如果操作成功，清除选择
    if (batchResults && batchResults.every(r => r.success)) {
      setSelectedSkus(new Set());
    }
  };

  // 清除筛选
  const handleClearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setCategoryFilter([]);
    setExcludeMode(false);
    setPage(1);
  };

  const hasFilters = Boolean(searchQuery || categoryFilter.length > 0);

  return (
    <div className="h-full flex flex-col">
      {/* 固定头部区域 */}
      <div className="sticky top-0 z-20 bg-gray-50 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 space-y-4">
        {/* 头部 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">商品管理</h1>
            <span className="hidden sm:inline text-sm text-gray-500">（PIM - 以 SKU 为主键）</span>
            {isRealtime && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">实时更新中</span>
                <span className="sm:hidden">实时</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* 上架商品按钮 */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">上架商品</span>
              <span className="sm:hidden">上架</span>
            </button>

            {/* 同步下拉菜单 - 仅管理员可见 */}
            {isAdmin && (
              <div className="relative flex-1 sm:flex-none" ref={syncMenuRef}>
                <button
                  onClick={() => setShowSyncMenu(!showSyncMenu)}
                  disabled={isSyncing}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="hidden sm:inline">同步中...</span>
                      <span className="sm:hidden">同步</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" />
                      <span className="hidden sm:inline">从站点同步</span>
                      <span className="sm:hidden">同步</span>
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>
                {showSyncMenu && !isSyncing && (
                  <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button
                        onClick={handleSyncFromAllSites}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Globe className="w-4 h-4 text-blue-600" />
                        同步所有站点
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      {SITES.map((site) => (
                        <button
                          key={site.key}
                          onClick={() => handleSyncFromSite(site.key)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span>{site.flag}</span>
                          仅同步 {site.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        {/* 同步进度 */}
        {isSyncing && <SyncProgressPanel progress={syncProgress} />}

        {/* 统计卡片 */}
        <StatsCards stats={stats} />

        {/* 搜索和筛选 */}
        <ProductFilters
          searchInput={searchInput}
          onSearchChange={handleSearchInput}
          onSearchClear={() => {
            setSearchInput('');
            setSearchQuery('');
            setPage(1);
          }}
          categoryFilter={categoryFilter}
          categoryMode={categoryMode}
          excludeMode={excludeMode}
          onCategoryChange={(value, mode) => {
            setCategoryFilter(value);
            setCategoryMode(mode);
            setPage(1);
          }}
          onExcludeModeChange={(exclude) => {
            setExcludeMode(exclude);
            setPage(1);
          }}
          categories={categories}
          onReset={handleClearFilters}
          hasFilters={hasFilters}
        />

        {/* 批量操作栏 */}
        {selectedSkus.size > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-blue-700">
                  已选择 <strong>{selectedSkus.size}</strong> 个商品
                </span>
                <button
                  onClick={() => {
                    // 全选当前页
                    const newSet = new Set(selectedSkus);
                    products.forEach(p => newSet.add(p.sku));
                    setSelectedSkus(newSet);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  全选当前页
                </button>
                <button
                  onClick={() => setSelectedSkus(new Set())}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  清除选择
                </button>
                <span className="hidden sm:inline text-xs text-blue-500">
                  (Shift+点击可范围选择)
                </span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowBatchCategoryModal(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-sm bg-gray-600 text-white hover:bg-gray-700 rounded-lg"
                >
                  <Tag className="w-4 h-4" />
                  <span className="hidden sm:inline">批量修改类目</span>
                  <span className="sm:hidden">改类目</span>
                </button>
                <button
                  onClick={() => {
                    setBatchAction('sync');
                    setBatchResults(undefined);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">批量同步</span>
                  <span className="sm:hidden">同步</span>
                </button>
                <button
                  onClick={() => {
                    setBatchAction('delete');
                    setBatchResults(undefined);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">批量删除</span>
                  <span className="sm:hidden">删除</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 px-4 lg:px-6 pb-4 lg:pb-6 overflow-auto">
        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        {/* 商品列表 */}
        <ProductTable
        products={products}
        isLoading={isLoading}
        total={total}
        page={page}
        totalPages={totalPages}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={(n) => {
          setPerPage(n);
          setPage(1); // 切换每页数量时回到第一页
        }}
        onSelect={setSelectedProduct}
        onDelete={handleDeleteProduct}
        onSync={handleSyncProduct}
        deletingSku={deletingSku}
        syncingSku={syncingSku}
        hasFilters={hasFilters}
        onUpload={() => setShowUploadModal(true)}
        selectedSkus={selectedSkus}
        onSelectionChange={setSelectedSkus}
      />

      </div>

      {/* 商品详情弹窗 */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSaved={() => {
            loadProducts();
            loadStats();
          }}
        />
      )}

      {/* 批量修改类目弹窗 */}
      {showBatchCategoryModal && (
        <BatchCategoryModal
          products={products.filter(p => selectedSkus.has(p.sku))}
          onClose={() => setShowBatchCategoryModal(false)}
          onComplete={() => {
            setSelectedSkus(new Set());
            loadProducts();
            loadStats();
          }}
        />
      )}

      {/* 上架商品弹窗 */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          // 刷新商品列表
          loadProducts();
          loadStats();
        }}
      />

      {/* 删除确认弹窗 */}
      {deleteModalProduct && (
        <DeleteConfirmModal
          product={deleteModalProduct}
          onClose={handleCloseDeleteModal}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
          deleteResults={deleteResults}
        />
      )}

      {/* 同步确认弹窗 */}
      {syncModalProduct && (
        <SyncConfirmModal
          product={syncModalProduct}
          onClose={handleCloseSyncModal}
          onConfirm={handleConfirmSync}
          isSyncing={isSyncingProduct}
          syncResults={syncResults}
        />
      )}

      {/* 批量操作弹窗 */}
      {batchAction && (
        <BatchActionModal
          action={batchAction}
          products={products.filter(p => selectedSkus.has(p.sku))}
          onClose={handleCloseBatchModal}
          onConfirm={batchAction === 'sync' ? handleBatchSync : handleBatchDelete}
          isProcessing={isBatchProcessing}
          results={batchResults}
        />
      )}
    </div>
  );
}
