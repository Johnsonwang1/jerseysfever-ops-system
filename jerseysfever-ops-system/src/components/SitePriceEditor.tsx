import { DollarSign, PoundSterling, Euro, Tag } from 'lucide-react';
import type { SiteKey } from '../lib/types';

interface SitePriceEditorProps {
  prices: Partial<Record<SiteKey, number>>;
  regularPrices?: Partial<Record<SiteKey, number>>;
  onChange: (prices: Partial<Record<SiteKey, number>>, regularPrices: Partial<Record<SiteKey, number>>) => void;
  syncStatus?: Partial<Record<SiteKey, string>>;
  disabled?: boolean;
}

const SITE_CONFIG: {
  key: SiteKey;
  label: string;
  flag: string;
  currency: string;
  icon: typeof DollarSign;
}[] = [
  { key: 'com', label: '.com (美国)', flag: '🇺🇸', currency: '$', icon: DollarSign },
  { key: 'uk', label: '.uk (英国)', flag: '🇬🇧', currency: '£', icon: PoundSterling },
  { key: 'de', label: '.de (德国)', flag: '🇩🇪', currency: '€', icon: Euro },
  { key: 'fr', label: '.fr (法国)', flag: '🇫🇷', currency: '€', icon: Euro },
];

export function SitePriceEditor({ 
  prices, 
  regularPrices = {}, 
  onChange, 
  syncStatus, 
  disabled 
}: SitePriceEditorProps) {
  
  const handlePriceChange = (site: SiteKey, value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    const numValue = parseFloat(sanitized) || 0;
    onChange(
      { ...prices, [site]: numValue },
      regularPrices
    );
  };

  const handleRegularPriceChange = (site: SiteKey, value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    const numValue = parseFloat(sanitized) || 0;
    onChange(
      prices,
      { ...regularPrices, [site]: numValue }
    );
  };

  // 批量设置所有站点价格
  const setAllPrices = (saleValue: string, regularValue: string) => {
    const saleNum = parseFloat(saleValue) || 0;
    const regularNum = parseFloat(regularValue) || 0;
    
    const newPrices: Partial<Record<SiteKey, number>> = {};
    const newRegularPrices: Partial<Record<SiteKey, number>> = {};
    
    SITE_CONFIG.forEach(site => {
      newPrices[site.key] = saleNum;
      if (regularNum > 0) {
        newRegularPrices[site.key] = regularNum;
      }
    });
    
    onChange(newPrices, newRegularPrices);
  };

  return (
    <div className="space-y-4">
      {/* 批量设置 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">批量设置所有站点</div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              id="batch-sale-price"
              placeholder="促销价"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              disabled={disabled}
            />
          </div>
          <div className="relative flex-1">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              id="batch-regular-price"
              placeholder="原价（划线价）"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              disabled={disabled}
            />
          </div>
          <button
            onClick={() => {
              const saleInput = document.getElementById('batch-sale-price') as HTMLInputElement;
              const regularInput = document.getElementById('batch-regular-price') as HTMLInputElement;
              if (saleInput?.value) {
                setAllPrices(saleInput.value, regularInput?.value || '');
                saleInput.value = '';
                if (regularInput) regularInput.value = '';
              }
            }}
            disabled={disabled}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            应用到全部
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          提示：原价留空则无划线效果，原价需大于促销价才会显示划线
        </div>
      </div>

      {/* 各站点价格 */}
      <div className="space-y-3">
        {SITE_CONFIG.map((site) => {
          const status = syncStatus?.[site.key];
          const Icon = site.icon;
          const salePrice = prices[site.key];
          const regularPrice = regularPrices[site.key];
          
          return (
            <div key={site.key} className="border border-gray-200 rounded-lg p-4">
              {/* 站点标题 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{site.flag}</span>
                  <span className="font-medium text-gray-900">{site.label}</span>
                </div>
                {status && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    status === 'synced' ? 'bg-green-100 text-green-700' :
                    status === 'error' ? 'bg-red-100 text-red-700' :
                    status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {status === 'synced' ? '已同步' :
                     status === 'error' ? '同步失败' :
                     status === 'pending' ? '待同步' : '未发布'}
                  </span>
                )}
              </div>
              
              {/* 价格输入 */}
              <div className="grid grid-cols-2 gap-3">
                {/* 促销价/现价 */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">促销价（现价）</label>
                  <div className="relative">
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
                    <input
                      type="text"
                      value={salePrice !== undefined ? salePrice.toString() : ''}
                      onChange={(e) => handlePriceChange(site.key, e.target.value)}
                      placeholder="0.00"
                      disabled={disabled}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-green-200 bg-green-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                
                {/* 原价/划线价 */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">原价（划线价）</label>
                  <div className="relative">
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={regularPrice !== undefined ? regularPrice.toString() : ''}
                      onChange={(e) => handleRegularPriceChange(site.key, e.target.value)}
                      placeholder="0.00"
                      disabled={disabled}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:cursor-not-allowed line-through decoration-red-400"
                    />
                  </div>
                </div>
              </div>
              
              {/* 价格预览 */}
              {(salePrice !== undefined || regularPrice !== undefined) && (
                <div className="mt-2 text-sm flex items-center gap-2">
                  <span className="text-gray-500">预览：</span>
                  {regularPrice && regularPrice > (salePrice || 0) ? (
                    <>
                      <span className="text-gray-400 line-through">{site.currency}{regularPrice}</span>
                      <span className="text-green-600 font-semibold">{site.currency}{salePrice || 0}</span>
                      <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                        -{Math.round((1 - (salePrice || 0) / regularPrice) * 100)}%
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-900 font-semibold">{site.currency}{salePrice || 0}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 价格提示 */}
      <div className="text-xs text-gray-500 bg-blue-50 rounded-lg p-3">
        <strong>提示：</strong>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li>各站点价格独立设置，同步时将使用对应站点的价格更新 WooCommerce</li>
          <li>如果某站点价格为空，同步时将使用主站（.com）价格</li>
          <li>原价需大于促销价才会显示划线效果</li>
        </ul>
      </div>
    </div>
  );
}
