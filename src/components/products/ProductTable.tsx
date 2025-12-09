import { useState } from 'react';
import { Package, Eye, ExternalLink, Trash2, Loader2, ChevronLeft, ChevronRight, CheckSquare, Square, MinusSquare, RefreshCw, Layers, X } from 'lucide-react';
import { getMainSitePrice, getMainSiteStatus, type LocalProduct } from '../../lib/products';
import type { SiteKey } from '../../lib/types';
import { getProductVariations, type ProductVariation } from '../../lib/sync-api';

const SITE_URLS: Record<SiteKey, string> = {
  com: 'https://jerseysfever.com',
  uk: 'https://jerseysfever.uk',
  de: 'https://jerseysfever.de',
  fr: 'https://jerseysfever.fr',
};

interface ProductTableProps {
  products: LocalProduct[];
  isLoading: boolean;
  total: number;
  page: number;
  totalPages: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  onSelect: (product: LocalProduct) => void;
  onDelete: (sku: string) => void;
  onSync: (sku: string) => void;
  deletingSku: string | null;
  syncingSku: string | null;
  hasFilters: boolean;
  onUpload: () => void;
  // 批量选择
  selectedSkus: Set<string>;
  onSelectionChange: (skus: Set<string>) => void;
}

const PER_PAGE_OPTIONS = [20, 50, 100, 200];

// 变体详情模态框
function VariationsModal({
  product,
  variations,
  isLoading,
  onClose,
}: {
  product: LocalProduct;
  variations: ProductVariation[];
  isLoading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">变体详情</h3>
            <p className="text-sm text-gray-500 mt-0.5">{product.sku} - {product.content?.com?.name || product.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">加载变体数据...</span>
            </div>
          ) : variations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>暂无变体数据</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-gray-500 mb-4">共 {variations.length} 个变体</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">变体 ID</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">尺码</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">价格</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {variations.map((v) => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-600">{v.id}</td>
                      <td className="px-3 py-2 font-mono text-blue-600">{v.sku || '-'}</td>
                      <td className="px-3 py-2">
                        {v.attributes.map(a => a.option).join(', ') || '-'}
                      </td>
                      <td className="px-3 py-2">
                        {v.sale_price ? (
                          <span>
                            <span className="text-gray-400 line-through mr-1">${v.regular_price}</span>
                            <span className="text-green-600 font-medium">${v.sale_price}</span>
                          </span>
                        ) : (
                          <span>${v.regular_price || '-'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          v.stock_status === 'instock' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {v.stock_quantity !== null ? v.stock_quantity : (v.stock_status === 'instock' ? '有货' : '缺货')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProductTable({
  products,
  isLoading,
  total,
  page,
  totalPages,
  perPage,
  onPageChange,
  onPerPageChange,
  onSelect,
  onDelete,
  onSync,
  deletingSku,
  syncingSku,
  hasFilters,
  onUpload,
  selectedSkus,
  onSelectionChange,
}: ProductTableProps) {
  // 记录上次选中的索引（用于 Shift 范围选择）
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  
  // 变体相关状态
  const [variationsModal, setVariationsModal] = useState<{
    product: LocalProduct;
    variations: ProductVariation[];
    isLoading: boolean;
  } | null>(null);

  // 显示变体数据（优先使用存储的数据）
  const handleShowVariations = async (product: LocalProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 优先使用存储的变体数据
    const storedVariations = product.variations?.com || [];
    if (storedVariations.length > 0) {
      setVariationsModal({
        product,
        variations: storedVariations as ProductVariation[],
        isLoading: false,
      });
      return;
    }
    
    // 没有存储的数据，尝试从 API 获取
    const wooId = product.woo_ids?.com;
    if (!wooId) {
      alert('该商品未在主站发布');
      return;
    }
    
    // 显示加载中状态
    setVariationsModal({
      product,
      variations: [],
      isLoading: true,
    });
    
    try {
      const result = await getProductVariations('com', wooId);
      if (result.success) {
        setVariationsModal({
          product,
          variations: result.variations,
          isLoading: false,
        });
      } else {
        setVariationsModal({
          product,
          variations: [],
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('获取变体失败:', error);
      setVariationsModal({
        product,
        variations: [],
        isLoading: false,
      });
    }
  };

  // 全选状态
  const allSelected = products.length > 0 && products.every(p => selectedSkus.has(p.sku));
  const someSelected = products.some(p => selectedSkus.has(p.sku));
  const isSelectionMode = selectedSkus.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      // 取消全选（仅当前页）
      const newSet = new Set(selectedSkus);
      products.forEach(p => newSet.delete(p.sku));
      onSelectionChange(newSet);
    } else {
      // 全选当前页
      const newSet = new Set(selectedSkus);
      products.forEach(p => newSet.add(p.sku));
      onSelectionChange(newSet);
    }
  };

  const toggleOne = (sku: string, index?: number) => {
    const newSet = new Set(selectedSkus);
    if (newSet.has(sku)) {
      newSet.delete(sku);
    } else {
      newSet.add(sku);
    }
    onSelectionChange(newSet);
    if (index !== undefined) {
      setLastSelectedIndex(index);
    }
  };

  // 智能行点击：选择模式下点击行切换选择，否则打开详情
  const handleRowClick = (e: React.MouseEvent, product: LocalProduct, index: number) => {
    // Shift+点击：范围选择
    if (e.shiftKey && lastSelectedIndex !== null) {
      e.preventDefault();
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSet = new Set(selectedSkus);
      for (let i = start; i <= end; i++) {
        newSet.add(products[i].sku);
      }
      onSelectionChange(newSet);
      return;
    }

    // Ctrl/Cmd+点击：切换单个选择
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleOne(product.sku, index);
      return;
    }

    // 选择模式下：点击行切换选择
    if (isSelectionMode) {
      toggleOne(product.sku, index);
      return;
    }

    // 普通模式：打开详情
    onSelect(product);
  };
  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="text-center py-16 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{hasFilters ? '没有符合条件的商品' : '暂无商品数据'}</p>
          {!hasFilters && (
            <button
              onClick={onUpload}
              className="mt-4 inline-block px-4 py-2 text-sm text-white bg-gray-900 rounded-lg hover:bg-gray-800"
            >
              上架第一个商品
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 sm:px-4 py-3 sm:py-4 w-12 sm:w-14">
                <button
                  onClick={toggleAll}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  title={allSelected ? '取消全选' : '全选当前页'}
                >
                  {allSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : someSelected ? (
                    <MinusSquare className="w-5 h-5 text-blue-400" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
              </th>
              <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">图片</th>
              <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">SKU / 商品名称</th>
              <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">价格 (.com)</th>
              <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">类目</th>
              <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">状态</th>
              <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">赛季</th>
              <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">变体</th>
              <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
          {products.map((product, index) => {
            const mainPrice = getMainSitePrice(product);
            const mainStatus = getMainSiteStatus(product);
            const primaryWooId = product.woo_ids?.com;

            return (
              <tr
                key={product.sku}
                className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedSkus.has(product.sku) ? 'bg-blue-50' : ''}`}
                onClick={(e) => handleRowClick(e, product, index)}
              >
                {/* 选择框 */}
                <td className="px-3 sm:px-4 py-3 sm:py-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleOne(product.sku, index)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    {selectedSkus.has(product.sku) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </td>

                {/* 图片 */}
                <td className="px-4 sm:px-5 py-3 sm:py-4">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={product.images[0]}
                      alt=""
                      className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Package className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
                    </div>
                  )}
                </td>

                {/* SKU / 名称 */}
                <td className="px-4 sm:px-5 py-3 sm:py-4">
                  <div className="text-xs sm:text-sm text-blue-600 font-mono mb-1">{product.sku}</div>
                  <div className="text-sm sm:text-base font-medium text-gray-900 line-clamp-2 max-w-[280px] sm:max-w-[320px]">
                    {product.content?.com?.name || product.name || '-'}
                  </div>
                </td>

                {/* 价格 */}
                <td className="px-4 sm:px-5 py-3 sm:py-4">
                  <span className="text-sm sm:text-base font-medium">
                    {mainPrice ? `$${mainPrice}` : '-'}
                  </span>
                </td>

                {/* 类目 */}
                <td className="px-4 sm:px-5 py-3 sm:py-4">
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 max-w-[200px] sm:max-w-[240px]">
                    {(product.categories || []).map((cat, index) => (
                      <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded" title={cat}>
                        {cat}
                      </span>
                    ))}
                    {(!product.categories || product.categories.length === 0) && (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </div>
                </td>

                {/* 状态 */}
                <td className="px-4 sm:px-5 py-3 sm:py-4">
                  <span className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-full whitespace-nowrap ${
                    mainStatus === 'publish' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {mainStatus === 'publish' ? '已发布' : '草稿'}
                  </span>
                </td>

                {/* 属性 */}
                <td className="px-4 sm:px-5 py-3 sm:py-4">
                  {product.attributes?.season ? (
                    <span className="px-2.5 py-1 text-xs sm:text-sm bg-blue-50 text-blue-700 rounded-full font-medium whitespace-nowrap">
                      {product.attributes.season}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>

                {/* 变体 */}
                <td className="px-4 sm:px-5 py-3 sm:py-4" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const comVariations = product.variations?.com || [];
                    const variationCount = product.variation_counts?.com || comVariations.length;
                    
                    // 检查SKU不匹配的数量
                    const mismatchCount = comVariations.filter(v => {
                      if (!v.sku) return false;
                      return !v.sku.startsWith(product.sku) && !v.sku.includes(product.sku);
                    }).length;
                    
                    if (variationCount === 0) {
                      return <span className="text-xs text-gray-400">-</span>;
                    }
                    
                    return (
                      <button
                        onClick={(e) => handleShowVariations(product, e)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          mismatchCount > 0 
                            ? 'text-red-700 bg-red-50 hover:bg-red-100' 
                            : variationCount === 1 
                            ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100'
                            : 'text-purple-700 bg-purple-50 hover:bg-purple-100'
                        }`}
                        title={mismatchCount > 0 ? `${mismatchCount} 个变体 SKU 不匹配` : variationCount === 1 ? '仅1个变体' : '查看变体'}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{variationCount}</span>
                        {mismatchCount > 0 && <span className="text-red-500">⚠</span>}
                      </button>
                    );
                  })()}
                </td>

                {/* 操作 */}
                <td className="px-4 sm:px-5 py-3 sm:py-4">
                  <div className="flex items-center gap-1.5 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onSelect(product)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

                    {primaryWooId && (
                      <>
                        <a
                          href={`${SITE_URLS.com}/?p=${primaryWooId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="在主站查看"
                        >
                          <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
                        </a>
                        <button
                          onClick={() => onSync(product.sku)}
                          disabled={syncingSku === product.sku}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded disabled:opacity-50 transition-colors"
                          title="同步到站点"
                        >
                          {syncingSku === product.sku ? (
                            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
                          )}
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => onDelete(product.sku)}
                      disabled={deletingSku === product.sku}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-colors"
                      title="删除"
                    >
                      {deletingSku === product.sku ? (
                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <span className="text-sm text-gray-500">
            共 {total} 个商品
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">每页</span>
            <select
              value={perPage}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
              className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500">条</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <span className="text-sm sm:text-base text-gray-600 px-2">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* 变体详情模态框 */}
      {variationsModal && (
        <VariationsModal
          product={variationsModal.product}
          variations={variationsModal.variations}
          isLoading={variationsModal.isLoading}
          onClose={() => setVariationsModal(null)}
        />
      )}
    </div>
  );
}

