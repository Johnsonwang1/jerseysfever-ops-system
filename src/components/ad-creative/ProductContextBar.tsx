/**
 * 商品上下文条
 * 显示当前选中的商品信息，支持多商品和切换
 */

import { Package, RefreshCw, X } from 'lucide-react';
import type { AdProductContext } from '@/lib/ad-creative/types';

interface ProductContextBarProps {
  products: AdProductContext[];
  onChangeProducts: () => void;
  onRemoveProduct?: (sku: string) => void;
}

export function ProductContextBar({ products, onChangeProducts, onRemoveProduct }: ProductContextBarProps) {
  if (products.length === 0) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">未关联商品</p>
            <p className="text-xs text-gray-400">可直接上传图片生成广告图，或选择商品获取更多上下文</p>
          </div>
        </div>
        <button
          onClick={onChangeProducts}
          className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          选择商品
        </button>
      </div>
    );
  }

  // 单个商品显示详细信息
  if (products.length === 1) {
    const product = products[0];
    const price = product.prices?.com;
    const originalPrice = product.regular_prices?.com;
    const hasDiscount = originalPrice && price && originalPrice > price;

    return (
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          {/* 商品图 */}
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-12 h-12 object-cover rounded-lg border border-gray-200"
            />
          ) : (
            <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-gray-400" />
            </div>
          )}

          {/* 商品信息 */}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate max-w-[300px]">
              {product.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {/* 价格 */}
              {price && (
                <span className="text-sm font-semibold text-green-600">
                  ${price}
                </span>
              )}
              {hasDiscount && (
                <>
                  <span className="text-xs text-gray-400 line-through">
                    ${originalPrice}
                  </span>
                  <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                    {Math.round((1 - price / originalPrice) * 100)}% OFF
                  </span>
                </>
              )}

              {/* 球队/赛季 */}
              {product.attributes?.team && (
                <span className="text-xs text-gray-500">
                  • {product.attributes.team}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 切换按钮 */}
        <button
          onClick={onChangeProducts}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          切换商品
        </button>
      </div>
    );
  }

  // 多个商品显示缩略图列表
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-3">
        <div className="flex items-center -space-x-2">
          {products.slice(0, 4).map((product, index) => (
            <div
              key={product.sku}
              className="relative group"
              style={{ zIndex: products.length - index }}
            >
              {product.images?.[0] ? (
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-10 h-10 object-cover rounded-lg border-2 border-white shadow-sm"
                  title={product.name}
                />
              ) : (
                <div className="w-10 h-10 bg-gray-200 rounded-lg border-2 border-white flex items-center justify-center">
                  <Package className="w-5 h-5 text-gray-400" />
                </div>
              )}
              {onRemoveProduct && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveProduct(product.sku);
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {products.length > 4 && (
            <div className="w-10 h-10 bg-gray-300 rounded-lg border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600">
              +{products.length - 4}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            已选择 {products.length} 个商品
          </p>
          <p className="text-xs text-gray-500 truncate max-w-[250px]">
            {products.map(p => p.attributes?.team || p.name.slice(0, 10)).join(', ')}
          </p>
        </div>
      </div>

      {/* 切换按钮 */}
      <button
        onClick={onChangeProducts}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        管理商品
      </button>
    </div>
  );
}
