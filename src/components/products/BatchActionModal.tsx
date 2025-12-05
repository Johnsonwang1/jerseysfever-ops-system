import { useState } from 'react';
import { X, RefreshCw, Trash2, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { SITES } from '../../lib/attributes';
import type { SiteKey } from '../../lib/types';
import type { LocalProduct } from '../../lib/products';

type ActionType = 'sync' | 'delete';

interface BatchResult {
  sku: string;
  success: boolean;
  error?: string;
}

interface BatchActionModalProps {
  action: ActionType;
  products: LocalProduct[];
  onClose: () => void;
  onConfirm: (sites: SiteKey[], deleteLocal?: boolean) => Promise<void>;
  isProcessing: boolean;
  results?: BatchResult[];
}

export function BatchActionModal({
  action,
  products,
  onClose,
  onConfirm,
  isProcessing,
  results,
}: BatchActionModalProps) {
  const isSync = action === 'sync';

  // 收集所有已发布的站点
  const allPublishedSites = new Set<SiteKey>();
  products.forEach(p => {
    SITES.forEach(site => {
      if (p.woo_ids?.[site.key]) {
        allPublishedSites.add(site.key);
      }
    });
  });

  // 同步和删除都支持多选
  const [selectedSites, setSelectedSites] = useState<Set<SiteKey>>(
    new Set(allPublishedSites)
  );
  const [deleteLocal, setDeleteLocal] = useState(true);

  const toggleSite = (site: SiteKey) => {
    // 多选模式
    const newSet = new Set(selectedSites);
    if (newSet.has(site)) {
      newSet.delete(site);
    } else {
      newSet.add(site);
    }
    setSelectedSites(newSet);
  };

  const handleConfirm = () => {
    if (action === 'sync' && selectedSites.size === 0) return;
    if (action === 'delete' && selectedSites.size === 0 && !deleteLocal) return;
    onConfirm(Array.from(selectedSites), deleteLocal);
  };

  const hasResults = results && results.length > 0;
  const successCount = hasResults ? results.filter(r => r.success).length : 0;
  const allSuccess = hasResults && successCount === results.length;

  const title = isSync ? '批量同步商品' : '批量删除商品';
  const icon = isSync ? <RefreshCw className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />;
  const iconColor = isSync ? 'text-blue-600' : 'text-red-600';
  const buttonColor = isSync ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700';
  const selectedColor = isSync ? 'border-blue-300 bg-blue-50' : 'border-red-300 bg-red-50';
  const checkColor = isSync ? 'text-blue-500' : 'text-red-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 弹窗 */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className={`flex items-center gap-2 ${iconColor}`}>
            {icon}
            <h3 className="text-lg font-semibold">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {/* 商品数量提示 */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">
              已选择 <strong>{products.length}</strong> 个商品
            </p>
            <div className="mt-2 max-h-24 overflow-y-auto">
              <div className="flex flex-wrap gap-1">
                {products.slice(0, 10).map(p => (
                  <span key={p.sku} className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                    {p.sku}
                  </span>
                ))}
                {products.length > 10 && (
                  <span className="text-xs text-gray-500">...还有 {products.length - 10} 个</span>
                )}
              </div>
            </div>
          </div>

          {!hasResults ? (
            <>
              {/* 站点选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isSync ? '选择同步目标站点' : '选择删除站点'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SITES.map((site) => {
                    const hasAnyProduct = allPublishedSites.has(site.key);
                    const isSelected = selectedSites.has(site.key);

                    return (
                      <button
                        key={site.key}
                        onClick={() => hasAnyProduct && toggleSite(site.key)}
                        disabled={!hasAnyProduct || isProcessing}
                        className={`flex items-center gap-2 p-3 border rounded-lg transition-colors ${
                          !hasAnyProduct
                            ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                            : isSelected
                            ? selectedColor
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">{site.flag}</span>
                        <span className="text-sm font-medium">{site.name}</span>
                        {hasAnyProduct && isSelected && (
                          <CheckCircle className={`w-4 h-4 ${checkColor} ml-auto`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 删除本地数据选项（仅删除时显示） */}
              {!isSync && (
                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteLocal}
                      onChange={(e) => setDeleteLocal(e.target.checked)}
                      disabled={isProcessing}
                      className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700">同时删除本地数据库记录</span>
                  </label>
                </div>
              )}

              {/* 警告/说明 */}
              <div className={`p-3 rounded-lg ${isSync ? 'bg-blue-50 border border-blue-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                <p className={`text-sm ${isSync ? 'text-blue-800' : 'text-yellow-800'}`}>
                  {isSync ? (
                    <>将 PIM 中的商品数据推送到选中的站点，包括：名称、描述、价格、库存、图片等。</>
                  ) : (
                    <><strong>警告：</strong>此操作不可撤销！商品将从选中的站点永久删除。</>
                  )}
                </p>
              </div>
            </>
          ) : (
            /* 操作结果 */
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">操作结果：</p>
                <span className={`text-sm ${allSuccess ? 'text-green-600' : 'text-orange-600'}`}>
                  成功 {successCount}/{results.length}
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {results.map((result) => (
                  <div
                    key={result.sku}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      result.success ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    <span className="text-xs font-mono text-gray-600">{result.sku}</span>
                    <div className="flex items-center gap-1">
                      {result.success ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-600" />
                          <span className="text-xs text-red-600">{result.error || '失败'}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          {!hasResults ? (
            <>
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={isProcessing || (isSync && selectedSites.size === 0) || (!isSync && selectedSites.size === 0 && !deleteLocal)}
                className={`flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${buttonColor}`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    处理中 ({products.length} 个)...
                  </>
                ) : isSync ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    开始同步
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    确认删除
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
