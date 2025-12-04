import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Search, Loader2, X, Check } from 'lucide-react';
import type { WooCategory } from '../lib/types';
import { getCategoriesFromDb } from '../lib/supabase';

interface CategorySelectorProps {
  value: string[];
  onChange: (value: string[]) => void;
}

interface CategoryGroup {
  parent: WooCategory;
  children: WooCategory[];
}

export function CategorySelector({ value, onChange }: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<WooCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 加载分类数据（从 Supabase 数据库）
  useEffect(() => {
    getCategoriesFromDb('com')
      .then((data) => {
        // 过滤掉 Uncategorized（getCategoriesFromDb 已返回 WooCategory 格式）
        const filtered = data.filter((c) => c.name !== 'Uncategorized');
        setCategories(filtered);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch categories:', err);
        setError('加载分类失败');
        setLoading(false);
      });
  }, []);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // 构建层级结构
  const buildHierarchy = (): CategoryGroup[] => {
    const parentCategories = categories.filter((c) => c.parent === 0);
    const groups: CategoryGroup[] = parentCategories.map((parent) => ({
      parent,
      children: categories
        .filter((c) => c.parent === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    // 按父分类名称排序
    groups.sort((a, b) => a.parent.name.localeCompare(b.parent.name));
    return groups;
  };

  // 过滤分类（搜索时）
  const filterCategories = () => {
    if (!search) return buildHierarchy();

    const searchLower = search.toLowerCase();
    const matchingCategories = categories.filter((c) =>
      c.name.toLowerCase().includes(searchLower)
    );

    return matchingCategories;
  };

  const toggleGroup = (parentId: number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(parentId)) {
      newExpanded.delete(parentId);
    } else {
      newExpanded.add(parentId);
    }
    setExpandedGroups(newExpanded);
  };

  // 根据分类名获取分类对象
  const getCategoryByName = (name: string) => categories.find((c) => c.name === name);

  // 根据 ID 获取分类对象
  const getCategoryById = (id: number) => categories.find((c) => c.id === id);

  // 切换选中状态（选择子级时自动选择父级）
  const toggleCategory = (categoryName: string) => {
    if (value.includes(categoryName)) {
      // 取消选择时，只取消当前项
      onChange(value.filter((v) => v !== categoryName));
    } else {
      // 选择时，同时选择父级（如果有）
      const category = getCategoryByName(categoryName);
      const newValues = [...value, categoryName];

      if (category && category.parent !== 0) {
        const parentCategory = getCategoryById(category.parent);
        if (parentCategory && !newValues.includes(parentCategory.name)) {
          newValues.push(parentCategory.name);
        }
      }

      onChange(newValues);
    }
  };

  // 移除已选分类
  const removeCategory = (categoryName: string) => {
    onChange(value.filter((v) => v !== categoryName));
  };

  const hierarchy = buildHierarchy();
  const searchResults = search ? filterCategories() : null;

  return (
    <div ref={containerRef} className="relative">
      {/* 触发区域 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className="w-full min-h-[42px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-left bg-white flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent cursor-pointer"
      >
        <div className="flex-1 flex flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="text-gray-400">请选择分类</span>
          ) : (
            value.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs"
              >
                {cat}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCategory(cat);
                  }}
                  className="hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索分类..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
          </div>

          {/* 分类列表 */}
          <div className="overflow-y-auto max-h-60">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                加载中...
              </div>
            ) : error ? (
              <div className="py-4 px-3 text-sm text-red-500 text-center">{error}</div>
            ) : searchResults ? (
              // 搜索结果（平铺显示）
              searchResults.length === 0 ? (
                <div className="py-4 px-3 text-sm text-gray-400 text-center">
                  没有找到匹配的分类
                </div>
              ) : (
                (searchResults as WooCategory[]).map((category) => {
                  const isSelected = value.includes(category.name);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.name)}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between ${
                        isSelected ? 'bg-gray-50' : ''
                      }`}
                    >
                      <span className={isSelected ? 'text-black font-medium' : 'text-gray-700'}>
                        {category.name}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-black" />}
                    </button>
                  );
                })
              )
            ) : (
              // 层级显示
              hierarchy.map((group) => (
                <div key={group.parent.id}>
                  {/* 父分类 */}
                  <div className="flex items-center">
                    {group.children.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.parent.id)}
                        className="p-2 hover:bg-gray-50"
                      >
                        <ChevronRight
                          className={`w-4 h-4 text-gray-400 transition-transform ${
                            expandedGroups.has(group.parent.id) ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleCategory(group.parent.name)}
                      className={`flex-1 px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between ${
                        value.includes(group.parent.name) ? 'bg-gray-50' : ''
                      } ${group.children.length === 0 ? 'pl-10' : ''}`}
                    >
                      <span className={`${group.children.length > 0 ? 'font-medium text-gray-900' : 'text-gray-700'} ${value.includes(group.parent.name) ? 'font-medium text-black' : ''}`}>
                        {group.parent.name}
                        {group.children.length > 0 && (
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">({group.children.length})</span>
                        )}
                      </span>
                      {value.includes(group.parent.name) && <Check className="w-4 h-4 text-black" />}
                    </button>
                  </div>

                  {/* 子分类 */}
                  {expandedGroups.has(group.parent.id) && group.children.length > 0 && (
                    <div className="bg-gray-50">
                      {group.children.map((child) => {
                        const isSelected = value.includes(child.name);
                        return (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => toggleCategory(child.name)}
                            className={`w-full pl-10 pr-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center justify-between ${
                              isSelected ? 'bg-gray-100' : ''
                            }`}
                          >
                            <span className={isSelected ? 'text-black font-medium' : 'text-gray-600'}>
                              {child.name}
                            </span>
                            {isSelected && <Check className="w-4 h-4 text-black" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
