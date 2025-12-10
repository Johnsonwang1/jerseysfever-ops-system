/**
 * 商品上下文条
 * 显示当前选中的商品信息，支持切换商品
 */

import { Package, RefreshCw } from 'lucide-react';
import type { AdProductContext } from '@/lib/ad-creative/types';

interface ProductContextBarProps {
  product: AdProductContext | null;
  onChangeProduct: () => void;
}

export function ProductContextBar({ product, onChangeProduct }: ProductContextBarProps) {
  if (!product) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">未选择商品</p>
            <p className="text-xs text-amber-600">选择商品后开始生成广告图</p>
          </div>
        </div>
        <button
          onClick={onChangeProduct}
          className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
        >
          选择商品
        </button>
      </div>
    );
  }

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
        onClick={onChangeProduct}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        切换商品
      </button>
    </div>
  );
}
