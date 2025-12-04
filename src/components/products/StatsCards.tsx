import { SITES } from '../../lib/attributes';
import type { SiteKey } from '../../lib/types';

interface Stats {
  total: number;
  bySyncStatus: Record<SiteKey, { synced: number; error: number; pending: number }>;
}

interface StatsCardsProps {
  stats: Stats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-5 gap-4 mb-6">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-2xl font-bold">{stats.total}</div>
        <div className="text-sm text-gray-500">商品总数（按 SKU）</div>
      </div>
      {(['com', 'uk', 'de', 'fr'] as SiteKey[]).map(site => {
        const siteStats = stats.bySyncStatus[site] || { synced: 0, error: 0, pending: 0 };
        const syncedPercent = stats.total > 0 ? Math.round((siteStats.synced / stats.total) * 100) : 0;
        const siteConfig = SITES.find(s => s.key === site);
        return (
          <div key={site} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{siteConfig?.flag}</span>
              <span className="text-lg font-bold">{siteStats.synced}</span>
              <span className="text-xs text-gray-400">/ {stats.total}</span>
            </div>
            <div className="text-sm text-gray-500">{site} ({syncedPercent}%)</div>
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${syncedPercent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

