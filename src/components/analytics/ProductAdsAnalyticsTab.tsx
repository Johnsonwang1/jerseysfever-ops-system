// 商品广告分析 Tab - 维度: SKU, 筛选: 日期、国家
// 只展示商品广告表现表格

import { useState } from 'react'
import { Package, ArrowUpDown, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { useProductAdsPerformance } from '@/hooks/useFacebookAds'
import { DateRangePicker } from '@/components/DateRangePicker'

type SortKey = 'spend' | 'cpc' | 'ctr' | 'impressions' | 'clicks' | 'revenue' | 'quantity' | 'order_count' | 'roas'
type HookSortKey = 'spend' | 'cpc' | 'ctr' | 'impressions' | 'clicks'

const COUNTRIES = [
  { value: 'all', label: '全部', flag: '🌍' },
  { value: 'DE', label: '德国', flag: '🇩🇪' },
  { value: 'FR', label: '法国', flag: '🇫🇷' },
  { value: 'GB', label: '英国', flag: '🇬🇧' },
]

// 默认日期：近 7 天
const getDefaultDates = () => {
  const today = new Date()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(today.getDate() - 6)
  return {
    from: sevenDaysAgo.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  }
}

export function ProductAdsAnalyticsTab() {
  const defaultDates = getDefaultDates()
  const [dateFrom, setDateFrom] = useState(defaultDates.from)
  const [dateTo, setDateTo] = useState(defaultDates.to)
  const [country, setCountry] = useState('all')
  const [sortBy, setSortBy] = useState<SortKey>('spend')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showAllProducts, setShowAllProducts] = useState(false)

  // 只有这些 key 会传给后端排序，其他的在前端排序
  const hookSortBy: HookSortKey | undefined = 
    ['spend', 'cpc', 'ctr', 'impressions', 'clicks'].includes(sortBy) 
      ? sortBy as HookSortKey 
      : 'spend';
  
  const { data: products, isLoading } = useProductAdsPerformance({
    dateFrom,
    dateTo,
    country,
    sortBy: hookSortBy,
    sortOrder,
    limit: 500,
  })

  // 排序处理
  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(key)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ column }: { column: SortKey }) => (
    <ArrowUpDown
      className={`w-3 h-3 ml-1 inline ${sortBy === column ? 'text-blue-500' : 'text-gray-400'}`}
    />
  )

  // 显示的商品列表
  const displayProducts = showAllProducts ? products : products?.slice(0, 20)

  return (
    <div className="space-y-4">
      {/* 筛选区域 */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* 日期范围 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">日期范围</label>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
            />
          </div>

          {/* 国家筛选 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">国家</label>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCountry(c.value)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    country === c.value
                      ? 'bg-gray-900 border-gray-900 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {c.flag} {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        /* 商品广告表现表格 */
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-600" />
              商品广告表现
            </h3>
            <span className="text-sm text-gray-500">共 {products?.length || 0} 个商品</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">商品</th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('spend')}
                  >
                    花费 <SortIcon column="spend" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('impressions')}
                  >
                    展示 <SortIcon column="impressions" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('clicks')}
                  >
                    点击 <SortIcon column="clicks" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('ctr')}
                  >
                    CTR <SortIcon column="ctr" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('cpc')}
                  >
                    CPC <SortIcon column="cpc" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('revenue')}
                  >
                    收入 <SortIcon column="revenue" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('quantity')}
                  >
                    销量 <SortIcon column="quantity" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('order_count')}
                  >
                    订单数 <SortIcon column="order_count" />
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort('roas')}
                  >
                    ROAS <SortIcon column="roas" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayProducts?.map((product, idx) => (
                  <tr key={`${product.sku}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-4">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.product_name}
                            className="w-20 h-20 object-cover rounded-xl border flex-shrink-0"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-gray-100 rounded-xl border flex items-center justify-center flex-shrink-0">
                            <Package className="w-8 h-8 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate max-w-[280px]" title={product.product_name}>
                            {product.product_name || product.sku}
                          </div>
                          <div className="text-xs text-gray-500 font-mono truncate">{product.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      ${product.spend.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {product.impressions.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {product.clicks.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-medium ${
                        product.ctr >= 2 ? 'text-green-600' : product.ctr >= 1 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {product.ctr.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-medium ${
                        product.cpc <= 0.3 ? 'text-green-600' : product.cpc <= 0.5 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        ${product.cpc.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-emerald-600">
                      ${product.revenue.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {product.quantity || 0}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {product.order_count || 0}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-medium ${
                        product.roas >= 2 ? 'text-green-600' : product.roas >= 1 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {product.roas.toFixed(2)}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(!products || products.length === 0) && (
            <div className="text-center py-12 text-gray-500">
              暂无数据
            </div>
          )}

          {/* 展开/收起按钮 */}
          {products && products.length > 20 && (
            <div className="p-4 border-t">
              <button
                onClick={() => setShowAllProducts(!showAllProducts)}
                className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1"
              >
                {showAllProducts ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    显示全部 {products.length} 个商品
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
