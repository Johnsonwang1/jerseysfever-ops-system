import { Search, X } from 'lucide-react';
import { CategorySelector } from './CategorySelector';

interface Category {
  id: number;
  name: string;
  parent: number;
}

interface ProductFiltersProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  categoryFilter: string[];
  categoryMode: 'and' | 'or';
  excludeMode: boolean;
  onCategoryChange: (value: string[], mode: 'and' | 'or') => void;
  onExcludeModeChange: (exclude: boolean) => void;
  categories: Category[];
  onReset: () => void;
  hasFilters: boolean;
}

export function ProductFilters({
  searchInput,
  onSearchChange,
  onSearchClear,
  categoryFilter,
  categoryMode,
  excludeMode,
  onCategoryChange,
  onExcludeModeChange,
  categories,
  onReset,
  hasFilters,
}: ProductFiltersProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-4">
        {/* 搜索 */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索商品名称或 SKU..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {searchInput && (
              <button
                type="button"
                onClick={onSearchClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 类目筛选 */}
        <CategorySelector
          categories={categories}
          value={categoryFilter}
          onChange={onCategoryChange}
          mode={categoryMode}
          excludeMode={excludeMode}
          onExcludeModeChange={onExcludeModeChange}
        />

        {/* 清除筛选 */}
        {hasFilters && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            重置
          </button>
        )}
      </div>
    </div>
  );
}
