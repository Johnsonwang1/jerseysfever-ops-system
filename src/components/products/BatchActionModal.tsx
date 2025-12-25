import { useState } from 'react';
import { X, RefreshCw, Trash2, Loader2, CheckCircle, XCircle, AlertTriangle, Upload, Download, ExternalLink, EyeOff } from 'lucide-react';
import { SITES } from '../../lib/attributes';
import type { SiteKey } from '../../lib/types';
import type { LocalProduct } from '../../lib/products';
import type { SyncField } from '../../lib/sync-api';

type ActionType = 'sync' | 'delete' | 'update' | 'pull' | 'unpublish';
export type PullMode = 'all' | 'variations';

interface BatchResult {
  sku: string;
  success: boolean;
  error?: string;
}

// 可选的同步字段
const SYNC_FIELDS: { key: SyncField; label: string; description: string }[] = [
  { key: 'name', label: '商品名称', description: '更新商品标题' },
  { key: 'description', label: '商品描述', description: '更新详细描述和简短描述' },
  { key: 'categories', label: '分类', description: '更新商品分类' },
  { key: 'prices', label: '价格', description: '更新销售价格和原价' },
  { key: 'stock', label: '库存', description: '更新库存数量' },
  { key: 'status', label: '状态', description: '更新发布状态' },
  { key: 'images', label: '图片', description: '重新上传所有图片（较慢）' },
];

// 拉取模式选项
const PULL_MODES: { key: PullMode; label: string; description: string }[] = [
  { key: 'all', label: '全部数据', description: '拉取价格、库存、状态、变体等所有数据' },
  { key: 'variations', label: '仅变体', description: '只拉取变体信息，20 个并行处理（更快）' },
];

interface BatchActionModalProps {
  action: ActionType;
  products: LocalProduct[];
  onClose: () => void;
  onConfirm: (sites: SiteKey[], deleteLocal?: boolean, fields?: SyncField[], pullMode?: PullMode) => Promise<void>;
  onConfirmAsync?: (sites: SiteKey[], deleteLocal?: boolean, fields?: SyncField[], pullMode?: PullMode) => void;
  isProcessing: boolean;
  results?: BatchResult[];
}

export function BatchActionModal({
  action,
  products,
  onClose,
  onConfirm,
  onConfirmAsync,
  isProcessing,
  results,
}: BatchActionModalProps) {
  const isSync = action === 'sync';
  const isUpdate = action === 'update';
  const isDelete = action === 'delete';
  const isPull = action === 'pull';
  const isUnpublish = action === 'unpublish';

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
  // update 模式默认选择所有站点，sync/delete/pull/unpublish 模式只选择已发布站点
  // pull 模式默认选择 com 站点
  const [selectedSites, setSelectedSites] = useState<Set<SiteKey>>(
    isUpdate ? new Set(SITES.map(s => s.key)) : 
    isPull ? new Set(['com'] as SiteKey[]) : 
    new Set(allPublishedSites)
  );
  const [deleteLocal, setDeleteLocal] = useState(true);
  
  // 更新模式：选择要更新的字段（默认除了图片都选中）
  const [selectedFields, setSelectedFields] = useState<Set<SyncField>>(
    new Set(SYNC_FIELDS.filter(f => f.key !== 'images').map(f => f.key))
  );

  // 拉取模式：全部数据 or 仅变体
  const [pullMode, setPullMode] = useState<PullMode>('all');

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

  const toggleField = (field: SyncField) => {
    const newSet = new Set(selectedFields);
    if (newSet.has(field)) {
      newSet.delete(field);
    } else {
      newSet.add(field);
    }
    setSelectedFields(newSet);
  };

  const handleConfirm = () => {
    if ((action === 'sync' || action === 'update' || action === 'pull' || action === 'unpublish') && selectedSites.size === 0) return;
    if (action === 'update' && selectedFields.size === 0) return;
    if (action === 'delete' && selectedSites.size === 0 && !deleteLocal) return;
    onConfirm(
      Array.from(selectedSites), 
      deleteLocal, 
      isUpdate ? Array.from(selectedFields) : undefined,
      isPull ? pullMode : undefined
    );
  };

  // 异步执行（关闭窗口后台执行）
  const handleConfirmAsync = () => {
    if ((action === 'sync' || action === 'update' || action === 'pull' || action === 'unpublish') && selectedSites.size === 0) return;
    if (action === 'update' && selectedFields.size === 0) return;
    if (action === 'delete' && selectedSites.size === 0 && !deleteLocal) return;
    if (onConfirmAsync) {
      onConfirmAsync(
        Array.from(selectedSites), 
        deleteLocal, 
        isUpdate ? Array.from(selectedFields) : undefined,
        isPull ? pullMode : undefined
      );
      onClose();
    }
  };

  const hasResults = results && results.length > 0;
  const successCount = hasResults ? results.filter(r => r.success).length : 0;
  const allSuccess = hasResults && successCount === results.length;

  const title = isPull ? '从站点拉取数据' : isUpdate ? '批量更新到站点' : isSync ? '批量同步商品' : isUnpublish ? '批量设为未发布' : '批量删除商品';
  const icon = isPull ? <Download className="w-5 h-5" /> : isUpdate ? <Upload className="w-5 h-5" /> : isSync ? <RefreshCw className="w-5 h-5" /> : isUnpublish ? <EyeOff className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />;
  const iconColor = isPull ? 'text-blue-600' : isUpdate ? 'text-green-600' : isSync ? 'text-blue-600' : isUnpublish ? 'text-yellow-600' : 'text-red-600';
  const buttonColor = isPull ? 'bg-blue-600 hover:bg-blue-700' : isUpdate ? 'bg-green-600 hover:bg-green-700' : isSync ? 'bg-blue-600 hover:bg-blue-700' : isUnpublish ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-red-600 hover:bg-red-700';
  const selectedColor = isPull ? 'border-blue-300 bg-blue-50' : isUpdate ? 'border-green-300 bg-green-50' : isSync ? 'border-blue-300 bg-blue-50' : isUnpublish ? 'border-yellow-300 bg-yellow-50' : 'border-red-300 bg-red-50';
  const checkColor = isPull ? 'text-blue-500' : isUpdate ? 'text-green-500' : isSync ? 'text-blue-500' : isUnpublish ? 'text-yellow-500' : 'text-red-500';

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
                  {isPull ? '选择数据来源站点（支持多选）' : isUpdate ? '选择目标站点' : isSync ? '选择同步目标站点' : '选择删除站点'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SITES.map((site) => {
                    // update 模式可以选择任意站点，sync/delete 只能选择已发布的站点
                    const hasAnyProduct = isUpdate || allPublishedSites.has(site.key);
                    const isSelected = selectedSites.has(site.key);
                    const isPublished = allPublishedSites.has(site.key);

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
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">{site.name}</span>
                          {isUpdate && !isPublished && (
                            <span className="text-xs text-orange-500">新发布</span>
                          )}
                        </div>
                        {hasAnyProduct && isSelected && (
                          <CheckCircle className={`w-4 h-4 ${checkColor} ml-auto`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 字段选择（仅更新模式显示） */}
              {isUpdate && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择要更新的内容
                  </label>
                  <div className="space-y-2">
                    {SYNC_FIELDS.map((field) => {
                      const isSelected = selectedFields.has(field.key);
                      return (
                        <label
                          key={field.key}
                          className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-green-300 bg-green-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleField(field.key)}
                            disabled={isProcessing}
                            className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-700">{field.label}</span>
                            <p className="text-xs text-gray-500">{field.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 拉取模式选择（仅拉取时显示） */}
              {isPull && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择拉取内容
                  </label>
                  <div className="space-y-2">
                    {PULL_MODES.map((mode) => {
                      const isSelected = pullMode === mode.key;
                      return (
                        <label
                          key={mode.key}
                          className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pullMode"
                            checked={isSelected}
                            onChange={() => setPullMode(mode.key)}
                            disabled={isProcessing}
                            className="w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-700">{mode.label}</span>
                            <p className="text-xs text-gray-500">{mode.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 删除本地数据选项（仅删除时显示） */}
              {isDelete && (
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
              <div className={`p-3 rounded-lg ${
                isPull ? 'bg-blue-50 border border-blue-200'
                  : isUpdate ? 'bg-green-50 border border-green-200' 
                  : isSync ? 'bg-blue-50 border border-blue-200' 
                  : isUnpublish ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-red-50 border border-red-200'
              }`}>
                <p className={`text-sm ${
                  isPull ? 'text-blue-800'
                    : isUpdate ? 'text-green-800' 
                    : isSync ? 'text-blue-800' 
                    : isUnpublish ? 'text-yellow-800'
                    : 'text-red-800'
                }`}>
                  {isPull ? (
                    pullMode === 'variations' ? (
                      <>仅从选中的站点拉取变体信息，20 个商品并行处理，带自动重试。适合快速补全缺失的变体数据。</>
                    ) : (
                      <>从选中的站点获取最新数据（价格、库存、状态、变体信息等）更新到 PIM。支持多选站点，会依次从每个站点拉取数据。</>
                    )
                  ) : isUpdate ? (
                    <>将 PIM 中的商品数据推送到选中的站点。未发布的站点将创建新商品，已发布的站点将更新现有商品。</>
                  ) : isSync ? (
                    <>将 PIM 中的商品数据推送到选中的站点，包括：名称、描述、价格、库存、图片等。</>
                  ) : isUnpublish ? (
                    <>将选中的商品在指定站点设为"草稿"状态，商品将不会在前台显示，但数据仍会保留。</>
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
              {onConfirmAsync && !isDelete && (
                <button
                  onClick={handleConfirmAsync}
                  disabled={
                    isProcessing || 
                    ((isSync || isUpdate || isPull) && selectedSites.size === 0) || 
                    (isUpdate && selectedFields.size === 0)
                  }
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
                  title="关闭窗口并在后台执行"
                >
                  <ExternalLink className="w-4 h-4" />
                  后台执行
                </button>
              )}
              <button
                onClick={handleConfirm}
                disabled={
                  isProcessing || 
                  ((isSync || isUpdate || isPull || isUnpublish) && selectedSites.size === 0) || 
                  (isUpdate && selectedFields.size === 0) ||
                  (isDelete && selectedSites.size === 0 && !deleteLocal)
                }
                className={`flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${buttonColor}`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    处理中 ({products.length} 个)...
                  </>
                ) : isPull ? (
                  <>
                    <Download className="w-4 h-4" />
                    开始拉取
                  </>
                ) : isUpdate ? (
                  <>
                    <Upload className="w-4 h-4" />
                    开始更新
                  </>
                ) : isSync ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    开始同步
                  </>
                ) : isUnpublish ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    设为未发布
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
