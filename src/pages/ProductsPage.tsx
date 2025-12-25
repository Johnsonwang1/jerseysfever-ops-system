import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, Loader2, AlertCircle, Globe, ChevronDown, Plus, Wifi, Tag, X, Trash2, Upload, Download, EyeOff } from 'lucide-react';
import { type LocalProduct } from '../lib/products';
import { supabase } from '../lib/supabase';
import { SITES } from '../lib/attributes';
import type { SiteKey } from '../lib/types';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { SyncProgressPanel, StatsCards, ProductFilters, ProductTable, DeleteConfirmModal, SyncConfirmModal, BatchActionModal, type PullMode } from '../components/products';
import { startSync, endSync } from '../components/SyncToast';
import { BatchCategoryModal } from '../components/products/BatchCategoryModal';
import { UploadModal } from '../components/UploadModal';
import { syncAllFromAllSites, syncAllFromSite, subscribeSyncProgress, getSyncProgress, type SyncProgressCallback, type SyncProgress } from '../lib/sync-service';
import { deleteProductFromSites, syncProductToSites, pullProductsFromSite, syncAllVariations, unpublishProduct, type DeleteResult, type SyncResult, type SyncField, type SyncOptions } from '../lib/sync-api';
import { useAuth } from '../lib/auth';
import { 
  useProducts,
  useProductStats, 
  useAiPendingSkus, 
  useCategories,
  useProductsRealtime, 
  useAiTasksRealtime,
  invalidateProducts,
  useBatchPullVariations,
  useBatchRebuildVariations,
  type SpecialFilter
} from '../hooks/useProducts';

export function ProductsPage() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 读取初始筛选状态
  const getInitialFilters = (): SpecialFilter[] => {
    const filter = searchParams.get('filter');
    const validFilters: SpecialFilter[] = ['ai_pending', 'unsync', 'sync_error', 'draft', 'published', 'var_zero', 'var_one', 'var_sku_mismatch'];
    if (filter) {
      return filter.split(',').filter((f): f is SpecialFilter => validFilters.includes(f as SpecialFilter));
    }
    return [];
  };

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState<string[]>(() => {
    const cat = searchParams.get('cat');
    return cat ? cat.split(',') : [];
  });
  const [categoryMode, setCategoryMode] = useState<'and' | 'or'>('or');
  const [excludeMode, setExcludeMode] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(() => parseInt(searchParams.get('page') || '1', 10));
  const [perPage, setPerPage] = useState(20);
  
  // 特殊筛选状态
  const [specialFilters, setSpecialFilters] = useState<SpecialFilter[]>(getInitialFilters);

  // 属性筛选状态
  const [typeFilter, setTypeFilter] = useState<string[]>(() => {
    const types = searchParams.get('types');
    return types ? types.split(',') : [];
  });
  const [versionFilter, setVersionFilter] = useState<string[]>(() => {
    const versions = searchParams.get('versions');
    return versions ? versions.split(',') : [];
  });
  const [sleeveFilter, setSleeveFilter] = useState<string[]>(() => {
    const sleeves = searchParams.get('sleeves');
    return sleeves ? sleeves.split(',') : [];
  });
  const [genderFilter, setGenderFilter] = useState<string[]>(() => {
    const genders = searchParams.get('genders');
    return genders ? genders.split(',') : [];
  });

  // React Query hooks
  const { data: statsData, refetch: refetchStats } = useProductStats();
  const { data: aiPendingSkusData } = useAiPendingSkus();
  const { data: categoriesData } = useCategories('com');
  
  // 商品列表 - 使用 React Query
  const aiPendingSkus = aiPendingSkusData || new Set<string>();
  const { 
    data: productsData, 
    isLoading, 
    error: productsError,
    refetch: refetchProducts
  } = useProducts({
    page,
    perPage,
    search: searchQuery || undefined,
    categories: categoryFilter.length > 0 ? categoryFilter : undefined,
    categoryMode: categoryFilter.length > 1 ? categoryMode : undefined,
    excludeMode: categoryFilter.length > 0 ? excludeMode : undefined,
    specialFilters: specialFilters.length > 0 ? specialFilters : undefined,
    aiPendingSkus,
    types: typeFilter.length > 0 ? typeFilter : undefined,
    versions: versionFilter.length > 0 ? versionFilter : undefined,
    sleeves: sleeveFilter.length > 0 ? sleeveFilter : undefined,
    genders: genderFilter.length > 0 ? genderFilter : undefined,
  });
  
  // Realtime 订阅（自动 invalidate）
  useProductsRealtime();
  useAiTasksRealtime();

  // 批量操作 mutations
  const batchRebuildMutation = useBatchRebuildVariations();
  const batchPullMutation = useBatchPullVariations();

  // 从 React Query 数据中提取
  const products = productsData?.products || [];
  const total = productsData?.total || 0;
  const totalPages = productsData?.totalPages || 1;
  const error = productsError ? (productsError as Error).message : null;
  const isRealtime = true; // React Query + Realtime 始终是实时的
  
  // 使用 React Query 的数据
  const stats = statsData || { total: 0, bySyncStatus: {} as Record<SiteKey, { synced: number; error: number; pending: number }> };
  const categories = categoriesData || [];

  // 同步筛选状态到 URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (categoryFilter.length > 0) params.set('cat', categoryFilter.join(','));
    if (specialFilters.length > 0) params.set('filter', specialFilters.join(','));
    if (typeFilter.length > 0) params.set('types', typeFilter.join(','));
    if (versionFilter.length > 0) params.set('versions', versionFilter.join(','));
    if (sleeveFilter.length > 0) params.set('sleeves', sleeveFilter.join(','));
    if (genderFilter.length > 0) params.set('genders', genderFilter.join(','));
    if (page > 1) params.set('page', page.toString());
    
    setSearchParams(params, { replace: true });
  }, [searchQuery, categoryFilter, specialFilters, typeFilter, versionFilter, sleeveFilter, genderFilter, page, setSearchParams]);

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
  const [deletingSku, _setDeletingSku] = useState<string | null>(null);

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
  const [batchAction, setBatchAction] = useState<'sync' | 'delete' | 'update' | 'pull' | 'unpublish' | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState<{ sku: string; success: boolean; error?: string }[] | undefined>(undefined);

  // 单个商品未发布状态
  const [unpublishingSku, setUnpublishingSku] = useState<string | null>(null);

  // GCP 全量同步进度状态
  const [gcpSyncProgress, setGcpSyncProgress] = useState<SyncProgress | null>(null);

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

  // 订阅 GCP 同步进度（Realtime）
  useEffect(() => {
    // 页面加载时检查当前同步状态
    getSyncProgress().then((progress) => {
      if (progress) {
        setGcpSyncProgress(progress);
        if (progress.status === 'running') {
          setIsSyncing(true);
        }
      }
    });

    // 订阅 Realtime 更新
    const unsubscribe = subscribeSyncProgress((progress) => {
      setGcpSyncProgress(progress);
      if (progress.status === 'running') {
        setIsSyncing(true);
      } else if (progress.status === 'completed' || progress.status === 'error') {
        setIsSyncing(false);
        // 同步完成后刷新商品列表
        invalidateProducts();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 刷新函数（用于同步后刷新）
  const loadProducts = refetchProducts;
  const loadStats = refetchStats;

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

  // 仅同步变体
  const handleSyncVariations = async (site: SiteKey) => {
    if (isSyncing) return;
    setShowSyncMenu(false);
    
    const siteConfig = SITES.find(s => s.key === site);
    if (!confirm(`确定要同步 ${siteConfig?.flag} ${siteConfig?.name} 的所有商品变体吗？\n\n这只会更新变体信息，不会修改其他数据。`)) return;

    setIsSyncing(true);
    const toastId = startSync(`正在同步 ${siteConfig?.name} 变体...`);

    try {
      const result = await syncAllVariations(site, (progress) => {
        // 更新进度提示（可选）
        console.log(`[${site}] 变体同步进度: ${progress.synced}/${progress.total} - ${progress.current}`);
      });
      
      await loadProducts();
      endSync(toastId, true, `${siteConfig?.name} 变体同步完成！成功: ${result.synced}, 失败: ${result.failed}`);
    } catch (err) {
      endSync(toastId, false, '变体同步失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsSyncing(false);
    }
  };

  // 重建选中商品的变体（使用 useMutation，5 个并行，带重试）
  const handleRebuildVariations = async () => {
    if (isSyncing || batchRebuildMutation.isPending) return;
    if (selectedSkus.size === 0) {
      alert('请先选择要重建变体的商品');
      return;
    }
    
    const count = selectedSkus.size;
    if (!confirm(`确定要重建 ${count} 个商品的变体吗？\n\n⚠️ 这将删除旧变体并创建新变体（SKU 格式: 产品SKU-尺码）\n\n注意：此操作不可撤销，可能影响已有订单。`)) return;

    setIsSyncing(true);
    const toastId = startSync(`正在重建 ${count} 个商品的变体...`);
    
    try {
      const results = await batchRebuildMutation.mutateAsync({
        skus: Array.from(selectedSkus),
        sites: ['com', 'uk', 'de', 'fr'],
      });
      
      const success = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const failedSkus = results.filter(r => !r.success).map(r => r.sku);
      
      setSelectedSkus(new Set());
      
      if (failedSkus.length > 0) {
        console.error('失败的 SKU:', failedSkus);
        endSync(toastId, false, `重建完成！成功: ${success}, 失败: ${failed}\n失败SKU: ${failedSkus.slice(0, 5).join(', ')}${failedSkus.length > 5 ? '...' : ''}`);
      } else {
        endSync(toastId, true, `重建完成！全部 ${success} 个成功`);
      }
    } catch (err) {
      endSync(toastId, false, '重建变体失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsSyncing(false);
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

  // 执行同步单个商品（支持推送和拉取，支持多站点）
  const handleConfirmSync = async (sites: SiteKey[], mode: 'push' | 'pull', fields?: SyncField[]) => {
    if (!syncModalProduct) return;

    setIsSyncingProduct(true);
    setSyncingSku(syncModalProduct.sku);
    try {
      if (mode === 'pull') {
        // 从多个站点拉取数据
        const allResults: SyncResult[] = [];
        for (const site of sites) {
          const pullResults = await pullProductsFromSite([syncModalProduct.sku], site);
          // 转换为 SyncResult 格式
          for (const r of pullResults) {
            allResults.push({
              site,
              success: r.success,
              error: r.error,
            });
          }
        }
        setSyncResults(allResults);
        // 刷新列表
        await loadProducts();
      } else {
        // 推送到站点（带字段选择）
        const options: SyncOptions | undefined = fields ? { fields } : undefined;
        const results = await syncProductToSites(syncModalProduct.sku, sites, options);
        setSyncResults(results);
      }
    } catch (err) {
      alert('操作失败: ' + (err instanceof Error ? err.message : '未知错误'));
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

  // 异步执行同步（后台执行，关闭窗口）
  const handleConfirmSyncAsync = (sites: SiteKey[], mode: 'push' | 'pull', fields?: SyncField[]) => {
    if (!syncModalProduct) return;
    const sku = syncModalProduct.sku;

    // 开始后台任务
    startSync();

    // 异步执行
    (async () => {
      try {
        if (mode === 'pull') {
          // 从多个站点拉取数据
          for (const site of sites) {
            await pullProductsFromSite([sku], site);
          }
          endSync(true, `${sku} 拉取完成`);
        } else {
          // 推送到站点
          const options: SyncOptions | undefined = fields ? { fields } : undefined;
          await syncProductToSites(sku, sites, options);
          endSync(true, `${sku} 更新完成`);
        }
        // 刷新列表
        await loadProducts();
        await loadStats();
      } catch (err) {
        endSync(false, `${sku} 操作失败`);
      }
    })();
  };

  // 批量拉取（从多个站点获取数据到 PIM）
  const handleBatchPull = async (sites: SiteKey[], _deleteLocal?: boolean, _fields?: SyncField[], pullMode?: PullMode) => {
    const selectedProducts = products.filter(p => selectedSkus.has(p.sku));
    const skus = selectedProducts.map(p => p.sku);

    setIsBatchProcessing(true);
    try {
      // 仅拉取变体模式：使用优化的批量拉取（10 个并行 + 重试）
      if (pullMode === 'variations') {
        const allResults: { sku: string; success: boolean; error?: string }[] = [];
        
        // 从每个选中的站点拉取变体
        for (const site of sites) {
          console.log(`📥 从 ${site} 站点拉取变体...`);
          const results = await batchPullMutation.mutateAsync({ skus, site });
          
          // 合并结果
          for (const r of results) {
            const existing = allResults.find(e => e.sku === r.sku);
            if (existing) {
              if (!existing.success && r.success) {
                existing.success = true;
                existing.error = undefined;
              }
            } else {
              allResults.push(r);
            }
          }
        }
        
        setBatchResults(allResults);
      } else {
        // 全部数据模式：原有逻辑
        const allResults: { sku: string; success: boolean; error?: string }[] = [];

        for (const site of sites) {
          const pullResults = await pullProductsFromSite(skus, site);
          
          for (const r of pullResults) {
            const existing = allResults.find(e => e.sku === r.sku);
            if (existing) {
              if (!existing.success && r.success) {
                existing.success = true;
                existing.error = undefined;
              }
            } else {
              allResults.push({
                sku: r.sku,
                success: r.success,
                error: r.error,
              });
            }
          }
        }

        setBatchResults(allResults);
      }

      // 刷新列表
      await loadProducts();
      await loadStats();
    } catch (err) {
      alert('批量拉取失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 批量同步/更新（推送到多个站点）
  const handleBatchSync = async (sites: SiteKey[], _deleteLocal?: boolean, fields?: SyncField[]) => {
    const selectedProducts = products.filter(p => selectedSkus.has(p.sku));

    setIsBatchProcessing(true);
    try {
      const results: { sku: string; success: boolean; error?: string }[] = [];

      // 构建同步选项
      const options: SyncOptions | undefined = fields ? { fields } : undefined;

      // 逐个同步商品到多站点
      for (const product of selectedProducts) {
        try {
          const syncResults = await syncProductToSites(product.sku, sites, options);
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
  const handleBatchDelete = async (sites: SiteKey[], deleteLocal = true) => {
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

  // 批量设为未发布（草稿）
  const handleBatchUnpublish = async (sites: SiteKey[]) => {
    const selectedProducts = products.filter(p => selectedSkus.has(p.sku));

    setIsBatchProcessing(true);
    try {
      const results: { sku: string; success: boolean; error?: string }[] = [];

      // 逐个设为未发布
      for (const product of selectedProducts) {
        try {
          const unpublishResults = await unpublishProduct(product.sku, sites);
          const allSuccess = unpublishResults.every(r => r.success);
          results.push({
            sku: product.sku,
            success: allSuccess,
            error: unpublishResults.find(r => !r.success)?.error,
          });
        } catch (err) {
          results.push({
            sku: product.sku,
            success: false,
            error: err instanceof Error ? err.message : '操作失败',
          });
        }
      }

      setBatchResults(results);

      // 刷新列表
      await loadProducts();
      await loadStats();
    } catch (err) {
      alert('批量未发布失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 单个商品设为未发布
  const handleUnpublishProduct = async (sku: string) => {
    const product = products.find(p => p.sku === sku);
    if (!product) return;

    // 获取已发布的站点
    const publishedSites = (Object.entries(product.woo_ids || {}) as [SiteKey, number | undefined][])
      .filter(([, id]) => id)
      .map(([site]) => site);

    if (publishedSites.length === 0) {
      alert('该商品未发布到任何站点');
      return;
    }

    if (!confirm(`确定要将商品 ${sku} 设为未发布（草稿）吗？\n\n将影响站点: ${publishedSites.join(', ')}`)) {
      return;
    }

    setUnpublishingSku(sku);
    const toastId = startSync(`正在设置 ${sku} 为未发布...`);

    try {
      const results = await unpublishProduct(sku, publishedSites);
      const allSuccess = results.every(r => r.success);
      
      if (allSuccess) {
        endSync(toastId, true, `${sku} 已设为未发布`);
      } else {
        const failedSites = results.filter(r => !r.success).map(r => r.site).join(', ');
        endSync(toastId, false, `部分站点失败: ${failedSites}`);
      }

      // 刷新列表
      await loadProducts();
      await loadStats();
    } catch (err) {
      endSync(toastId, false, '操作失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setUnpublishingSku(null);
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

  // 批量操作异步执行（后台执行，关闭窗口）
  const handleBatchAsync = (sites: SiteKey[], _deleteLocal?: boolean, fields?: SyncField[]) => {
    const selectedProducts = products.filter(p => selectedSkus.has(p.sku));
    const skus = selectedProducts.map(p => p.sku);
    const action = batchAction;

    // 开始后台任务
    startSync();

    // 清除选择和关闭弹窗已经在调用处处理

    // 异步执行
    (async () => {
      try {
        if (action === 'pull') {
          // 批量拉取
          for (const site of sites) {
            await pullProductsFromSite(skus, site);
          }
          endSync(true, `${skus.length} 个商品拉取完成`);
        } else if (action === 'update' || action === 'sync') {
          // 批量更新/同步
          const options: SyncOptions | undefined = fields ? { fields } : undefined;
          for (const sku of skus) {
            await syncProductToSites(sku, sites, options);
          }
          endSync(true, `${skus.length} 个商品更新完成`);
        } else if (action === 'unpublish') {
          // 批量未发布
          for (const sku of skus) {
            await unpublishProduct(sku, sites);
          }
          endSync(true, `${skus.length} 个商品已设为未发布`);
        }
        // 刷新列表
        await loadProducts();
        await loadStats();
        setSelectedSkus(new Set());
      } catch (err) {
        endSync(false, `批量操作失败`);
      }
    })();
  };

  // 清除筛选
  const handleClearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setCategoryFilter([]);
    setExcludeMode(false);
    setSpecialFilters([]);
    setTypeFilter([]);
    setVersionFilter([]);
    setSleeveFilter([]);
    setGenderFilter([]);
    setPage(1);
  };

  const hasFilters = Boolean(
    searchQuery || 
    categoryFilter.length > 0 || 
    specialFilters.length > 0 ||
    typeFilter.length > 0 ||
    versionFilter.length > 0 ||
    sleeveFilter.length > 0 ||
    genderFilter.length > 0
  );

  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* 头部区域 - 不再固定 */}
      <div className="bg-gray-50 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6 space-y-4 sm:space-y-5">
        {/* 头部 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 flex-shrink-0" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">商品管理</h1>
            <span className="hidden sm:inline text-sm text-gray-500">（PIM - 以 SKU 为主键）</span>
            {isRealtime && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-green-100 text-green-700">
                <Wifi className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">实时更新中</span>
                <span className="sm:hidden">实时</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
            {/* 上架商品按钮 */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2.5 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
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
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2.5 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
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
                      {/* 同步变体 */}
                      <div className="border-t border-gray-100 my-1" />
                      <div className="px-4 py-1 text-xs text-gray-400 font-medium">仅同步变体</div>
                      {SITES.map((site) => (
                        <button
                          key={`var-${site.key}`}
                          onClick={() => handleSyncVariations(site.key)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span>{site.flag}</span>
                          <span className="flex-1">{site.name} 变体</span>
                          <Package className="w-3 h-3 text-orange-500" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        {/* GCP 全量同步进度 */}
        {gcpSyncProgress && gcpSyncProgress.status === 'running' && (
          <div className="mt-4 sm:mt-5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="font-medium text-blue-400">
                  正在从 {gcpSyncProgress.site?.toUpperCase()} 站点同步...
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">
                  {gcpSyncProgress.current} / {gcpSyncProgress.total}
                </span>
                <button
                  onClick={async () => {
                    await supabase.from('sync_progress').update({ status: 'cancelled', message: '用户取消' }).eq('id', 'current');
                  }}
                  className="px-3 py-1 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  取消同步
                </button>
              </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${gcpSyncProgress.total > 0 ? (gcpSyncProgress.current / gcpSyncProgress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>✅ 成功: {gcpSyncProgress.success}</span>
              <span>❌ 失败: {gcpSyncProgress.failed}</span>
              <span>{gcpSyncProgress.message}</span>
            </div>
          </div>
        )}

        {/* 同步进度（旧版） */}
        {isSyncing && Object.keys(syncProgress).length > 0 && <div className="mt-4 sm:mt-5"><SyncProgressPanel progress={syncProgress} /></div>}

        {/* 统计卡片 */}
        <div className="mt-4 sm:mt-5"><StatsCards stats={stats} /></div>

        {/* 搜索和筛选 */}
        <div className="mt-4 sm:mt-5"><ProductFilters
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
          specialFilters={specialFilters}
          onSpecialFiltersChange={(filters) => {
            setSpecialFilters(filters);
            setPage(1);
          }}
          typeFilter={typeFilter}
          versionFilter={versionFilter}
          sleeveFilter={sleeveFilter}
          genderFilter={genderFilter}
          onTypeFilterChange={(types) => {
            setTypeFilter(types);
            setPage(1);
          }}
          onVersionFilterChange={(versions) => {
            setVersionFilter(versions);
            setPage(1);
          }}
          onSleeveFilterChange={(sleeves) => {
            setSleeveFilter(sleeves);
            setPage(1);
          }}
          onGenderFilterChange={(genders) => {
            setGenderFilter(genders);
            setPage(1);
          }}
        /></div>

        {/* 批量操作栏 */}
        {selectedSkus.size > 0 && (
          <div className="mt-4 sm:mt-5 p-4 sm:p-5 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3">
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
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
              <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto flex-wrap">
                <button
                  onClick={() => setShowBatchCategoryModal(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 text-sm bg-gray-600 text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Tag className="w-4 h-4" />
                  <span className="hidden sm:inline">批量修改类目</span>
                  <span className="sm:hidden">改类目</span>
                </button>
                <button
                  onClick={() => {
                    setBatchAction('pull');
                    setBatchResults(undefined);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">从站点拉取</span>
                  <span className="sm:hidden">拉取</span>
                </button>
                <button
                  onClick={() => {
                    setBatchAction('update');
                    setBatchResults(undefined);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">批量更新到站点</span>
                  <span className="sm:hidden">更新</span>
                </button>
                <button
                  onClick={handleRebuildVariations}
                  disabled={isSyncing}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 text-sm bg-orange-600 text-white hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                  title="删除旧变体并重建（修复 SKU 不匹配问题）"
                >
                  <Package className="w-4 h-4" />
                  <span className="hidden sm:inline">重建变体</span>
                  <span className="sm:hidden">变体</span>
                </button>
                <button
                  onClick={() => {
                    setBatchAction('unpublish');
                    setBatchResults(undefined);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 text-sm bg-yellow-600 text-white hover:bg-yellow-700 rounded-lg transition-colors"
                >
                  <EyeOff className="w-4 h-4" />
                  <span className="hidden sm:inline">批量未发布</span>
                  <span className="sm:hidden">未发布</span>
                </button>
                <button
                  onClick={() => {
                    setBatchAction('delete');
                    setBatchResults(undefined);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
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
      <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6">
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
        onUnpublish={handleUnpublishProduct}
        deletingSku={deletingSku}
        syncingSku={syncingSku}
        unpublishingSku={unpublishingSku}
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
          onConfirmAsync={handleConfirmSyncAsync}
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
          onConfirm={
            batchAction === 'delete' ? handleBatchDelete : 
            batchAction === 'pull' ? handleBatchPull : 
            batchAction === 'unpublish' ? handleBatchUnpublish : 
            handleBatchSync
          }
          onConfirmAsync={batchAction !== 'delete' ? handleBatchAsync : undefined}
          isProcessing={isBatchProcessing}
          results={batchResults}
        />
      )}
    </div>
  );
}
