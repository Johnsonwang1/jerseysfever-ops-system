// 销售分析 Tab - 原有的订单数据分析内容

import { useState } from 'react';
import { ShoppingBag, Package, DollarSign, RotateCcw, Loader2, AlertCircle, ChevronDown, ChevronUp, Target } from 'lucide-react';
import { formatRevenue } from '@/lib/analytics';
import type { SiteKey } from '@/lib/types';
import { getSiteLabel } from '@/lib/orders';
import { DateRangePicker } from '@/components/DateRangePicker';
import { getProductBySku, type LocalProduct } from '@/lib/products';
import { ProductDetailModal } from '@/components/ProductDetailModal';
import { useAnalyticsData } from '@/hooks/useAnalytics';
import { useFbAdsSummary, useFbDailyTrendByCountry } from '@/hooks/useFacebookAds';
// formatCurrency is imported from fb-ads but not used directly - kept for consistency
import { SalesTrendChart } from './SalesTrendChart';

const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr'];

export function SalesAnalyticsTab() {
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

  // React Query - FB Ads 数据 (用于计算 ROAS)
  const { data: fbAdsSummary } = useFbAdsSummary({
    dateFrom,
    dateTo,
  });

  // React Query - FB 每日趋势按国家 (用于计算销售 ROAS)
  const { data: fbDailyTrendByCountry } = useFbDailyTrendByCountry({
    dateFrom,
    dateTo,
  });

  const error = analyticsError ? (analyticsError as Error).message : null;

  // 计算销售 ROAS (销售额 / 广告花费)
  // 注: 销售额按站点货币统一转 USD
  const getSalesRoas = () => {
    if (!analytics || !fbAdsSummary || fbAdsSummary.total_spend === 0) return null;
    // 汇率简化处理 (EUR=1.05, GBP=1.27, USD=1)
    const exchangeRates: Record<string, number> = { EUR: 1.05, GBP: 1.27, USD: 1 };
    const siteToCountry: Record<string, string> = { de: 'DE', fr: 'FR', uk: 'GB', com: 'US' };
    const siteToCurrency: Record<string, string> = { de: 'EUR', fr: 'EUR', uk: 'GBP', com: 'USD' };

    // 如果筛选了站点，只计算对应国家的广告花费
    let adSpend = fbAdsSummary.total_spend;
    let revenue = analytics.revenue;

    if (selectedSites.length > 0) {
      // 计算选中站点对应的广告花费
      adSpend = 0;
      for (const site of selectedSites) {
        const country = siteToCountry[site];
        if (fbAdsSummary.by_country[country]) {
          adSpend += fbAdsSummary.by_country[country].spend;
        }
      }
    }

    // 将销售额转为 USD (假设 analytics.revenue 按 selectedSites 已经过滤)
    // 简化: 如果选择单个站点,用该站点货币转换; 否则假设混合货币取平均
    let revenueInUSD = revenue;
    if (selectedSites.length === 1) {
      const currency = siteToCurrency[selectedSites[0]];
      revenueInUSD = revenue * exchangeRates[currency];
    } else if (selectedSites.length === 0) {
      // 混合多站点,粗略按 EUR 计算 (主要是 DE)
      revenueInUSD = revenue * exchangeRates.EUR;
    }

    if (adSpend === 0) return null;
    return {
      roas: revenueInUSD / adSpend,
      revenueUSD: revenueInUSD,
      adSpend,
    };
  };

  const salesRoas = getSalesRoas();

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
    <div className="space-y-5 sm:space-y-6">
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
          {/* ROAS 卡片行 - 与广告分析 UI 统一 */}
          {salesRoas && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {/* 销售 ROAS - 核心指标突出显示 */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-sm p-4 sm:p-5 text-white">
                <div className="flex items-center gap-3 sm:gap-4 mb-3">
                  <div className="p-2 sm:p-2.5 bg-white/20 rounded-lg flex-shrink-0">
                    <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <span className="text-sm sm:text-base text-white/90">销售 ROAS</span>
                </div>
                <div className="text-3xl sm:text-4xl font-bold">
                  {salesRoas.roas.toFixed(2)}x
                </div>
                <div className="text-xs sm:text-sm text-white/70 mt-1.5">
                  销售额 ${Math.round(salesRoas.revenueUSD).toLocaleString()} / 花费 ${Math.round(salesRoas.adSpend).toLocaleString()}
                </div>
              </div>

              {/* 销售额 (USD) */}
              <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4 mb-3">
                  <div className="p-2 sm:p-2.5 bg-emerald-100 rounded-lg flex-shrink-0">
                    <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-500">销售额</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                  ${Math.round(salesRoas.revenueUSD).toLocaleString()}
                </div>
                <div className="text-xs sm:text-sm text-gray-400 mt-1.5">WooCommerce 订单</div>
              </div>

              {/* 广告花费 */}
              <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4 mb-3">
                  <div className="p-2 sm:p-2.5 bg-purple-100 rounded-lg flex-shrink-0">
                    <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-500">广告花费</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                  ${Math.round(salesRoas.adSpend).toLocaleString()}
                </div>
                <div className="text-xs sm:text-sm text-gray-400 mt-1.5">Facebook Ads</div>
              </div>
            </div>
          )}

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

            {/* 原始销售额 */}
            <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4 mb-3">
                <div className="p-2 sm:p-2.5 bg-emerald-100 rounded-lg flex-shrink-0">
                  <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                </div>
                <span className="text-sm sm:text-base text-gray-500">原始销售额</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">{formatRevenue(analytics.revenue)}</div>
              <div className="text-xs sm:text-sm text-gray-400 mt-1.5">站点原始货币</div>
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

          {/* 每日销售趋势 - 销售额 + 销售 ROAS */}
          {analytics.dailyStats.length > 1 && (
            <SalesTrendChart
              salesData={analytics.dailyStats}
              adsData={fbDailyTrendByCountry}
              selectedSites={selectedSites.length > 0 ? selectedSites : undefined}
            />
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

      {/* 商品详情弹窗 */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSaved={async () => {
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
