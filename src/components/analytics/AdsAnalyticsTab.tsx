// 广告分析 Tab - Facebook Ads 数据

import { useState } from 'react';
import { Loader2, AlertCircle, TrendingUp, Eye, MousePointer, Target, RefreshCw, Info, DollarSign, Users, ShoppingCart, CreditCard, Percent } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import {
  useFbAdsAnalytics,
  useLastSyncTime,
} from '@/hooks/useFacebookAds';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/fb-ads';
import { CampaignTable } from './CampaignTable';
import { CountryBreakdown } from './CountryBreakdown';
import { DailyTrendChart } from './DailyTrendChart';

// 广告账户配置
const AD_ACCOUNTS = [
  { id: 'all', name: '全部', accountIds: [] },
  { id: 'de', name: 'DE', accountIds: ['1103277014970589'] },
  { id: 'uk', name: 'UK', accountIds: ['850857584136697'] },
  { id: 'fr', name: 'FR', accountIds: ['841672715090675'] },
  { id: 'us', name: 'US', accountIds: ['828014633150121'] },
] as const;

type AccountTab = typeof AD_ACCOUNTS[number]['id'];

// 率类指标卡片 - 主显示率，下方显示绝对值
interface RateCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  rate: string;              // 主显示：率
  rateColor?: string;
  absoluteValue: string;     // 下方：绝对值
  formula: string;
}

function RateCard({ icon, iconBg, label, rate, rateColor = 'text-gray-900', absoluteValue, formula }: RateCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5 relative group">
      {/* 计算说明 Tooltip */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <Info className="w-4 h-4 text-gray-300 hover:text-gray-500 cursor-help" />
          <div className="absolute right-0 top-6 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="font-medium mb-1">{label}</div>
            <div className="text-gray-300">{formula}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 ${iconBg} rounded-lg flex-shrink-0`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>

      {/* 主数值：率 */}
      <div className={`text-2xl sm:text-3xl font-bold ${rateColor}`}>
        {rate}
      </div>

      {/* 下方：绝对值 */}
      <div className="text-xs text-gray-400 mt-1.5">{absoluteValue}</div>
    </div>
  );
}

// 绝对值指标卡片 - 主显示数量
interface ValueCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string | number;
  valueColor?: string;
  subtitle?: string;
  formula: string;
}

function ValueCard({ icon, iconBg, label, value, valueColor = 'text-gray-900', subtitle, formula }: ValueCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5 relative group">
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <Info className="w-4 h-4 text-gray-300 hover:text-gray-500 cursor-help" />
          <div className="absolute right-0 top-6 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="font-medium mb-1">{label}</div>
            <div className="text-gray-300">{formula}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 ${iconBg} rounded-lg flex-shrink-0`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>

      <div className={`text-2xl sm:text-3xl font-bold ${valueColor}`}>
        {value}
      </div>

      {subtitle && (
        <div className="text-xs text-gray-400 mt-1.5">{subtitle}</div>
      )}
    </div>
  );
}

// 核心指标卡片 (带渐变背景)
interface HighlightCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle: string;
  formula: string;
  gradient: string;
}

function HighlightCard({ icon, label, value, subtitle, formula, gradient }: HighlightCardProps) {
  return (
    <div className={`${gradient} rounded-xl shadow-sm p-4 sm:p-5 text-white relative group`}>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <Info className="w-4 h-4 text-white/50 hover:text-white cursor-help" />
          <div className="absolute right-0 top-6 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="font-medium mb-1">{label}</div>
            <div className="text-gray-300">{formula}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
          {icon}
        </div>
        <span className="text-sm text-white/90">{label}</span>
      </div>
      <div className="text-3xl sm:text-4xl font-bold">{value}</div>
      <div className="text-xs sm:text-sm text-white/70 mt-1.5">{subtitle}</div>
    </div>
  );
}

export function AdsAnalyticsTab() {
  const getToday = () => new Date().toISOString().split('T')[0];
  const getDaysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };

  const [dateFrom, setDateFrom] = useState(getDaysAgo(6));
  const [dateTo, setDateTo] = useState(getToday);
  const [activeAccountTab, setActiveAccountTab] = useState<AccountTab>('all');

  const { data: lastSync } = useLastSyncTime();

  // 获取当前选中的账户ID列表
  const selectedAccount = AD_ACCOUNTS.find(a => a.id === activeAccountTab);
  const accountIds = selectedAccount?.accountIds.length ? [...selectedAccount.accountIds] : undefined;

  const {
    summary,
    campaigns,
    dailyTrend,
    countryBreakdown,
    isLoading,
    isError,
    error,
    refetch,
  } = useFbAdsAnalytics({
    dateFrom,
    dateTo,
    accountIds,
  });

  // 计算汇总转化指标
  const conversionSummary = campaigns?.reduce((acc, c) => ({
    purchases: acc.purchases + c.purchases,
    add_to_cart: acc.add_to_cart + c.add_to_cart,
    initiate_checkout: acc.initiate_checkout + c.initiate_checkout,
  }), { purchases: 0, add_to_cart: 0, initiate_checkout: 0 });

  const totalClicks = summary?.total_clicks || 0;
  const addToCartRate = totalClicks > 0 && conversionSummary ? (conversionSummary.add_to_cart / totalClicks) * 100 : 0;
  const checkoutRate = conversionSummary && conversionSummary.add_to_cart > 0 ? (conversionSummary.initiate_checkout / conversionSummary.add_to_cart) * 100 : 0;
  const cvr = totalClicks > 0 && conversionSummary ? (conversionSummary.purchases / totalClicks) * 100 : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 筛选区域 */}
      <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-5">
          {/* 账户 TAB 切换 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">广告账户</label>
            <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
              {AD_ACCOUNTS.map(account => (
                <button
                  key={account.id}
                  onClick={() => setActiveAccountTab(account.id)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeAccountTab === account.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {account.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">日期范围</label>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>

        {/* 同步状态显示 */}
        {lastSync && (() => {
          const lastSyncDate = new Date(lastSync);
          const now = new Date();
          const diffMinutes = Math.floor((now.getTime() - lastSyncDate.getTime()) / (1000 * 60));
          const isStale = diffMinutes > 30; // 超过 30 分钟认为数据过期

          return (
            <div className={`mt-3 flex items-center gap-2 text-xs ${isStale ? 'text-amber-600' : 'text-gray-500'}`}>
              {isStale ? (
                <AlertCircle className="w-3 h-3" />
              ) : (
                <Info className="w-3 h-3" />
              )}
              <span>
                数据更新于 {lastSyncDate.toLocaleString('zh-CN')}
                {isStale && ` (${diffMinutes} 分钟前，数据可能已过期)`}
              </span>
            </div>
          );
        })()}
      </div>

      {isError && (
        <div className="p-4 sm:p-5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-700 break-words">{error?.message || '加载数据失败'}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : summary && (
        <>
          {/* 第一行：核心指标 ROAS + 花费 + 收入 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            <HighlightCard
              icon={<Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
              label="FB ROAS"
              value={`${(summary.avg_roas || 0).toFixed(2)}x`}
              subtitle={`收入 $${formatNumber(summary.total_purchase_value || 0)} / 花费 $${formatNumber(summary.total_spend)}`}
              formula="= FB归因收入 ÷ 广告花费"
              gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
            />

            <HighlightCard
              icon={<TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
              label="广告花费"
              value={formatCurrency(summary.total_spend)}
              subtitle={`日均 ${formatCurrency(summary.total_spend / Math.max(1, dailyTrend?.length || 1))}`}
              formula="= 所有广告的 Spend 总和"
              gradient="bg-gradient-to-br from-purple-500 to-purple-600"
            />

            <HighlightCard
              icon={<DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
              label="FB 归因收入"
              value={formatCurrency(summary.total_purchase_value || 0)}
              subtitle="Pixel 追踪的购买价值"
              formula="= Facebook Pixel 归因的 Purchase Value 总和"
              gradient="bg-gradient-to-br from-blue-500 to-blue-600"
            />
          </div>

          {/* 第二行：流量效率指标（率优先） */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <RateCard
              icon={<Eye className="w-5 h-5 text-blue-600" />}
              iconBg="bg-blue-100"
              label="CPM"
              rate={formatCurrency(summary.avg_cpm)}
              formula="= 花费 ÷ 展示 × 1000"
              absoluteValue={`${formatNumber(summary.total_impressions)} 次展示`}
            />

            <RateCard
              icon={<MousePointer className="w-5 h-5 text-green-600" />}
              iconBg="bg-green-100"
              label="CPC"
              rate={formatCurrency(summary.avg_cpc)}
              formula="= 花费 ÷ 点击数"
              absoluteValue={`${formatNumber(summary.total_clicks)} 次点击`}
            />

            <RateCard
              icon={<Percent className="w-5 h-5 text-amber-600" />}
              iconBg="bg-amber-100"
              label="CTR"
              rate={formatPercent(summary.avg_ctr)}
              rateColor={summary.avg_ctr >= 3 ? 'text-emerald-600' : summary.avg_ctr >= 1 ? 'text-gray-900' : 'text-red-500'}
              formula="= 点击 ÷ 展示 × 100%"
              absoluteValue={summary.avg_ctr >= 3 ? '表现优秀' : summary.avg_ctr >= 1 ? '表现正常' : '有待提升'}
            />

            <ValueCard
              icon={<Users className="w-5 h-5 text-indigo-600" />}
              iconBg="bg-indigo-100"
              label="触达人数"
              value={formatNumber(summary.total_reach)}
              formula="去重后的独立用户数"
              subtitle="Unique Users"
            />
          </div>

          {/* 第三行：转化漏斗指标（率优先） */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <RateCard
              icon={<ShoppingCart className="w-5 h-5 text-orange-600" />}
              iconBg="bg-orange-100"
              label="加购率"
              rate={formatPercent(addToCartRate)}
              rateColor={addToCartRate >= 5 ? 'text-emerald-600' : addToCartRate >= 2 ? 'text-gray-900' : 'text-amber-600'}
              formula="= 加购 ÷ 点击 × 100%"
              absoluteValue={`${conversionSummary?.add_to_cart || 0} 次加购`}
            />

            <RateCard
              icon={<CreditCard className="w-5 h-5 text-cyan-600" />}
              iconBg="bg-cyan-100"
              label="结算率"
              rate={formatPercent(checkoutRate)}
              rateColor={checkoutRate >= 50 ? 'text-emerald-600' : checkoutRate >= 30 ? 'text-gray-900' : 'text-amber-600'}
              formula="= 结算 ÷ 加购 × 100%"
              absoluteValue={`${conversionSummary?.initiate_checkout || 0} 次结算`}
            />

            <RateCard
              icon={<Percent className="w-5 h-5 text-emerald-600" />}
              iconBg="bg-emerald-100"
              label="CVR"
              rate={formatPercent(cvr)}
              rateColor={cvr >= 2 ? 'text-emerald-600' : cvr >= 1 ? 'text-gray-900' : 'text-amber-600'}
              formula="= 购买 ÷ 点击 × 100%"
              absoluteValue={`${conversionSummary?.purchases || 0} 次购买`}
            />

            <ValueCard
              icon={<DollarSign className="w-5 h-5 text-pink-600" />}
              iconBg="bg-pink-100"
              label="购买数"
              value={conversionSummary?.purchases || 0}
              valueColor={conversionSummary && conversionSummary.purchases > 0 ? 'text-emerald-600' : 'text-gray-900'}
              formula="FB Pixel 追踪的 Purchase 事件"
              subtitle={conversionSummary && conversionSummary.purchases > 0 ? `CPA: ${formatCurrency(summary.total_spend / conversionSummary.purchases)}` : '-'}
            />
          </div>

          {/* 每日趋势 - 支持切换 花费/ROAS/CPM/CTR */}
          {dailyTrend && dailyTrend.length > 1 && (
            <DailyTrendChart data={dailyTrend} title="每日趋势" />
          )}

          {/* Campaign 表现 */}
          {campaigns && campaigns.length > 0 && (
            <CampaignTable campaigns={campaigns} dateFrom={dateFrom} dateTo={dateTo} />
          )}

          {/* 国家分布 */}
          {countryBreakdown && countryBreakdown.length > 0 && (
            <CountryBreakdown data={countryBreakdown} />
          )}

          {/* 无数据提示 */}
          {(!campaigns || campaigns.length === 0) && (!countryBreakdown || countryBreakdown.length === 0) && (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
              <div className="text-gray-400 mb-2">暂无广告数据</div>
              <div className="text-sm text-gray-500">请选择有投放数据的日期范围或账户</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
