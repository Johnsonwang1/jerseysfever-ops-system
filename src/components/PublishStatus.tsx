import { Check, Loader2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import type { PublishResult, SiteKey } from '../lib/types';
import { SITES } from '../lib/attributes';

interface PublishStatusProps {
  results: PublishResult[];
  onRetry?: (site: SiteKey) => void;
}

export function PublishStatus({ results, onRetry }: PublishStatusProps) {
  if (results.length === 0) return null;

  return (
    <div className="space-y-2">
      {results.map((result) => {
        const site = SITES.find((s) => s.key === result.site);
        if (!site) return null;

        return (
          <div
            key={result.site}
            className={`
              flex items-center justify-between px-4 py-3 rounded-lg border
              ${result.status === 'success' ? 'bg-green-50 border-green-200' : ''}
              ${result.status === 'error' ? 'bg-red-50 border-red-200' : ''}
              ${result.status === 'pending' || result.status === 'uploading' || result.status === 'creating' ? 'bg-gray-50 border-gray-200' : ''}
            `}
          >
            <div className="flex items-center gap-3">
              {/* 状态图标 */}
              {result.status === 'success' && (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
              {result.status === 'error' && (
                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-white" />
                </div>
              )}
              {(result.status === 'pending' || result.status === 'uploading' || result.status === 'creating') && (
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              )}

              {/* 站点信息 */}
              <div>
                <div className="flex items-center gap-1.5">
                  <span>{site.flag}</span>
                  <span className="font-medium">{site.name}</span>
                </div>
                {result.status === 'uploading' && (
                  <p className="text-xs text-gray-500">上传图片中...</p>
                )}
                {result.status === 'creating' && (
                  <p className="text-xs text-gray-500">创建商品中...</p>
                )}
                {result.status === 'error' && result.error && (
                  <p className="text-xs text-red-600">{result.error}</p>
                )}
                {result.status === 'success' && (
                  <p className="text-xs text-green-600">发布成功</p>
                )}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2">
              {result.status === 'success' && result.productUrl && (
                <a
                  href={result.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-700 hover:bg-green-100 rounded-lg"
                >
                  查看
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {result.status === 'error' && onRetry && (
                <button
                  onClick={() => onRetry(result.site)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 rounded-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  重试
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
