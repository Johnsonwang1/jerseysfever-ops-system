import { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Loader2, AlertCircle, Globe, ChevronDown, Plus, Wifi, Tag, X } from 'lucide-react';
import { getLocalProducts, subscribeToProducts, getProductStats, deleteLocalProduct, type LocalProduct } from '../lib/products';
import { SITES } from '../lib/attributes';
import { getCategoriesFromDb } from '../lib/supabase';
import type { SiteKey, WooCategory } from '../lib/types';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { SyncProgressPanel, StatsCards, ProductFilters, ProductTable } from '../components/products';
import { BatchCategoryModal } from '../components/products/BatchCategoryModal';
import { UploadModal } from '../components/UploadModal';
import { syncAllFromAllSites, syncAllFromSite, type SyncProgressCallback } from '../lib/sync-service';

export function ProductsPage() {
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

  // 删除商品
  const handleDeleteProduct = async (sku: string) => {
    if (!confirm(`确定要删除商品 ${sku} 吗？（仅删除本地数据）`)) return;

    setDeletingSku(sku);
    try {
      await deleteLocalProduct(sku);
      await loadProducts();
      await loadStats();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setDeletingSku(null);
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
    <div className="p-6">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-gray-700" />
          <h1 className="text-xl font-semibold text-gray-900">商品管理</h1>
          <span className="text-sm text-gray-500">（PIM - 以 SKU 为主键）</span>
          {isRealtime && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
              <Wifi className="w-3 h-3" />
              实时更新中
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 上架商品按钮 */}
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            上架商品
          </button>
          
          {/* 同步下拉菜单 */}
          <div className="relative" ref={syncMenuRef}>
            <button
              onClick={() => setShowSyncMenu(!showSyncMenu)}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  同步中...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  从站点同步
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

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* 批量操作栏 */}
      {selectedSkus.size > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-700">
              已选择 <strong>{selectedSkus.size}</strong> 个商品
            </span>
            <button
              onClick={() => setSelectedSkus(new Set())}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              取消选择
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBatchCategoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg"
            >
              <Tag className="w-4 h-4" />
              批量修改类目
            </button>
          </div>
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
        deletingSku={deletingSku}
        hasFilters={hasFilters}
        onUpload={() => setShowUploadModal(true)}
        selectedSkus={selectedSkus}
        onSelectionChange={setSelectedSkus}
      />

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
    </div>
  );
}
