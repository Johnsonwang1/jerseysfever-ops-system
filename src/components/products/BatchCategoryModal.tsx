import { useState, useMemo } from 'react';
import { X, Tag, Upload, Loader2, CheckCircle, AlertCircle, Search, Check, Plus, Minus, RefreshCw } from 'lucide-react';
import { updateProductDetails, type LocalProduct } from '../../lib/products';
import { syncProductsBatch, type SyncResult } from '../../lib/sync-api';
import type { SiteKey } from '../../lib/types';
import { SITES } from '../../lib/attributes';
import { useAllCategories } from '../../hooks/useProducts';

interface BatchCategoryModalProps {
  products: LocalProduct[];
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'select' | 'syncing' | 'done';
type Operation = 'add' | 'remove' | 'replace';

export function BatchCategoryModal({ products, onClose, onComplete }: BatchCategoryModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [operation, setOperation] = useState<Operation>('add');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { data: allCategories = [] } = useAllCategories();
  const [selectedSites, setSelectedSites] = useState<SiteKey[]>(['com', 'uk', 'de', 'fr']);
  const [syncResults, setSyncResults] = useState<{ sku: string; results: SyncResult[] }[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [_error, setError] = useState<string | null>(null);

  // 搜索过滤分类
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return allCategories;
    const query = searchQuery.toLowerCase();
    return allCategories.filter(cat => cat.name.toLowerCase().includes(query));
  }, [allCategories, searchQuery]);

  // 计算修改后的分类
  const getUpdatedCategories = (product: LocalProduct): string[] => {
    const current = product.categories || [];
    switch (operation) {
      case 'add':
        return [...new Set([...current, ...selectedCategories])];
      case 'remove':
        return current.filter(c => !selectedCategories.includes(c));
      case 'replace':
        return selectedCategories;
      default:
        return current;
    }
  };

  // 执行批量修改和同步（使用批量接口，共享分类缓存）
  const handleExecute = async () => {
    setStep('syncing');
    setError(null);
    
    const totalToProcess = products.length;
    setProgress({ current: 0, total: totalToProcess });

    try {
      // 1. 更新所有商品的本地数据库类目
      console.log(`📝 更新 ${products.length} 个商品的本地类目...`);
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const newCategories = getUpdatedCategories(product);
        await updateProductDetails(product.sku, { categories: newCategories });
        setProgress({ current: i + 1, total: totalToProcess * 2 }); // 前半段进度
      }

      // 2. 收集需要同步的 SKU（只有在目标站点有 woo_id 的）
      const skusToSync = products
        .filter(p => selectedSites.some(site => p.woo_ids?.[site]))
        .map(p => p.sku);

      if (skusToSync.length === 0) {
        setSyncResults(products.map(p => ({ sku: p.sku, results: [] })));
        setStep('done');
        return;
      }

      // 3. 调用批量同步接口（一次性同步所有商品，共享分类缓存）
      console.log(`🚀 批量同步 ${skusToSync.length} 个商品到 ${selectedSites.length} 个站点...`);
      setProgress({ current: totalToProcess, total: totalToProcess * 2 }); // 后半段开始
      
      const syncResults = await syncProductsBatch(skusToSync, selectedSites, {
        fields: ['categories']  // 只同步类目
      });

      // 4. 补充没有同步的商品结果
      const syncResultMap = new Map(syncResults.map(r => [r.sku, r]));
      const allResults = products.map(p => {
        const syncResult = syncResultMap.get(p.sku);
        if (syncResult) {
          return syncResult;
        }
        // 没有同步的商品（没有 woo_id）
        return { sku: p.sku, results: [] };
      });

      setProgress({ current: totalToProcess * 2, total: totalToProcess * 2 });
      setSyncResults(allResults);
      setStep('done');
    } catch (err) {
      console.error('批量同步失败:', err);
      setError(err instanceof Error ? err.message : '同步失败');
      setStep('done');
    }
  };

  // 统计结果
  const getResultStats = () => {
    let success = 0;
    let failed = 0;
    syncResults.forEach(r => {
      const hasError = r.results.some(res => !res.success);
      if (hasError) failed++;
      else success++;
    });
    return { success, failed };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Tag className="w-5 h-5 text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">批量修改类目</h2>
              <p className="text-sm text-gray-500">已选择 {products.length} 个商品</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'select' && (
            <div className="space-y-4">
              {/* 操作类型 - 简化为按钮组 */}
              <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg">
                {[
                  { value: 'add', label: '添加', icon: Plus },
                  { value: 'remove', label: '移除', icon: Minus },
                  { value: 'replace', label: '替换', icon: RefreshCw },
                ].map((op) => {
                  const Icon = op.icon;
                  return (
                    <button
                      key={op.value}
                      onClick={() => setOperation(op.value as Operation)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        operation === op.value
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {op.label}
                    </button>
                  );
                })}
              </div>

              {/* 搜索类目 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索类目..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 已选类目 */}
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-blue-50 rounded-lg">
                  <span className="text-xs text-blue-600 font-medium">已选:</span>
                  {selectedCategories.map(cat => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full"
                    >
                      {cat}
                      <button
                        onClick={() => setSelectedCategories(selectedCategories.filter(c => c !== cat))}
                        className="hover:text-blue-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* 类目列表 */}
              <div className="border border-gray-200 rounded-lg max-h-[240px] overflow-y-auto">
                {filteredCategories.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">
                    {searchQuery ? `未找到 "${searchQuery}"` : '暂无类目数据'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredCategories.slice(0, 100).map((cat) => {
                      const isSelected = selectedCategories.includes(cat.name);
                      return (
                        <div
                          key={cat.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCategories(selectedCategories.filter(c => c !== cat.name));
                            } else {
                              setSelectedCategories([...selectedCategories, cat.name]);
                            }
                          }}
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                            isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className={`text-sm ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                            {cat.name}
                          </span>
                        </div>
                      );
                    })}
                    {filteredCategories.length > 100 && (
                      <div className="px-3 py-2 text-xs text-gray-400 text-center">
                        显示前 100 个，请搜索更精确的关键词
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 同步站点 - 简化 */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">同步到:</span>
                <div className="flex items-center gap-1">
                  {SITES.map((site) => (
                    <button
                      key={site.key}
                      onClick={() => {
                        if (selectedSites.includes(site.key)) {
                          setSelectedSites(selectedSites.filter(s => s !== site.key));
                        } else {
                          setSelectedSites([...selectedSites, site.key]);
                        }
                      }}
                      className={`px-2 py-1 text-sm rounded transition-colors ${
                        selectedSites.includes(site.key)
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-white text-gray-400 border border-gray-200'
                      }`}
                      title={site.name}
                    >
                      {site.flag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'syncing' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <div className="text-lg font-medium text-gray-900 mb-2">正在处理...</div>
              <div className="text-sm text-gray-500">
                {progress.current} / {progress.total} 个商品
              </div>
              <div className="w-full max-w-xs mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4">
              {(() => {
                const stats = getResultStats();
                return (
                  <>
                    <div className={`p-4 rounded-lg ${stats.failed === 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {stats.failed === 0 ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600" />
                        )}
                        <div className={`font-medium ${stats.failed === 0 ? 'text-green-800' : 'text-yellow-800'}`}>
                          {stats.failed === 0 ? '全部完成！' : '部分完成'}
                        </div>
                      </div>
                      <div className={`text-sm ${stats.failed === 0 ? 'text-green-700' : 'text-yellow-700'}`}>
                        成功: {stats.success} 个 · 失败: {stats.failed} 个
                      </div>
                    </div>

                    {/* 显示失败的商品 */}
                    {stats.failed > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-gray-700">失败详情</div>
                        {syncResults
                          .filter(r => r.results.some(res => !res.success))
                          .map((r) => (
                            <div key={r.sku} className="p-2 bg-red-50 rounded text-sm">
                              <div className="font-medium text-red-800">{r.sku}</div>
                              <div className="text-red-600 text-xs">
                                {r.results.filter(res => !res.success).map(res => res.error).join(', ')}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          {step === 'select' && (
            <>
              <div className="text-xs text-gray-500">
                {selectedCategories.length > 0 && (
                  <>
                    {operation === 'add' ? '添加' : operation === 'remove' ? '移除' : '替换为'} {selectedCategories.length} 个类目
                    → {selectedSites.length} 个站点
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  取消
                </button>
                <button
                  onClick={handleExecute}
                  disabled={selectedCategories.length === 0 || selectedSites.length === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  执行
                </button>
              </div>
            </>
          )}

          {step === 'syncing' && (
            <div className="w-full text-center text-sm text-gray-500">
              处理中，请勿关闭...
            </div>
          )}

          {step === 'done' && (
            <>
              <div />
              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="px-4 py-2 text-sm bg-gray-900 text-white hover:bg-gray-800 rounded-lg"
              >
                完成
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

