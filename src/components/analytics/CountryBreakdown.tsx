// 国家分布组件

import { Globe } from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber, COUNTRY_NAMES } from '@/lib/fb-ads';

interface CountryData {
  country: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number;
  ctr: number;
}

interface CountryBreakdownProps {
  data: CountryData[];
}

export function CountryBreakdown({ data }: CountryBreakdownProps) {
  // 计算总花费用于百分比
  const totalSpend = data.reduce((sum, c) => sum + c.spend, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="p-4 sm:p-5 border-b flex items-center gap-3">
        <Globe className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg sm:text-xl font-medium text-gray-900">国家分布</h2>
      </div>

      <div className="p-4 sm:p-5">
        <div className="space-y-4">
          {data.map(country => {
            const percentage = totalSpend > 0 ? (country.spend / totalSpend) * 100 : 0;
            const countryName = COUNTRY_NAMES[country.country] || country.country;

            return (
              <div key={country.country} className="space-y-2">
                {/* 国家名称和花费 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getCountryFlag(country.country)}</span>
                    <span className="font-medium text-gray-900">{countryName}</span>
                    <span className="text-sm text-gray-400">({country.country})</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-purple-600">{formatCurrency(country.spend)}</span>
                    <span className="text-sm text-gray-400 ml-2">({percentage.toFixed(1)}%)</span>
                  </div>
                </div>

                {/* 进度条 */}
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {/* 详细指标 */}
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>展示: {formatNumber(country.impressions)}</span>
                  <span>点击: {formatNumber(country.clicks)}</span>
                  <span>CPC: {formatCurrency(country.cpc)}</span>
                  <span className={`${
                    country.ctr >= 3 ? 'text-green-600' :
                    country.ctr >= 1 ? 'text-gray-500' :
                    'text-red-500'
                  }`}>
                    CTR: {formatPercent(country.ctr)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 获取国家旗帜 emoji
function getCountryFlag(countryCode: string): string {
  const flags: Record<string, string> = {
    DE: '🇩🇪',
    FR: '🇫🇷',
    GB: '🇬🇧',
    US: '🇺🇸',
    IT: '🇮🇹',
    ES: '🇪🇸',
    NL: '🇳🇱',
    BE: '🇧🇪',
    AT: '🇦🇹',
    CH: '🇨🇭',
    PL: '🇵🇱',
    PT: '🇵🇹',
    SE: '🇸🇪',
    DK: '🇩🇰',
    NO: '🇳🇴',
    FI: '🇫🇮',
    IE: '🇮🇪',
    GR: '🇬🇷',
    CZ: '🇨🇿',
    RO: '🇷🇴',
    HU: '🇭🇺',
    SK: '🇸🇰',
    BG: '🇧🇬',
    HR: '🇭🇷',
    SI: '🇸🇮',
    LT: '🇱🇹',
    LV: '🇱🇻',
    EE: '🇪🇪',
    LU: '🇱🇺',
    MT: '🇲🇹',
    CY: '🇨🇾',
    CA: '🇨🇦',
    AU: '🇦🇺',
    JP: '🇯🇵',
    KR: '🇰🇷',
    CN: '🇨🇳',
    unknown: '🌍',
  };

  return flags[countryCode] || '🌍';
}
