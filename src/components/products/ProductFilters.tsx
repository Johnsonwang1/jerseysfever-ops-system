import { Search, X, Filter, ChevronDown, Check, Sparkles, CloudOff, Clock, AlertTriangle, Box, Link2Off, XCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { CategorySelector } from './CategorySelector';
import type { SpecialFilter } from '../../hooks/useProducts';

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
  // 新增：特殊筛选
  specialFilters?: SpecialFilter[];
  onSpecialFiltersChange?: (filters: SpecialFilter[]) => void;
}

const SPECIAL_FILTER_OPTIONS: { id: SpecialFilter; label: string; icon: React.ElementType; color: string; group?: string }[] = [
  { id: 'ai_pending', label: 'AI图待替换', icon: Sparkles, color: 'text-purple-600 bg-purple-50' },
  { id: 'unsync', label: '未同步', icon: CloudOff, color: 'text-amber-600 bg-amber-50' },
  { id: 'sync_error', label: '同步失败', icon: XCircle, color: 'text-red-600 bg-red-50' },
  { id: 'draft', label: '草稿', icon: Clock, color: 'text-gray-600 bg-gray-100' },
  // 变体问题筛选
  { id: 'var_zero', label: '无变体', icon: Box, color: 'text-red-600 bg-red-50', group: 'variation' },
  { id: 'var_one', label: '仅1个变体', icon: AlertTriangle, color: 'text-orange-600 bg-orange-50', group: 'variation' },
  { id: 'var_sku_mismatch', label: 'SKU不匹配', icon: Link2Off, color: 'text-rose-600 bg-rose-50', group: 'variation' },
];

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
  specialFilters = [],
  onSpecialFiltersChange,
}: ProductFiltersProps) {
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    if (showFilterMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterMenu]);

  const toggleSpecialFilter = (filter: SpecialFilter) => {
    if (!onSpecialFiltersChange) return;
    if (specialFilters.includes(filter)) {
      onSpecialFiltersChange(specialFilters.filter(f => f !== filter));
    } else {
      onSpecialFiltersChange([...specialFilters, filter]);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        {/* 搜索 */}
        <div className="flex-1 sm:max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索商品名称或 SKU..."
              className="w-full pl-9 pr-8 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
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
        <div className="flex-shrink-0">
          <CategorySelector
            categories={categories}
            value={categoryFilter}
            onChange={onCategoryChange}
            mode={categoryMode}
            excludeMode={excludeMode}
            onExcludeModeChange={onExcludeModeChange}
          />
        </div>

        {/* 特殊筛选 */}
        {onSpecialFiltersChange && (
          <div className="relative flex-shrink-0" ref={filterMenuRef}>
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
                specialFilters.length > 0
                  ? 'border-purple-300 bg-purple-50 text-purple-700'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>筛选</span>
              {specialFilters.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                  {specialFilters.length}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilterMenu ? 'rotate-180' : ''}`} />
            </button>

            {showFilterMenu && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <div className="p-1">
                  {/* 常规筛选 */}
                  {SPECIAL_FILTER_OPTIONS.filter(o => !o.group).map((option) => {
                    const isSelected = specialFilters.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        onClick={() => toggleSpecialFilter(option.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                          isSelected ? option.color : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <option.icon className="w-4 h-4" />
                        <span className="flex-1 text-left">{option.label}</span>
                        {isSelected && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })}
                  
                  {/* 变体问题筛选 */}
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">变体问题</div>
                    {SPECIAL_FILTER_OPTIONS.filter(o => o.group === 'variation').map((option) => {
                      const isSelected = specialFilters.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          onClick={() => toggleSpecialFilter(option.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                            isSelected ? option.color : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <option.icon className="w-4 h-4" />
                          <span className="flex-1 text-left">{option.label}</span>
                          {isSelected && <Check className="w-4 h-4" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 清除筛选 */}
        {hasFilters && (
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-1.5 px-4 sm:px-3 py-2.5 sm:py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            重置
          </button>
        )}
      </div>

      {/* 已选筛选标签 */}
      {specialFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
          {specialFilters.map((filterId) => {
            const option = SPECIAL_FILTER_OPTIONS.find(o => o.id === filterId);
            if (!option) return null;
            return (
              <span
                key={filterId}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full ${option.color}`}
              >
                <option.icon className="w-3 h-3" />
                {option.label}
                <button
                  onClick={() => toggleSpecialFilter(filterId)}
                  className="ml-0.5 hover:opacity-70"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
