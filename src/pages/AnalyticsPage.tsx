import { useState } from 'react';
import { BarChart3, ShoppingBag, Package, DollarSign, RotateCcw, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { formatRevenue } from '../lib/analytics';
import type { SiteKey } from '../lib/types';
import { getSiteLabel } from '../lib/orders';
import { DateRangePicker } from '../components/DateRangePicker';
import { getProductBySku, type LocalProduct } from '../lib/products';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { useAnalyticsData } from '../hooks/useAnalytics';

const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr'];

export function AnalyticsPage() {
  // 日期工具函数
  const getToday = () => new Date().toISOString().split('T')[0];
  const getDaysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };

  // 状态 - 默认显示近7天
  const [dateFrom, setDateFrom] = useState(getDaysAgo(6));
  const [dateTo, setDateTo] = useState(getToday);
  const [selectedSites, setSelectedSites] = useState<SiteKey[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LocalProduct | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);

  // React Query - 分析数据
  const { analytics, products, isLoading, error: analyticsError, refetch: loadData } = useAnalyticsData({
    dateFrom,
    dateTo,
    sites: selectedSites.length > 0 ? selectedSites : undefined,
    limit: 100,
  });

  const error = analyticsError ? (analyticsError as Error).message : null;

  // 切换站点筛选
  const toggleSite = (site: SiteKey) => {
    setSelectedSites(prev =>
      prev.includes(site)
        ? prev.filter(s => s !== site)
        : [...prev, site]
    );
  };

  // 点击商品打开详情
  const handleProductClick = async (sku: string) => {
    try {
      setLoadingProduct(true);
      const product = await getProductBySku(sku);
      if (product) {
        setSelectedProduct(product);
      } else {
        alert('商品不存在');
      }
    } catch (err) {
      console.error('加载商品失败:', err);
      alert('加载商品失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setLoadingProduct(false);
    }
  };

  // 显示的商品列表
  const displayProducts = showAllProducts ? products : products.slice(0, 10);

  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* 头部区域 - 不再固定 */}
      <div className="bg-gray-50 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6 space-y-4 sm:space-y-5">
        {/* 页面标题 */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 flex-shrink-0" />
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">销售分析</h1>
          <span className="hidden sm:inline text-sm text-gray-500">（基于订单数据统计）</span>
        </div>

        {/* 筛选区域 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-5">
            {/* 日期范围 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">日期范围</label>
              <DateRangePicker
                dateFrom={dateFrom}
                dateTo={dateTo}
                onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
              />
            </div>

            {/* 站点筛选 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">站点</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SITES.map(site => (
                  <button
                    key={site}
                    onClick={() => toggleSite(site)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      selectedSites.includes(site)
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {getSiteLabel(site)}
                  </button>
                ))}
                {selectedSites.length > 0 && (
                  <button
                    onClick={() => setSelectedSites([])}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                  >
                    全部
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6 space-y-5 sm:space-y-6">
        {/* 错误提示 */}
        {error && (
          <div className="p-4 sm:p-5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-700 break-words">{error}</span>
          </div>
        )}

        {/* 加载状态 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : analytics && (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* 订单数 */}
              <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4 mb-3">
                  <div className="p-2 sm:p-2.5 bg-blue-100 rounded-lg flex-shrink-0">
                    <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-500">有效订单</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900">{analytics.orderCount}</div>
                <div className="text-xs sm:text-sm text-gray-400 mt-1.5">已完成 + 处理中</div>
              </div>

              {/* 销售件数 */}
              <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4 mb-3">
                  <div className="p-2 sm:p-2.5 bg-green-100 rounded-lg flex-shrink-0">
                    <Package className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-500">销售件数</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900">{analytics.itemCount}</div>
                <div className="text-xs sm:text-sm text-gray-400 mt-1.5">商品总数量</div>
              </div>

              {/* 销售额 */}
              <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4 mb-3">
                  <div className="p-2 sm:p-2.5 bg-emerald-100 rounded-lg flex-shrink-0">
                    <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-500">销售额</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900">{formatRevenue(analytics.revenue)}</div>
                <div className="text-xs sm:text-sm text-gray-400 mt-1.5">有效订单总额</div>
              </div>

              {/* 退款额 */}
              <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4 mb-3">
                  <div className="p-2 sm:p-2.5 bg-red-100 rounded-lg flex-shrink-0">
                    <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-500">退款</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900">{formatRevenue(analytics.refunds)}</div>
                <div className="text-xs sm:text-sm text-gray-400 mt-1.5">{analytics.refundCount} 笔退款</div>
              </div>
            </div>

            {/* 每日趋势 */}
            {analytics.dailyStats.length > 1 && (
              <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
                <h2 className="text-lg sm:text-xl font-medium text-gray-900 mb-4 sm:mb-5">每日趋势</h2>
                <div className="overflow-x-auto">
                  <div className="min-w-[600px]">
                    {/* 简单的柱状图 */}
                    <div className="relative" style={{ height: '200px' }}>
                      <div className="flex items-end gap-1.5 sm:gap-2 h-full">
                        {(() => {
                          const maxRevenue = Math.max(...analytics.dailyStats.map(d => d.revenue));
                          return analytics.dailyStats.map(day => {
                            const heightPx = maxRevenue > 0 ? (day.revenue / maxRevenue) * 140 : 0;
                            return (
                              <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full relative">
                                {/* 金额数字 - 显示在柱状图上方 */}
                                <div className="absolute top-0 left-0 right-0 flex justify-center mb-2">
                                  <div className="text-xs sm:text-sm font-medium text-gray-700 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded shadow-sm">
                                    {formatRevenue(day.revenue)}
                                  </div>
                                </div>
                                {/* 柱状图 */}
                                <div
                                  className="w-full bg-emerald-500 rounded-t transition-all hover:bg-emerald-600 cursor-pointer relative group"
                                  style={{ height: `${Math.max(heightPx, 4)}px` }}
                                  title={`${day.date}: ${day.orderCount} 单, ${day.itemCount} 件, ${formatRevenue(day.revenue)}`}
                                />
                                {/* 日期标签 */}
                                <div className="text-xs sm:text-sm text-gray-400 mt-2 truncate w-full text-center">
                                  {day.date.slice(5)}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 商品销量排行 */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="p-4 sm:p-5 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <h2 className="text-lg sm:text-xl font-medium text-gray-900">商品销量排行</h2>
                <span className="text-sm sm:text-base text-gray-500">{products.length} 个商品</span>
              </div>

              {products.length === 0 ? (
                <div className="text-center py-12 text-gray-500 px-4">
                  暂无销售数据
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">排名</th>
                          <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">商品</th>
                          <th className="px-4 sm:px-5 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">销量</th>
                          <th className="px-4 sm:px-5 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">收入</th>
                          <th className="px-4 sm:px-5 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">退款</th>
                          <th className="px-4 sm:px-5 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">订单数</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayProducts.map((product, index) => (
                          <tr 
                            key={product.sku} 
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => handleProductClick(product.sku)}
                          >
                            <td className="px-4 sm:px-5 py-3 sm:py-4">
                              <span className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-medium ${
                                index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                index === 1 ? 'bg-gray-200 text-gray-700' :
                                index === 2 ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {index + 1}
                              </span>
                            </td>
                            <td className="px-4 sm:px-5 py-3 sm:py-4">
                              <div className="flex items-center gap-3 sm:gap-4">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg bg-gray-100 flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Package className="w-6 h-6 sm:w-7 sm:h-7 text-gray-400" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-mono text-xs sm:text-sm text-blue-600 hover:text-blue-700 truncate">{product.sku}</div>
                                  <div className="text-xs sm:text-sm text-gray-500 line-clamp-2 max-w-[200px] sm:max-w-[280px]">{product.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 sm:px-5 py-3 sm:py-4 text-right">
                              <span className="font-medium text-sm sm:text-base text-gray-900">{product.quantity}</span>
                              <span className="text-gray-500 text-xs sm:text-sm"> 件</span>
                            </td>
                            <td className="px-4 sm:px-5 py-3 sm:py-4 text-right font-medium text-sm sm:text-base text-emerald-600">
                              {formatRevenue(product.revenue)}
                            </td>
                            <td className="px-4 sm:px-5 py-3 sm:py-4 text-right text-xs sm:text-sm">
                              {product.refundQuantity > 0 ? (
                                <span className="text-red-600">
                                  -{product.refundQuantity} 件 / {formatRevenue(product.refundAmount)}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 sm:px-5 py-3 sm:py-4 text-right text-sm sm:text-base text-gray-600">
                              {product.orderCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 展开/收起 */}
                  {products.length > 10 && (
                    <div className="p-3 sm:p-4 border-t bg-gray-50">
                      <button
                        onClick={() => setShowAllProducts(!showAllProducts)}
                        className="w-full flex items-center justify-center gap-2 text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        {showAllProducts ? (
                          <>
                            <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                            收起
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                            显示全部 {products.length} 个商品
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* 商品详情弹窗 */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSaved={async () => {
            // 刷新分析数据
            await loadData();
          }}
        />
      )}

      {/* 加载商品时的遮罩 */}
      {loadingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 shadow-xl flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
            <span className="text-sm text-gray-600">加载商品详情...</span>
          </div>
        </div>
      )}
    </div>
  );
}
