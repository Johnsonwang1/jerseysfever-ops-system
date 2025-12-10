// 每日趋势图表组件 - 支持多指标切换

import { useState } from 'react';
import type { DailyTrend } from '@/lib/fb-ads';
import { formatCurrency, formatPercent } from '@/lib/fb-ads';

interface DailyTrendChartProps {
  data: DailyTrend[];
  title?: string;
}

type MetricKey = 'spend' | 'roas' | 'cpm' | 'ctr';

const METRICS: { key: MetricKey; label: string; color: string; format: (v: number) => string }[] = [
  { key: 'spend', label: '花费', color: 'bg-purple-500', format: (v) => formatCurrency(v) },
  { key: 'roas', label: 'ROAS', color: 'bg-emerald-500', format: (v) => `${v.toFixed(2)}x` },
  { key: 'cpm', label: 'CPM', color: 'bg-blue-500', format: (v) => formatCurrency(v) },
  { key: 'ctr', label: 'CTR', color: 'bg-amber-500', format: (v) => formatPercent(v) },
];

export function DailyTrendChart({ data, title = '每日趋势' }: DailyTrendChartProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('spend');

  if (!data || data.length === 0) return null;

  const metric = METRICS.find(m => m.key === activeMetric)!;
  const values = data.map(d => d[activeMetric] || 0);
  const maxValue = Math.max(...values, 0.01); // 避免除零

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-5">
        <h2 className="text-lg sm:text-xl font-medium text-gray-900">{title}</h2>

        {/* 指标切换 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => setActiveMetric(m.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeMetric === m.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="relative" style={{ height: '220px' }}>
            <div className="flex items-end gap-1.5 sm:gap-2 h-full">
              {data.map((day, _index) => {
                const value = day[activeMetric] || 0;
                const heightPx = maxValue > 0 ? (value / maxValue) * 160 : 0;

                // 颜色渐变：ROAS 和 CTR 根据值变色
                let barColor = metric.color;
                if (activeMetric === 'roas') {
                  barColor = value >= 2 ? 'bg-emerald-500' : value >= 1 ? 'bg-amber-500' : 'bg-red-400';
                } else if (activeMetric === 'ctr') {
                  barColor = value >= 3 ? 'bg-emerald-500' : value >= 1 ? 'bg-amber-500' : 'bg-red-400';
                }

                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full relative group">
                    {/* 数值标签 */}
                    <div className="absolute top-0 left-0 right-0 flex justify-center">
                      <div className="text-xs font-medium text-gray-700 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                        {metric.format(value)}
                      </div>
                    </div>

                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <div className="bg-gray-800 text-white text-xs rounded px-2 py-1.5 whitespace-nowrap shadow-lg">
                        <div className="font-medium">{day.date}</div>
                        <div className="text-gray-300 mt-1 space-y-0.5">
                          <div>花费: {formatCurrency(day.spend || 0)}</div>
                          <div>ROAS: {(day.roas || 0).toFixed(2)}x</div>
                          <div>CPM: {formatCurrency(day.cpm || 0)}</div>
                          <div>CTR: {formatPercent(day.ctr || 0)}</div>
                        </div>
                      </div>
                    </div>

                    {/* 柱子 */}
                    <div
                      className={`w-full ${barColor} rounded-t transition-all hover:opacity-80 cursor-pointer`}
                      style={{ height: `${Math.max(heightPx, 4)}px` }}
                    />

                    {/* 日期 */}
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

      {/* 图例说明 */}
      {(activeMetric === 'roas' || activeMetric === 'ctr') && (
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-emerald-500"></span>
            {activeMetric === 'roas' ? '≥2x 优秀' : '≥3% 优秀'}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-500"></span>
            {activeMetric === 'roas' ? '≥1x 正常' : '≥1% 正常'}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-400"></span>
            {activeMetric === 'roas' ? '<1x 亏损' : '<1% 待优化'}
          </span>
        </div>
      )}
    </div>
  );
}
