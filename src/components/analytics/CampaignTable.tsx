// Campaign 表现表格组件 - 支持下钻查看每日数据

import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronRight, Loader2 } from 'lucide-react';
import type { CampaignPerformance, CampaignDailyData } from '@/lib/fb-ads';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/fb-ads';
import { useCampaignDailyTrend } from '@/hooks/useFacebookAds';

interface CampaignTableProps {
  campaigns: CampaignPerformance[];
  dateFrom: string;
  dateTo: string;
}

// 每日详情子行组件
function CampaignDailyRow({ data }: { data: CampaignDailyData }) {
  return (
    <tr className="bg-gray-50/50 border-l-4 border-purple-200">
      {/* 日期 */}
      <td className="px-4 py-2">
        <div className="pl-8 text-sm text-gray-600">
          {data.date}
        </div>
      </td>
      {/* 花费 */}
      <td className="px-3 py-2 text-right text-sm text-gray-600">
        {formatCurrency(data.spend)}
      </td>
      {/* ROAS */}
      <td className="px-3 py-2 text-right">
        <span className={`text-sm ${
          data.roas >= 2 ? 'text-emerald-600' :
          data.roas >= 1 ? 'text-amber-600' :
          data.roas > 0 ? 'text-red-500' :
          'text-gray-400'
        }`}>
          {data.roas > 0 ? `${data.roas.toFixed(2)}x` : '-'}
        </span>
      </td>
      {/* CPM */}
      <td className="px-3 py-2 text-right text-sm text-gray-600">
        {data.cpm > 0 ? formatCurrency(data.cpm) : '-'}
      </td>
      {/* CPC */}
      <td className="px-3 py-2 text-right text-sm text-gray-600">
        {formatCurrency(data.cpc)}
      </td>
      {/* CTR */}
      <td className="px-3 py-2 text-right text-sm">
        <span className={`${
          data.ctr >= 3 ? 'text-emerald-600' :
          data.ctr >= 1 ? 'text-gray-600' :
          'text-red-500'
        }`}>
          {formatPercent(data.ctr)}
        </span>
      </td>
      {/* CVR */}
      <td className="px-3 py-2 text-right text-sm">
        <span className={`${
          data.cvr >= 2 ? 'text-emerald-600' :
          data.cvr >= 1 ? 'text-gray-600' :
          data.cvr > 0 ? 'text-amber-600' :
          'text-gray-400'
        }`}>
          {data.cvr > 0 ? formatPercent(data.cvr) : '-'}
        </span>
      </td>
      {/* 加购率 */}
      <td className="px-3 py-2 text-right text-sm">
        <span className={`${
          data.add_to_cart_rate >= 5 ? 'text-emerald-600' :
          data.add_to_cart_rate >= 2 ? 'text-gray-600' :
          data.add_to_cart_rate > 0 ? 'text-amber-600' :
          'text-gray-400'
        }`}>
          {data.add_to_cart_rate > 0 ? formatPercent(data.add_to_cart_rate) : '-'}
        </span>
      </td>
      {/* 结算率 */}
      <td className="px-3 py-2 text-right text-sm">
        <span className={`${
          data.checkout_rate >= 50 ? 'text-emerald-600' :
          data.checkout_rate >= 30 ? 'text-gray-600' :
          data.checkout_rate > 0 ? 'text-amber-600' :
          'text-gray-400'
        }`}>
          {data.checkout_rate > 0 ? formatPercent(data.checkout_rate) : '-'}
        </span>
      </td>
      {/* 购买 */}
      <td className="px-3 py-2 text-right text-sm">
        <span className={data.purchases > 0 ? 'text-emerald-600' : 'text-gray-400'}>
          {data.purchases || '-'}
        </span>
      </td>
      {/* 加购 */}
      <td className="px-3 py-2 text-right text-sm text-gray-600">
        {data.add_to_cart || '-'}
      </td>
      {/* 结算 */}
      <td className="px-3 py-2 text-right text-sm text-gray-600">
        {data.initiate_checkout || '-'}
      </td>
      {/* 点击 */}
      <td className="px-3 py-2 text-right text-sm text-gray-600">
        {formatNumber(data.clicks)}
      </td>
      {/* 展示 */}
      <td className="px-3 py-2 text-right text-sm text-gray-600">
        {formatNumber(data.impressions)}
      </td>
    </tr>
  );
}

// 展开的每日数据区域
function ExpandedDailyData({
  campaignId,
  dateFrom,
  dateTo
}: {
  campaignId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const { data: dailyData, isLoading, isError } = useCampaignDailyTrend({
    campaignId,
    dateFrom,
    dateTo,
  });

  if (isLoading) {
    return (
      <tr className="bg-gray-50/50">
        <td colSpan={14} className="px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            加载每日数据...
          </div>
        </td>
      </tr>
    );
  }

  if (isError || !dailyData?.length) {
    return (
      <tr className="bg-gray-50/50">
        <td colSpan={14} className="px-4 py-4 text-center text-gray-400 text-sm">
          暂无每日数据
        </td>
      </tr>
    );
  }

  return (
    <>
      {dailyData.map(day => (
        <CampaignDailyRow key={day.date} data={day} />
      ))}
    </>
  );
}

export function CampaignTable({ campaigns, dateFrom, dateTo }: CampaignTableProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  const displayCampaigns = showAll ? campaigns : campaigns.slice(0, 10);

  const toggleExpand = (campaignId: string) => {
    setExpandedCampaign(prev => prev === campaignId ? null : campaignId);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="p-4 sm:p-5 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h2 className="text-lg sm:text-xl font-medium text-gray-900">Campaign 表现</h2>
          <p className="text-xs text-gray-400 mt-0.5">点击行可查看每日明细</p>
        </div>
        <span className="text-sm sm:text-base text-gray-500">{campaigns.length} 个 Campaign</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                Campaign 名称
              </th>
              {/* 花费 */}
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                花费
              </th>
              {/* 计算度量值 */}
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                ROAS
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                CPM
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                CPC
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                CTR
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                CVR
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                加购率
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                结算率
              </th>
              {/* 绝对值 */}
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                购买
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                加购
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                结算
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                点击
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                展示
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayCampaigns.map((campaign, index) => {
              const isExpanded = expandedCampaign === campaign.campaign_id;
              return (
                <>
                  <tr
                    key={campaign.campaign_id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-purple-50/50' : ''}`}
                    onClick={() => toggleExpand(campaign.campaign_id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                          index === 0 ? 'bg-purple-100 text-purple-800' :
                          index === 1 ? 'bg-purple-50 text-purple-600' :
                          index === 2 ? 'bg-gray-100 text-gray-600' :
                          'bg-gray-50 text-gray-500'
                        }`}>
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                              {campaign.campaign_name}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 pl-6">
                            ID: {campaign.campaign_id.slice(-8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* 花费 */}
                    <td className="px-3 py-3 text-right font-medium text-purple-600 text-sm">
                      {formatCurrency(campaign.spend)}
                    </td>
                    {/* ROAS */}
                    <td className="px-3 py-3 text-right">
                      <span className={`font-semibold text-sm ${
                        campaign.roas >= 2 ? 'text-emerald-600' :
                        campaign.roas >= 1 ? 'text-amber-600' :
                        campaign.roas > 0 ? 'text-red-500' :
                        'text-gray-400'
                      }`}>
                        {campaign.roas > 0 ? `${campaign.roas.toFixed(2)}x` : '-'}
                      </span>
                    </td>
                    {/* CPM */}
                    <td className="px-3 py-3 text-right text-sm text-gray-600">
                      {campaign.cpm > 0 ? formatCurrency(campaign.cpm) : '-'}
                    </td>
                    {/* CPC */}
                    <td className="px-3 py-3 text-right text-sm text-gray-600">
                      {formatCurrency(campaign.cpc)}
                    </td>
                    {/* CTR */}
                    <td className="px-3 py-3 text-right text-sm">
                      <span className={`${
                        campaign.ctr >= 3 ? 'text-emerald-600' :
                        campaign.ctr >= 1 ? 'text-gray-600' :
                        'text-red-500'
                      }`}>
                        {formatPercent(campaign.ctr)}
                      </span>
                    </td>
                    {/* CVR */}
                    <td className="px-3 py-3 text-right text-sm">
                      <span className={`${
                        campaign.cvr >= 2 ? 'text-emerald-600' :
                        campaign.cvr >= 1 ? 'text-gray-600' :
                        campaign.cvr > 0 ? 'text-amber-600' :
                        'text-gray-400'
                      }`}>
                        {campaign.cvr > 0 ? formatPercent(campaign.cvr) : '-'}
                      </span>
                    </td>
                    {/* 加购率 */}
                    <td className="px-3 py-3 text-right text-sm">
                      <span className={`${
                        campaign.add_to_cart_rate >= 5 ? 'text-emerald-600' :
                        campaign.add_to_cart_rate >= 2 ? 'text-gray-600' :
                        campaign.add_to_cart_rate > 0 ? 'text-amber-600' :
                        'text-gray-400'
                      }`}>
                        {campaign.add_to_cart_rate > 0 ? formatPercent(campaign.add_to_cart_rate) : '-'}
                      </span>
                    </td>
                    {/* 结算率 */}
                    <td className="px-3 py-3 text-right text-sm">
                      <span className={`${
                        campaign.checkout_rate >= 50 ? 'text-emerald-600' :
                        campaign.checkout_rate >= 30 ? 'text-gray-600' :
                        campaign.checkout_rate > 0 ? 'text-amber-600' :
                        'text-gray-400'
                      }`}>
                        {campaign.checkout_rate > 0 ? formatPercent(campaign.checkout_rate) : '-'}
                      </span>
                    </td>
                    {/* 购买 */}
                    <td className="px-3 py-3 text-right text-sm">
                      <span className={campaign.purchases > 0 ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                        {campaign.purchases || '-'}
                      </span>
                    </td>
                    {/* 加购 */}
                    <td className="px-3 py-3 text-right text-sm text-gray-600">
                      {campaign.add_to_cart || '-'}
                    </td>
                    {/* 结算 */}
                    <td className="px-3 py-3 text-right text-sm text-gray-600">
                      {campaign.initiate_checkout || '-'}
                    </td>
                    {/* 点击 */}
                    <td className="px-3 py-3 text-right text-sm text-gray-600">
                      {formatNumber(campaign.clicks)}
                    </td>
                    {/* 展示 */}
                    <td className="px-3 py-3 text-right text-sm text-gray-600">
                      {formatNumber(campaign.impressions)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <ExpandedDailyData
                      campaignId={campaign.campaign_id}
                      dateFrom={dateFrom}
                      dateTo={dateTo}
                    />
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 展开/收起 */}
      {campaigns.length > 10 && (
        <div className="p-3 sm:p-4 border-t bg-gray-50">
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full flex items-center justify-center gap-2 text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
          >
            {showAll ? (
              <>
                <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                收起
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                显示全部 {campaigns.length} 个 Campaign
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
