// 销售趋势图表 - 销售额、ROAS、净利润、净利率

import { useState } from 'react';
import { formatRevenue } from '@/lib/analytics';
import type { DailyTrend } from '@/lib/fb-ads';
import type { SiteKey, DailyStat } from '@/lib/types';

// 站点到国家的映射
const SITE_TO_COUNTRY: Record<string, string> = {
  de: 'DE',
  fr: 'FR',
  uk: 'GB',
  com: 'US',
};

interface SalesTrendChartProps {
  salesData: DailyStat[];
  adsData?: DailyTrend[];
  selectedSites?: SiteKey[];  // 当前选中的站点，用于按国家匹配广告花费
}

type MetricKey = 'revenue' | 'roas' | 'netProfit' | 'netProfitRate' | 'orderCount' | 'adSpend' | 'aov';

export function SalesTrendChart({ salesData, adsData, selectedSites }: SalesTrendChartProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('netProfit');

  if (!salesData || salesData.length === 0) return null;

  // 将广告数据按日期和国家索引
  const adsByDateCountry = new Map<string, number>(); // key: "date|country"
  const adsByDate = new Map<string, number>(); // key: "date", value: total spend

  adsData?.forEach(d => {
    // 按日期+国家存储
    const key = `${d.date}|${d.country || 'unknown'}`;
    adsByDateCountry.set(key, (adsByDateCountry.get(key) || 0) + d.spend);
    // 按日期汇总
    adsByDate.set(d.date, (adsByDate.get(d.date) || 0) + d.spend);
  });

  // 计算每日数据
  const dailyData = salesData.map(day => {
    let adSpend = 0;

    if (selectedSites && selectedSites.length > 0) {
      // 按选中站点对应的国家匹配广告花费
      for (const site of selectedSites) {
        const country = SITE_TO_COUNTRY[site];
        const key = `${day.date}|${country}`;
        adSpend += adsByDateCountry.get(key) || 0;
      }
    } else {
      // 全部站点：使用全部广告花费
      adSpend = adsByDate.get(day.date) || 0;
    }

    // 净收入 = 毛收入 - 退款（使用后端计算的值或自己算）
    const netRevenue = day.netRevenue ?? (day.revenue - (day.refunds || 0));
    // 毛利润 = 净收入 - 成本（使用后端计算的值或自己算）
    const grossProfit = day.profit ?? (netRevenue - (day.cost || 0));
    // 净利润 = 毛利润 - 广告费
    const netProfit = grossProfit - adSpend;
    // 净利率 = 净利润 / 净收入 * 100
    const netProfitRate = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
    // ROAS = 净收入 / 广告费
    const salesRoas = adSpend > 0 ? netRevenue / adSpend : 0;

    // AOV = 净收入 / 订单数
    const aov = day.orderCount > 0 ? netRevenue / day.orderCount : 0;

    return {
      date: day.date,
      revenue: netRevenue,  // 显示净收入
      grossRevenue: day.revenue,
      refunds: day.refunds || 0,
      orderCount: day.orderCount,
      itemCount: day.itemCount,
      cost: day.cost || 0,
      adSpend,
      grossProfit,
      netProfit,
      netProfitRate,
      salesRoas,
      aov,
    };
  });

  const hasAdsData = adsData && adsData.length > 0;

  const getValue = (d: typeof dailyData[0]) => {
    switch (activeMetric) {
      case 'revenue': return d.revenue;
      case 'roas': return d.salesRoas;
      case 'netProfit': return d.netProfit;
      case 'netProfitRate': return d.netProfitRate;
      case 'orderCount': return d.orderCount;
      case 'adSpend': return d.adSpend;
      case 'aov': return d.aov;
      default: return d.netProfit;
    }
  };

  const formatValue = (v: number) => {
    switch (activeMetric) {
      case 'revenue': return formatRevenue(v);
      case 'roas': return `${v.toFixed(2)}x`;
      case 'netProfit': return `$${Math.round(v).toLocaleString()}`;
      case 'netProfitRate': return `${v.toFixed(1)}%`;
      case 'orderCount': return `${Math.round(v)}单`;
      case 'adSpend': return `$${Math.round(v).toLocaleString()}`;
      case 'aov': return `$${v.toFixed(0)}`;
      default: return `$${Math.round(v).toLocaleString()}`;
    }
  };

  const values = dailyData.map(getValue);
  // 对于可能有负值的指标（净利润、净利率），需要特殊处理
  const maxValue = Math.max(...values, 0.01);
  const minValue = Math.min(...values, 0);
  const hasNegative = minValue < 0;
  // 计算图表高度范围
  const range = hasNegative ? maxValue - minValue : maxValue;

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-5">
        <h2 className="text-lg sm:text-xl font-medium text-gray-900">每日趋势</h2>

        {/* 指标切换 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
          <button
            onClick={() => setActiveMetric('netProfit')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeMetric === 'netProfit'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            净利润
          </button>
          <button
            onClick={() => setActiveMetric('netProfitRate')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeMetric === 'netProfitRate'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            净利率
          </button>
          <button
            onClick={() => setActiveMetric('revenue')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeMetric === 'revenue'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            销售额
          </button>
          <button
            onClick={() => setActiveMetric('orderCount')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeMetric === 'orderCount'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            订单量
          </button>
          <button
            onClick={() => setActiveMetric('aov')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeMetric === 'aov'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            AOV
          </button>
          {hasAdsData && (
            <>
              <button
                onClick={() => setActiveMetric('adSpend')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeMetric === 'adSpend'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                花费
              </button>
              <button
                onClick={() => setActiveMetric('roas')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeMetric === 'roas'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ROAS
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="relative" style={{ height: '240px' }}>
            {/* 零线（当有负值时显示） */}
            {hasNegative && (
              <div 
                className="absolute left-0 right-0 border-t border-gray-300"
                style={{ 
                  bottom: `${((0 - minValue) / range) * 180 + 40}px`
                }}
              >
                <span className="absolute -top-2.5 -left-1 text-xs text-gray-400">0</span>
              </div>
            )}
            
            <div className="flex items-end gap-1.5 sm:gap-2 h-full pb-6">
              {dailyData.map((day) => {
                const value = getValue(day);
                const isNegative = value < 0;
                
                // 计算柱状图高度
                let heightPx: number;
                let bottomOffset: number;
                
                if (hasNegative) {
                  // 有负值时，从零线开始计算
                  const zeroPosition = ((0 - minValue) / range) * 180;
                  if (isNegative) {
                    heightPx = (Math.abs(value) / range) * 180;
                    bottomOffset = zeroPosition - heightPx;
                  } else {
                    heightPx = (value / range) * 180;
                    bottomOffset = zeroPosition;
                  }
                } else {
                  heightPx = range > 0 ? (value / range) * 180 : 0;
                  bottomOffset = 0;
                }

                // 根据指标和值确定颜色
                let barColor = 'bg-emerald-500';
                if (activeMetric === 'roas') {
                  barColor = day.salesRoas >= 2 ? 'bg-emerald-500' : day.salesRoas >= 1 ? 'bg-amber-500' : day.salesRoas > 0 ? 'bg-red-400' : 'bg-gray-300';
                } else if (activeMetric === 'netProfit' || activeMetric === 'netProfitRate') {
                  barColor = value >= 0 ? 'bg-emerald-500' : 'bg-red-500';
                } else if (activeMetric === 'orderCount') {
                  barColor = 'bg-blue-500';
                } else if (activeMetric === 'adSpend') {
                  barColor = 'bg-purple-500';
                } else if (activeMetric === 'aov') {
                  barColor = 'bg-cyan-500';
                }

                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center h-full relative group">
                    {/* 顶部数值 */}
                    <div className="absolute top-0 left-0 right-0 flex justify-center">
                      <div className={`text-xs font-medium px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap ${
                        isNegative ? 'text-red-600 bg-red-50' : 'text-gray-700 bg-white/90'
                      }`}>
                        {formatValue(value)}
                      </div>
                    </div>

                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <div className="bg-gray-800 text-white text-xs rounded px-2 py-1.5 whitespace-nowrap shadow-lg">
                        <div className="font-medium">{day.date}</div>
                        <div className="text-gray-300 mt-1 space-y-0.5">
                          <div>毛收入: ${Math.round(day.grossRevenue).toLocaleString()}</div>
                          <div className="text-red-300">退款: -${Math.round(day.refunds).toLocaleString()}</div>
                          <div>净收入: ${Math.round(day.revenue).toLocaleString()}</div>
                          <div className="text-cyan-300">订单: {day.orderCount}单 · AOV: ${day.aov.toFixed(0)}</div>
                          <div className="border-t border-gray-600 my-1 pt-1">
                            成本: ${Math.round(day.cost).toLocaleString()}
                          </div>
                          <div>毛利润: ${Math.round(day.grossProfit).toLocaleString()}</div>
                          <div className="text-pink-300">广告费: -${Math.round(day.adSpend).toLocaleString()}</div>
                          <div className={`border-t border-gray-600 my-1 pt-1 ${day.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            净利润: ${Math.round(day.netProfit).toLocaleString()} ({day.netProfitRate.toFixed(1)}%)
                          </div>
                          {hasAdsData && day.adSpend > 0 && (
                            <div>ROAS: {day.salesRoas.toFixed(2)}x</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 柱状图 */}
                    <div className="flex-1 w-full flex items-end relative">
                      <div
                        className={`w-full ${barColor} ${isNegative ? 'rounded-b' : 'rounded-t'} transition-all hover:opacity-80 cursor-pointer absolute`}
                        style={{ 
                          height: `${Math.max(heightPx, 4)}px`,
                          bottom: `${bottomOffset}px`
                        }}
                      />
                    </div>

                    <div className="text-xs text-gray-400 truncate w-full text-center">
                      {day.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 图例和说明 */}
      {activeMetric === 'roas' && (
        <>
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500"></span>
              ≥2x 盈利
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-500"></span>
              ≥1x 保本
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-400"></span>
              &lt;1x 亏损
            </span>
          </div>
          <div className="text-xs text-gray-400 text-center mt-2">
            ROAS = 净收入 ÷ 广告花费
          </div>
        </>
      )}

      {(activeMetric === 'netProfit' || activeMetric === 'netProfitRate') && (
        <>
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500"></span>
              盈利
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-500"></span>
              亏损
            </span>
          </div>
          <div className="text-xs text-gray-400 text-center mt-2">
            {activeMetric === 'netProfit' 
              ? '净利润 = 净收入 - 总成本 - 广告费'
              : '净利率 = 净利润 / 净收入 × 100%'
            }
          </div>
        </>
      )}
    </div>
  );
}
