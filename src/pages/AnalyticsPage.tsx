// 数据分析页面 - Tab 结构 (销售分析 + 广告分析 + 商品分析)

import { useState } from 'react';
import { BarChart3, ShoppingCart, Megaphone, Package } from 'lucide-react';
import { SalesAnalyticsTab } from '@/components/analytics/SalesAnalyticsTab';
import { AdsAnalyticsTab } from '@/components/analytics/AdsAnalyticsTab';
import { ProductAdsAnalyticsTab } from '@/components/analytics/ProductAdsAnalyticsTab';
import { DateRangePicker } from '@/components/DateRangePicker';

type TabType = 'sales' | 'ads' | 'products';

// 默认日期：近 7 天
const getDefaultDates = () => {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);
  return {
    from: sevenDaysAgo.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  };
};

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('sales');
  const [dateRange, setDateRange] = useState(getDefaultDates());

  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* 头部区域 */}
      <div className="bg-gray-50 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6 space-y-4 sm:space-y-5">
        {/* 页面标题 */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 flex-shrink-0" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">数据分析</h1>
          </div>
          {/* 商品分析 Tab 使用统一的日期选择器 */}
          {activeTab === 'products' && (
            <DateRangePicker
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              onChange={(from, to) => setDateRange({ from, to })}
            />
          )}
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('sales')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'sales'
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            销售分析
          </button>
          <button
            onClick={() => setActiveTab('ads')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'ads'
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            广告分析
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'products'
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <Package className="w-4 h-4" />
            商品分析
          </button>
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6">
        {activeTab === 'sales' && <SalesAnalyticsTab />}
        {activeTab === 'ads' && <AdsAnalyticsTab />}
        {activeTab === 'products' && (
          <ProductAdsAnalyticsTab />
        )}
      </div>
    </div>
  );
}
