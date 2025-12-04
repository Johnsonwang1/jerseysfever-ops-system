import { useState, useEffect } from 'react';
import { Clock, Loader2, AlertCircle, ExternalLink, RefreshCw, Check, X } from 'lucide-react';
import { getPublishHistory, type PublishRecord, type SiteResult } from '../lib/history';
import type { SiteKey } from '../lib/types';

const SITE_LABELS: Record<SiteKey, string> = {
  com: '.com',
  uk: '.uk',
  de: '.de',
  fr: '.fr',
};

export function HistoryPage() {
  const [records, setRecords] = useState<PublishRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPublishHistory();
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载发布历史失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 按日期分组
  const groupedByDate = records.reduce((acc, record) => {
    const date = new Date(record.created_at).toLocaleDateString('zh-CN');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(record);
    return acc;
  }, {} as Record<string, PublishRecord[]>);

  // 格式化时间
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 渲染站点状态
  const renderSiteStatus = (sites: Record<SiteKey, SiteResult>) => {
    return (
      <div className="flex items-center gap-2">
        {(Object.keys(sites) as SiteKey[]).map((site) => {
          const result = sites[site];
          return (
            <div
              key={site}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                result.success
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {result.success ? (
                <Check className="w-3 h-3" />
              ) : (
                <X className="w-3 h-3" />
              )}
              {SITE_LABELS[site]}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6" />
          <h1 className="text-xl font-semibold">发布历史</h1>
        </div>
        <button
          onClick={loadHistory}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 内容 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-red-500">
          <AlertCircle className="w-12 h-12 mb-4" />
          <p>{error}</p>
          <button
            onClick={loadHistory}
            className="mt-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            重试
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Clock className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>暂无发布记录</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByDate).map(([date, dateRecords]) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-gray-500 mb-3">{date}</h3>
              <div className="space-y-3">
                {dateRecords.map((record) => (
                  <div
                    key={record.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* 商品图片 */}
                      <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                        {record.product_image ? (
                          <img
                            src={record.product_image}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <Clock className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      {/* 商品信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {formatTime(record.created_at)}
                          </span>
                        </div>
                        <h4 className="font-medium text-gray-900 truncate mt-1">
                          {record.product_name}
                        </h4>
                        <div className="mt-2">
                          {renderSiteStatus(record.sites)}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex-shrink-0">
                        {Object.entries(record.sites).some(
                          ([, result]) => result.success && result.permalink
                        ) && (
                          <a
                            href={
                              Object.values(record.sites).find(
                                (r) => r.success && r.permalink
                              )?.permalink
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            查看商品
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
