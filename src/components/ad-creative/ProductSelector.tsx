/**
 * 商品选择器
 * 支持单选和多选模式，服务端搜索和分页
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Package, Check, Loader2 } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import type { AdProductContext } from '@/lib/ad-creative/types';

interface ProductSelectorProps {
  currentSkus?: string[];
  multiSelect?: boolean;
  onSelect: (products: AdProductContext[]) => void;
  onClose: () => void;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function ProductSelector({
  currentSkus = [],
  multiSelect = true,
  onSelect,
  onClose,
}: ProductSelectorProps) {
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<Map<string, AdProductContext>>(
    () => new Map()
  );

  // 防抖搜索
  const debouncedSearch = useDebounce(searchInput, 300);

  // 搜索变化时重置页码
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // 服务端搜索 + 分页
  const { data: productsData, isLoading, isFetching } = useProducts({
    page,
    perPage: 30,
    search: debouncedSearch || undefined,
  });

  const products = productsData?.products || [];
  const totalPages = productsData?.totalPages || 1;

  // 切换选中状态
  const toggleProduct = useCallback((product: typeof products[0]) => {
    const context: AdProductContext = {
      sku: product.sku,
      name: product.name,
      images: product.images || [],
      prices: product.prices || {},
      regular_prices: product.regular_prices,
      attributes: product.attributes,
    };

    if (multiSelect) {
      setSelectedProducts(prev => {
        const next = new Map(prev);
        if (next.has(product.sku)) {
          next.delete(product.sku);
        } else {
          next.set(product.sku, context);
        }
        return next;
      });
    } else {
      // 单选模式直接返回
      onSelect([context]);
    }
  }, [multiSelect, onSelect]);

  // 确认选择
  const handleConfirm = useCallback(() => {
    onSelect(Array.from(selectedProducts.values()));
  }, [onSelect, selectedProducts]);

  const isSelected = (sku: string) =>
    selectedProducts.has(sku) || currentSkus.includes(sku);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden"
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">选择商品</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="搜索 SKU、名称或球队..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            {isFetching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 animate-spin" />
            )}
          </div>
        </div>

        {/* 已选商品 */}
        {multiSelect && selectedProducts.size > 0 && (
          <div className="px-5 py-2 border-b border-gray-100 flex-shrink-0 bg-purple-50">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-purple-600 font-medium">已选:</span>
              {Array.from(selectedProducts.values()).map((product) => (
                <div
                  key={product.sku}
                  className="flex items-center gap-1 px-2 py-1 bg-white border border-purple-200 rounded-lg text-xs"
                >
                  {product.images?.[0] && (
                    <img src={product.images[0]} alt="" className="w-5 h-5 rounded object-cover" />
                  )}
                  <span className="text-gray-700 max-w-[100px] truncate">
                    {product.attributes?.team || product.sku}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedProducts(prev => {
                        const next = new Map(prev);
                        next.delete(product.sku);
                        return next;
                      });
                    }}
                    className="ml-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 商品列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading && products.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchInput ? '未找到匹配的商品' : '暂无商品'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {products.map((product) => {
                const selected = isSelected(product.sku);
                const imageUrl = product.images?.[0];

                return (
                  <button
                    key={product.sku}
                    onClick={() => toggleProduct(product)}
                    className={`relative p-3 rounded-xl border text-left transition-all hover:shadow-md ${
                      selected
                        ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-500'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* 选中标记 */}
                    {selected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}

                    {/* 商品图片 */}
                    <div className="aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* 商品信息 */}
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500 font-mono">
                        {product.sku}
                      </div>
                      <div className="text-sm font-medium text-gray-900 line-clamp-2">
                        {product.name}
                      </div>
                      {product.attributes?.team && (
                        <div className="text-xs text-purple-600">
                          {product.attributes.team}
                        </div>
                      )}
                      {product.prices?.com && (
                        <div className="text-sm font-semibold text-red-600">
                          ${product.prices.com}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 分页 + 底部操作栏 */}
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          {/* 分页控件 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一页
              </button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {multiSelect && selectedProducts.size > 0
                ? `已选择 ${selectedProducts.size} 个商品`
                : `第 ${page} 页，共 ${productsData?.total || 0} 个商品`}
              {searchInput && ` (搜索: "${searchInput}")`}
            </span>
            {multiSelect && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedProducts.size === 0}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  确认选择
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
