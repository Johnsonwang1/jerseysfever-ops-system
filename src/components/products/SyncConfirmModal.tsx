import { useState } from 'react';
import { X, Loader2, CheckCircle, XCircle, Upload, Download, ExternalLink } from 'lucide-react';
import { SITES } from '../../lib/attributes';
import type { SiteKey } from '../../lib/types';
import type { LocalProduct } from '../../lib/products';
import type { SyncResult, SyncField } from '../../lib/sync-api';

type ActionMode = 'push' | 'pull';

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

interface SyncConfirmModalProps {
  product: LocalProduct;
  onClose: () => void;
  onConfirm: (sites: SiteKey[], mode: ActionMode, fields?: SyncField[]) => Promise<void>;
  onConfirmAsync?: (sites: SiteKey[], mode: ActionMode, fields?: SyncField[]) => void;
  isSyncing: boolean;
  syncResults?: SyncResult[];
}

export function SyncConfirmModal({
  product,
  onClose,
  onConfirm,
  onConfirmAsync,
  isSyncing,
  syncResults,
}: SyncConfirmModalProps) {
  // 操作模式：push = 推送到站点，pull = 从站点拉取
  const [mode, setMode] = useState<ActionMode>('push');
  
  // 默认选中所有已发布的站点（push模式），或只选 com（pull模式）
  const publishedSites = SITES.filter(site => product.woo_ids?.[site.key]).map(s => s.key);
  const [selectedSites, setSelectedSites] = useState<Set<SiteKey>>(new Set(publishedSites));

  // 更新模式：选择要更新的字段（默认除了图片都选中）
  const [selectedFields, setSelectedFields] = useState<Set<SyncField>>(
    new Set(SYNC_FIELDS.filter(f => f.key !== 'images').map(f => f.key))
  );

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

  const handleModeChange = (newMode: ActionMode) => {
    setMode(newMode);
    // 两种模式都默认选所有已发布站点
    setSelectedSites(new Set(publishedSites));
  };

  const handleConfirm = () => {
    if (selectedSites.size === 0) return;
    if (mode === 'push' && selectedFields.size === 0) return;
    onConfirm(
      Array.from(selectedSites), 
      mode, 
      mode === 'push' ? Array.from(selectedFields) : undefined
    );
  };

  // 异步执行（关闭窗口后台执行）
  const handleConfirmAsync = () => {
    if (selectedSites.size === 0) return;
    if (mode === 'push' && selectedFields.size === 0) return;
    if (onConfirmAsync) {
      onConfirmAsync(
        Array.from(selectedSites), 
        mode, 
        mode === 'push' ? Array.from(selectedFields) : undefined
      );
      onClose();
    }
  };

  const hasResults = syncResults && syncResults.length > 0;
  const allSuccess = hasResults && syncResults.every(r => r.success);

  const isPush = mode === 'push';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 弹窗 */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className={`flex items-center gap-2 ${isPush ? 'text-green-600' : 'text-blue-600'}`}>
            {isPush ? <Upload className="w-5 h-5" /> : <Download className="w-5 h-5" />}
            <h3 className="text-lg font-semibold">
              {isPush ? '更新到站点' : '从站点拉取'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 overflow-y-auto">
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
              {/* 模式切换 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  操作类型
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleModeChange('pull')}
                    disabled={isSyncing}
                    className={`flex items-center justify-center gap-2 p-3 border rounded-lg transition-colors ${
                      !isPush
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span className="text-sm font-medium">从站点拉取</span>
                  </button>
                  <button
                    onClick={() => handleModeChange('push')}
                    disabled={isSyncing}
                    className={`flex items-center justify-center gap-2 p-3 border rounded-lg transition-colors ${
                      isPush
                        ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span className="text-sm font-medium">更新到站点</span>
                  </button>
                </div>
              </div>

              {/* 站点选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isPush ? '选择目标站点' : '选择数据来源（支持多选）'}
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
                            ? isPush ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">{site.flag}</span>
                        <span className="text-sm font-medium">{site.name}</span>
                        {!hasWooId && (
                          <span className="text-xs text-gray-400 ml-auto">(未发布)</span>
                        )}
                        {hasWooId && isSelected && (
                          <CheckCircle className={`w-4 h-4 ml-auto ${isPush ? 'text-green-500' : 'text-blue-500'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 字段选择（仅推送模式显示） */}
              {isPush && (
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
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-green-300 bg-green-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleField(field.key)}
                            disabled={isSyncing}
                            className="mt-0.5 w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{field.label}</div>
                            <div className="text-xs text-gray-500">{field.description}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 说明 */}
              <div className={`p-3 border rounded-lg ${isPush ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                <p className={`text-sm ${isPush ? 'text-green-800' : 'text-blue-800'}`}>
                  {isPush 
                    ? '将 PIM 中的商品数据推送到选中的站点。未发布的站点将创建新商品，已发布的站点将更新现有商品。'
                    : '从选中的站点获取最新数据（价格、库存、状态、变体信息等）更新到 PIM。'
                  }
                </p>
              </div>
            </>
          ) : (
            /* 同步结果 */
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">
                {isPush ? '更新结果：' : '拉取结果：'}
              </p>
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
                          <span className="text-sm text-green-700">成功</span>
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
              {onConfirmAsync && (
                <button
                  onClick={handleConfirmAsync}
                  disabled={isSyncing || selectedSites.size === 0 || (isPush && selectedFields.size === 0)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
                  title="关闭窗口并在后台执行"
                >
                  <ExternalLink className="w-4 h-4" />
                  后台执行
                </button>
              )}
              <button
                onClick={handleConfirm}
                disabled={isSyncing || selectedSites.size === 0 || (isPush && selectedFields.size === 0)}
                className={`flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${
                  isPush ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    处理中...
                  </>
                ) : isPush ? (
                  <>
                    <Upload className="w-4 h-4" />
                    开始更新
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    开始拉取
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
