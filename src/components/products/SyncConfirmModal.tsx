import { useState } from 'react';
import { X, RefreshCw, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { SITES } from '../../lib/attributes';
import type { SiteKey } from '../../lib/types';
import type { LocalProduct } from '../../lib/products';
import type { SyncResult } from '../../lib/sync-api';

interface SyncConfirmModalProps {
  product: LocalProduct;
  onClose: () => void;
  onConfirm: (sites: SiteKey[]) => Promise<void>;
  isSyncing: boolean;
  syncResults?: SyncResult[];
}

export function SyncConfirmModal({
  product,
  onClose,
  onConfirm,
  isSyncing,
  syncResults,
}: SyncConfirmModalProps) {
  // 默认选中所有已发布的站点
  const publishedSites = SITES.filter(site => product.woo_ids?.[site.key]).map(s => s.key);
  const [selectedSites, setSelectedSites] = useState<Set<SiteKey>>(new Set(publishedSites));

  const toggleSite = (site: SiteKey) => {
    const newSet = new Set(selectedSites);
    if (newSet.has(site)) {
      newSet.delete(site);
    } else {
      newSet.add(site);
    }
    setSelectedSites(newSet);
  };

  const handleConfirm = () => {
    if (selectedSites.size === 0) return;
    onConfirm(Array.from(selectedSites));
  };

  const hasResults = syncResults && syncResults.length > 0;
  const allSuccess = hasResults && syncResults.every(r => r.success);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 弹窗 */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-blue-600">
            <RefreshCw className="w-5 h-5" />
            <h3 className="text-lg font-semibold">同步商品到站点</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">
          {/* 商品信息 */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
            {product.images?.[0] ? (
              <img
                src={product.images[0]}
                alt=""
                className="w-12 h-12 object-cover rounded-lg border border-gray-200"
              />
            ) : (
              <div className="w-12 h-12 bg-gray-200 rounded-lg" />
            )}
            <div>
              <div className="text-xs text-blue-600 font-mono">{product.sku}</div>
              <div className="text-sm font-medium text-gray-900 line-clamp-1">
                {product.content?.com?.name || product.name || '-'}
              </div>
            </div>
          </div>

          {!hasResults ? (
            <>
              {/* 站点选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择要同步的站点
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SITES.map((site) => {
                    const hasWooId = !!product.woo_ids?.[site.key];
                    const isSelected = selectedSites.has(site.key);

                    return (
                      <button
                        key={site.key}
                        onClick={() => hasWooId && toggleSite(site.key)}
                        disabled={!hasWooId || isSyncing}
                        className={`flex items-center gap-2 p-3 border rounded-lg transition-colors ${
                          !hasWooId
                            ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                            : isSelected
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">{site.flag}</span>
                        <span className="text-sm font-medium">{site.name}</span>
                        {!hasWooId && (
                          <span className="text-xs text-gray-400 ml-auto">(未发布)</span>
                        )}
                        {hasWooId && isSelected && (
                          <CheckCircle className="w-4 h-4 text-blue-500 ml-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 说明 */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  将 PIM 中的商品数据（名称、描述、价格、库存、分类等）同步到选中的 WooCommerce 站点。
                </p>
              </div>
            </>
          ) : (
            /* 同步结果 */
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">同步结果：</p>
              {syncResults.map((result) => {
                const site = SITES.find(s => s.key === result.site);
                return (
                  <div
                    key={result.site}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      result.success ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{site?.flag}</span>
                      <span className="text-sm font-medium">{site?.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {result.success ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-700">已同步</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-600" />
                          <span className="text-sm text-red-700">{result.error || '失败'}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          {!hasResults ? (
            <>
              <button
                onClick={onClose}
                disabled={isSyncing}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSyncing || selectedSites.size === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    同步中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    开始同步
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm text-white rounded-lg ${
                allSuccess ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {allSuccess ? '完成' : '关闭'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
