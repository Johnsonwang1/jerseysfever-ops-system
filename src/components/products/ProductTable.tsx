import { useState } from 'react';
import { Package, Eye, ExternalLink, Trash2, Loader2, ChevronLeft, ChevronRight, CheckSquare, Square, MinusSquare, RefreshCw, ChevronRightIcon } from 'lucide-react';
import { getMainSitePrice, getMainSiteStatus, type LocalProduct } from '../../lib/products';
import type { SiteKey } from '../../lib/types';

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
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-3 py-3 w-10">
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
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">图片</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU / 商品名称</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">价格 (.com)</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类目</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">赛季</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
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
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
                <td className="px-4 py-3">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={product.images[0]}
                      alt=""
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Package className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                </td>

                {/* SKU / 名称 */}
                <td className="px-4 py-3">
                  <div className="text-xs text-blue-600 font-mono mb-0.5">{product.sku}</div>
                  <div className="text-sm font-medium text-gray-900 line-clamp-1 max-w-[280px]">
                    {product.content?.com?.name || product.name || '-'}
                  </div>
                </td>

                {/* 价格 */}
                <td className="px-4 py-3">
                  <span className="text-sm font-medium">
                    {mainPrice ? `$${mainPrice}` : '-'}
                  </span>
                </td>

                      {/* 类目 */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {(product.categories || []).map((cat, index) => (
                      <span key={index} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded" title={cat}>
                        {cat}
                      </span>
                    ))}
                    {(!product.categories || product.categories.length === 0) && (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </div>
                </td>

                {/* 状态 */}
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    mainStatus === 'publish' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {mainStatus === 'publish' ? '已发布' : '草稿'}
                  </span>
                </td>

                {/* 属性 */}
                <td className="px-4 py-3">
                  {product.attributes?.season ? (
                    <span className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-full font-medium">
                      {product.attributes.season}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>

                {/* 操作 */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onSelect(product)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {primaryWooId && (
                      <>
                        <a
                          href={`${SITE_URLS.com}/?p=${primaryWooId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="在主站查看"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => onSync(product.sku)}
                          disabled={syncingSku === product.sku}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                          title="同步到站点"
                        >
                          {syncingSku === product.sku ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => onDelete(product.sku)}
                      disabled={deletingSku === product.sku}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                      title="删除"
                    >
                      {deletingSku === product.sku ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 分页 */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            共 {total} 个商品
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">每页</span>
            <select
              value={perPage}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500">条</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-1.5 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-1.5 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

