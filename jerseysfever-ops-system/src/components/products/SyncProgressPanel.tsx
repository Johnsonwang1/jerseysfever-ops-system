import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { SITES } from '../../lib/attributes';
import type { SiteKey } from '../../lib/types';

interface SyncProgress {
  current: number;
  total: number;
  status: string;
}

export interface SyncProgressPanelProps {
  progress: Partial<Record<SiteKey, SyncProgress>>;
}

export function SyncProgressPanel({ progress }: SyncProgressPanelProps) {
  if (Object.keys(progress).length === 0) return null;

  return (
    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span className="text-sm font-medium text-blue-900">同步中...</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {SITES.map(site => {
          const siteProgress = progress[site.key];
          const percent = siteProgress && siteProgress.total > 0 
            ? Math.round((siteProgress.current / siteProgress.total) * 100) 
            : 0;
          const isDone = siteProgress?.status === 'done';
          const isError = siteProgress?.status === 'error';
          
          return (
            <div key={site.key} className={`p-2 rounded-lg ${
              isDone ? 'bg-green-100' : isError ? 'bg-red-100' : 'bg-white'
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm">{site.flag}</span>
                <span className="text-xs font-medium">{site.key.toUpperCase()}</span>
                {isDone && <CheckCircle className="w-3 h-3 text-green-600" />}
                {isError && <XCircle className="w-3 h-3 text-red-600" />}
              </div>
              <div className="text-xs text-gray-600">
                {!siteProgress ? '等待中...' :
                 siteProgress.status === 'fetching' ? '获取列表...' :
                 siteProgress.status === 'done' ? `完成 ${siteProgress.total} 条` :
                 `${siteProgress.current}/${siteProgress.total}`}
              </div>
              {siteProgress && siteProgress.total > 0 && (
                <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isDone ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

