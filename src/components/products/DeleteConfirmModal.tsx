import { useState } from 'react';
import { X, AlertTriangle, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { SITES } from '../../lib/attributes';
import type { SiteKey } from '../../lib/types';
import type { LocalProduct } from '../../lib/products';

interface DeleteConfirmModalProps {
  product: LocalProduct;
  onClose: () => void;
  onConfirm: (sites: SiteKey[], deleteLocal: boolean) => Promise<void>;
  isDeleting: boolean;
  deleteResults?: { site: SiteKey; success: boolean; error?: string }[];
}

export function DeleteConfirmModal({
  product,
  onClose,
  onConfirm,
  isDeleting,
  deleteResults,
}: DeleteConfirmModalProps) {
  // 默认选中所有已发布的站点
  const publishedSites = SITES.filter(site => product.woo_ids?.[site.key]).map(s => s.key);
  const [selectedSites, setSelectedSites] = useState<Set<SiteKey>>(new Set(publishedSites));
  const [deleteLocal, setDeleteLocal] = useState(true);

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
    if (selectedSites.size === 0 && !deleteLocal) {
      return; // 至少要选择一个操作
    }
    onConfirm(Array.from(selectedSites), deleteLocal);
  };

  const hasResults = deleteResults && deleteResults.length > 0;
  const allSuccess = hasResults && deleteResults.every(r => r.success);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 弹窗 */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-lg font-semibold">删除商品确认</h3>
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
                  选择要删除的站点
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SITES.map((site) => {
                    const hasWooId = !!product.woo_ids?.[site.key];
                    const isSelected = selectedSites.has(site.key);

                    return (
                      <button
                        key={site.key}
                        onClick={() => hasWooId && toggleSite(site.key)}
                        disabled={!hasWooId || isDeleting}
                        className={`flex items-center gap-2 p-3 border rounded-lg transition-colors ${
                          !hasWooId
                            ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                            : isSelected
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">{site.flag}</span>
                        <span className="text-sm font-medium">{site.name}</span>
                        {!hasWooId && (
                          <span className="text-xs text-gray-400 ml-auto">(未发布)</span>
                        )}
                        {hasWooId && isSelected && (
                          <CheckCircle className="w-4 h-4 text-red-500 ml-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 删除本地数据选项 */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteLocal}
                    onChange={(e) => setDeleteLocal(e.target.checked)}
                    disabled={isDeleting}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700">同时删除本地数据库记录</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  勾选后将从 PIM 系统中完全移除此商品
                </p>
              </div>

              {/* 警告 */}
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>警告：</strong>此操作不可撤销！商品将从选中的 WooCommerce 站点永久删除。
                </p>
              </div>
            </>
          ) : (
            /* 删除结果 */
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">删除结果：</p>
              {deleteResults.map((result) => {
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
                          <span className="text-sm text-green-700">已删除</span>
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
              {deleteLocal && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
                  <span className="text-sm font-medium">本地数据库记录</span>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700">已删除</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          {!hasResults ? (
            <>
              <button
                onClick={onClose}
                disabled={isDeleting}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={isDeleting || (selectedSites.size === 0 && !deleteLocal)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    删除中...
                  </>
                ) : (
                  '确认删除'
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
