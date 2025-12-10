// 销售趋势图表 - 实际销售额 + 销售 ROAS (按国家匹配)

import { useState } from 'react';
import { formatRevenue } from '@/lib/analytics';
import { formatCurrency } from '@/lib/fb-ads';
import type { DailyTrend } from '@/lib/fb-ads';
import type { SiteKey } from '@/lib/types';

interface DailyStat {
  date: string;
  orderCount: number;
  itemCount: number;
  revenue: number;
}

// 站点到国家的映射
const SITE_TO_COUNTRY: Record<string, string> = {
  de: 'DE',
  fr: 'FR',
  uk: 'GB',
  com: 'US',
};

// 站点到货币汇率 (转 USD)
const SITE_TO_RATE: Record<string, number> = {
  de: 1.05,   // EUR
  fr: 1.05,   // EUR
  uk: 1.27,   // GBP
  com: 1.00,  // USD
};

interface SalesTrendChartProps {
  salesData: DailyStat[];
  adsData?: DailyTrend[];
  selectedSites?: SiteKey[];  // 当前选中的站点，用于按国家匹配广告花费
}

type MetricKey = 'revenue' | 'roas';

export function SalesTrendChart({ salesData, adsData, selectedSites }: SalesTrendChartProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('revenue');

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

  // 计算每日销售 ROAS
  const dailyData = salesData.map(day => {
    let adSpend = 0;
    let revenueUSD = 0;

    if (selectedSites && selectedSites.length > 0) {
      // 按选中站点对应的国家匹配广告花费
      for (const site of selectedSites) {
        const country = SITE_TO_COUNTRY[site];
        const rate = SITE_TO_RATE[site];
        const key = `${day.date}|${country}`;
        adSpend += adsByDateCountry.get(key) || 0;
        // 假设该站点的销售额平均分配 (简化处理)
        revenueUSD += (day.revenue / selectedSites.length) * rate;
      }
    } else {
      // 全部站点：使用全部广告花费，假设主要是 EUR (DE)
      adSpend = adsByDate.get(day.date) || 0;
      revenueUSD = day.revenue * 1.05; // 默认 EUR
    }

    const salesRoas = adSpend > 0 ? revenueUSD / adSpend : 0;

    return {
      date: day.date,
      revenue: day.revenue,
      revenueUSD,
      orderCount: day.orderCount,
      itemCount: day.itemCount,
      adSpend,
      salesRoas,
    };
  });

  const hasAdsData = adsData && adsData.length > 0;

  const getValue = (d: typeof dailyData[0]) => activeMetric === 'revenue' ? d.revenue : d.salesRoas;
  const formatValue = (v: number) => activeMetric === 'revenue' ? formatRevenue(v) : `${v.toFixed(2)}x`;

  const values = dailyData.map(getValue);
  const maxValue = Math.max(...values, 0.01);

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-5">
        <h2 className="text-lg sm:text-xl font-medium text-gray-900">每日销售趋势</h2>

        {/* 指标切换 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
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
          {hasAdsData && (
            <button
              onClick={() => setActiveMetric('roas')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeMetric === 'roas'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              销售 ROAS
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="relative" style={{ height: '220px' }}>
            <div className="flex items-end gap-1.5 sm:gap-2 h-full">
              {dailyData.map((day) => {
                const value = getValue(day);
                const heightPx = maxValue > 0 ? (value / maxValue) * 160 : 0;

                let barColor = 'bg-emerald-500';
                if (activeMetric === 'roas') {
                  barColor = day.salesRoas >= 2 ? 'bg-emerald-500' : day.salesRoas >= 1 ? 'bg-amber-500' : day.salesRoas > 0 ? 'bg-red-400' : 'bg-gray-300';
                }

                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full relative group">
                    <div className="absolute top-0 left-0 right-0 flex justify-center">
                      <div className="text-xs font-medium text-gray-700 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                        {formatValue(value)}
                      </div>
                    </div>

                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <div className="bg-gray-800 text-white text-xs rounded px-2 py-1.5 whitespace-nowrap shadow-lg">
                        <div className="font-medium">{day.date}</div>
                        <div className="text-gray-300 mt-1 space-y-0.5">
                          <div>销售额: {formatRevenue(day.revenue)}</div>
                          <div>≈ ${Math.round(day.revenueUSD).toLocaleString()} USD</div>
                          <div>订单: {day.orderCount} 单 / {day.itemCount} 件</div>
                          {hasAdsData && (
                            <>
                              <div className="border-t border-gray-600 my-1 pt-1">
                                广告花费: {formatCurrency(day.adSpend)}
                              </div>
                              <div>销售 ROAS: {day.salesRoas > 0 ? `${day.salesRoas.toFixed(2)}x` : '无广告'}</div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-full ${barColor} rounded-t transition-all hover:opacity-80 cursor-pointer`}
                      style={{ height: `${Math.max(heightPx, 4)}px` }}
                    />

                    <div className="text-xs text-gray-400 mt-2 truncate w-full text-center">
                      {day.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 图例 */}
      {activeMetric === 'roas' && (
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
      )}

      {activeMetric === 'roas' && (
        <div className="text-xs text-gray-400 text-center mt-2">
          销售 ROAS = WooCommerce 实际销售 (USD) ÷ 对应国家 Facebook 广告花费
        </div>
      )}
    </div>
  );
}
