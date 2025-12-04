import type { SiteKey } from '../lib/types';
import { SITES } from '../lib/attributes';

interface SiteSelectorProps {
  selectedSites: SiteKey[];
  onChange: (sites: SiteKey[]) => void;
}

export function SiteSelector({ selectedSites, onChange }: SiteSelectorProps) {
  const allSelected = selectedSites.length === SITES.length;

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(SITES.map((s) => s.key));
    }
  };

  const toggleSite = (site: SiteKey) => {
    if (selectedSites.includes(site)) {
      onChange(selectedSites.filter((s) => s !== site));
    } else {
      onChange([...selectedSites, site]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500">发布站点</label>
        <button
          onClick={toggleAll}
          className="text-xs text-gray-500 hover:text-black"
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {SITES.map((site) => (
          <label
            key={site.key}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors border
              ${
                selectedSites.includes(site.key)
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }
            `}
          >
            <input
              type="checkbox"
              checked={selectedSites.includes(site.key)}
              onChange={() => toggleSite(site.key)}
              className="sr-only"
            />
            <span>{site.flag}</span>
            <span>{site.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
