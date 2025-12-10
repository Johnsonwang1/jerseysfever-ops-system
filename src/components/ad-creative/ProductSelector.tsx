/**
 * 商品选择器
 */

import { useState, useMemo } from 'react';
import { X, Search, Package, Check } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import type { AdProductContext } from '@/lib/ad-creative/types';

interface ProductSelectorProps {
  currentSku?: string;
  onSelect: (product: AdProductContext) => void;
  onClose: () => void;
}

export function ProductSelector({
  currentSku,
  onSelect,
  onClose,
}: ProductSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: productsData, isLoading } = useProducts({});

  // 过滤商品
  const filteredProducts = useMemo(() => {
    const products = productsData?.products || [];
    if (!searchQuery.trim()) return products.slice(0, 50);

    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query) ||
        p.attributes?.team?.toLowerCase().includes(query)
    );
  }, [productsData?.products, searchQuery]);

  // 选择商品
  const handleSelect = (product: typeof filteredProducts[0]) => {
    const context: AdProductContext = {
      sku: product.sku,
      name: product.name,
      images: product.images || [],
      prices: product.prices || {},
      regular_prices: product.regular_prices,
      attributes: product.attributes,
    };
    onSelect(context);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden">
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索 SKU、名称或球队..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* 商品列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchQuery ? '未找到匹配的商品' : '暂无商品'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map((product) => {
                const isSelected = product.sku === currentSku;
                const imageUrl = product.images?.[0];

                return (
                  <button
                    key={product.sku}
                    onClick={() => handleSelect(product)}
                    className={`relative p-3 rounded-xl border text-left transition-all hover:shadow-md ${
                      isSelected
                        ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-500'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* 选中标记 */}
                    {isSelected && (
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

        {/* 底部提示 */}
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-500 text-center flex-shrink-0">
          显示 {filteredProducts.length} 个商品
          {searchQuery && ` (搜索: "${searchQuery}")`}
        </div>
      </div>
    </div>
  );
}
