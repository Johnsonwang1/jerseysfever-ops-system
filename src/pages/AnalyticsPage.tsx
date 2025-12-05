import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ShoppingBag, Package, DollarSign, RotateCcw, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getAnalytics, getProductRanking, formatRevenue } from '../lib/analytics';
import type { AnalyticsData, ProductStat, SiteKey } from '../lib/types';
import { getSiteLabel } from '../lib/orders';
import { DateRangePicker } from '../components/DateRangePicker';

const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr'];

export function AnalyticsPage() {
  // 日期工具函数
  const getToday = () => new Date().toISOString().split('T')[0];
  const getTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  // 状态
  const [dateFrom, setDateFrom] = useState(getToday);
  const [dateTo, setDateTo] = useState(getTomorrow);
  const [selectedSites, setSelectedSites] = useState<SiteKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [products, setProducts] = useState<ProductStat[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = {
        dateFrom,
        dateTo,
        sites: selectedSites.length > 0 ? selectedSites : undefined,
      };

      const [analyticsData, productData] = await Promise.all([
        getAnalytics(params),
        getProductRanking({ ...params, limit: 100 }),
      ]);

      setAnalytics(analyticsData);
      setProducts(productData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, selectedSites]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 切换站点筛选
  const toggleSite = (site: SiteKey) => {
    setSelectedSites(prev =>
      prev.includes(site)
        ? prev.filter(s => s !== site)
        : [...prev, site]
    );
  };

  // 显示的商品列表
  const displayProducts = showAllProducts ? products : products.slice(0, 10);

  return (
    <div className="h-full flex flex-col">
      {/* 固定头部区域 */}
      <div className="sticky top-0 z-20 bg-gray-50 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center gap-2 sm:gap-3">
          <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">销售分析</h1>
          <span className="hidden sm:inline text-sm text-gray-500">（基于订单数据统计）</span>
        </div>

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
      <div className="flex-1 px-4 lg:px-6 pb-4 lg:pb-6 overflow-auto space-y-6">
        {/* 错误提示 */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 订单数 */}
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <ShoppingBag className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm text-gray-500">有效订单</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">{analytics.orderCount}</div>
                <div className="text-xs text-gray-400 mt-1">已完成 + 处理中</div>
              </div>

              {/* 销售件数 */}
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Package className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-500">销售件数</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">{analytics.itemCount}</div>
                <div className="text-xs text-gray-400 mt-1">商品总数量</div>
              </div>

              {/* 销售额 */}
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-sm text-gray-500">销售额</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">{formatRevenue(analytics.revenue)}</div>
                <div className="text-xs text-gray-400 mt-1">有效订单总额</div>
              </div>

              {/* 退款额 */}
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <RotateCcw className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-sm text-gray-500">退款</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">{formatRevenue(analytics.refunds)}</div>
                <div className="text-xs text-gray-400 mt-1">{analytics.refundCount} 笔退款</div>
              </div>
            </div>

            {/* 每日趋势 */}
            {analytics.dailyStats.length > 1 && (
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <h2 className="text-lg font-medium text-gray-900 mb-4">每日趋势</h2>
                <div className="overflow-x-auto">
                  <div className="min-w-[600px]">
                    {/* 简单的柱状图 */}
                    <div className="flex items-end gap-1" style={{ height: '160px' }}>
                      {(() => {
                        const maxRevenue = Math.max(...analytics.dailyStats.map(d => d.revenue));
                        return analytics.dailyStats.map(day => {
                          const heightPx = maxRevenue > 0 ? (day.revenue / maxRevenue) * 120 : 0;
                          return (
                            <div key={day.date} className="flex-1 flex flex-col items-center justify-end">
                              <div className="text-xs text-gray-500 mb-1">{formatRevenue(day.revenue)}</div>
                              <div
                                className="w-full bg-emerald-500 rounded-t transition-all hover:bg-emerald-600 cursor-pointer"
                                style={{ height: `${Math.max(heightPx, 4)}px` }}
                                title={`${day.date}: ${day.orderCount} 单, ${day.itemCount} 件, ${formatRevenue(day.revenue)}`}
                              />
                              <div className="text-xs text-gray-400 mt-1 truncate w-full text-center">
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
            )}

            {/* 商品销量排行 */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">商品销量排行</h2>
                <span className="text-sm text-gray-500">{products.length} 个商品</span>
              </div>

              {products.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  暂无销售数据
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">排名</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">商品</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">销量</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收入</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">退款</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">订单数</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayProducts.map((product, index) => (
                          <tr key={product.sku} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                index === 1 ? 'bg-gray-200 text-gray-700' :
                                index === 2 ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {index + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-10 h-10 object-cover rounded-lg bg-gray-100"
                                  />
                                ) : (
                                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <Package className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                                <div>
                                  <div className="font-mono text-sm text-gray-900">{product.sku}</div>
                                  <div className="text-xs text-gray-500 line-clamp-1 max-w-[200px]">{product.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-medium text-gray-900">{product.quantity}</span>
                              <span className="text-gray-500 text-sm"> 件</span>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-emerald-600">
                              {formatRevenue(product.revenue)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {product.refundQuantity > 0 ? (
                                <span className="text-red-600">
                                  -{product.refundQuantity} 件 / {formatRevenue(product.refundAmount)}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {product.orderCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 展开/收起 */}
                  {products.length > 10 && (
                    <div className="p-3 border-t bg-gray-50">
                      <button
                        onClick={() => setShowAllProducts(!showAllProducts)}
                        className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900"
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
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
