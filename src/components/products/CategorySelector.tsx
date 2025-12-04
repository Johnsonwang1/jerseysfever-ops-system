import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Tag, ChevronDown, ChevronRight, Check } from 'lucide-react';

interface Category {
  id: number;
  name: string;
  parent: number;
}

interface TreeNode extends Category {
  children: TreeNode[];
}

interface CategorySelectorProps {
  categories: Category[];
  value: string[];
  onChange: (value: string[], mode: 'and' | 'or') => void;
  mode: 'and' | 'or';
  excludeMode?: boolean;
  onExcludeModeChange?: (exclude: boolean) => void;
}

// 构建树形结构
function buildTree(categories: Category[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  categories.forEach(cat => {
    map.set(cat.id, { ...cat, children: [] });
  });

  categories.forEach(cat => {
    const node = map.get(cat.id)!;
    if (cat.parent === 0 || !map.has(cat.parent)) {
      roots.push(node);
    } else {
      const parent = map.get(cat.parent)!;
      parent.children.push(node);
    }
  });

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(node => {
      if (node.children.length > 0) sortNodes(node.children);
    });
  };
  sortNodes(roots);

  return roots;
}

export function CategorySelector({ categories, value, onChange, mode, excludeMode = false, onExcludeModeChange }: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hoveredPath, setHoveredPath] = useState<TreeNode[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildTree(categories), [categories]);

  // 搜索过滤
  const filteredList = useMemo(() => {
    if (!search) return null;
    return categories
      .filter(cat => cat.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search, categories]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHoveredPath([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCategory = (name: string) => {
    if (value.includes(name)) {
      onChange(value.filter(v => v !== name), mode);
    } else {
      onChange([...value, name], mode);
    }
  };

  const toggleMode = () => {
    onChange(value, mode === 'and' ? 'or' : 'and');
  };

  const clearAll = () => {
    onChange([], mode);
    setSearch('');
  };

  const removeCategory = (name: string) => {
    onChange(value.filter(v => v !== name), mode);
  };

  // 渲染一列
  const renderColumn = (nodes: TreeNode[], level: number) => {
    const currentHovered = hoveredPath[level];
    
    return (
      <div 
        key={level} 
        className="w-44 border-r border-gray-100 flex-shrink-0 overflow-y-auto"
        style={{ maxHeight: '280px' }}
      >
        {nodes.map(node => {
          const isSelected = value.includes(node.name);
          const isHovered = currentHovered?.id === node.id;
          const hasChildren = node.children.length > 0;

          return (
            <div
              key={node.id}
              className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs ${
                isHovered ? 'bg-blue-50' : isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
              onMouseEnter={() => {
                if (hasChildren) {
                  setHoveredPath(prev => [...prev.slice(0, level), node]);
                } else {
                  setHoveredPath(prev => prev.slice(0, level));
                }
              }}
              onClick={() => toggleCategory(node.name)}
            >
              {/* 选中标记 */}
              <span className={`w-4 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-transparent'}`}>
                <Check className="w-3.5 h-3.5" />
              </span>
              
              {/* 名称 */}
              <span className={`flex-1 truncate ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                {node.name}
              </span>
              
              {/* 子类目箭头 */}
              {hasChildren && (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* 触发器 */}
      <div
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setHoveredPath([]);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 bg-white min-w-[200px]"
      >
        <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
        
        {value.length === 0 ? (
          <span className="text-gray-400">选择类目</span>
        ) : (
          <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
            {value.slice(0, 2).map(cat => (
              <span
                key={cat}
                className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded flex items-center gap-1"
              >
                {cat.length > 10 ? cat.slice(0, 10) + '...' : cat}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCategory(cat);
                  }}
                  className="hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {value.length > 2 && (
              <span className="text-xs text-gray-500">+{value.length - 2}</span>
            )}
          </div>
        )}

        {value.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </div>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {/* 搜索框 + AND/OR */}
          <div className="p-2 border-b border-gray-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索类目..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {value.length > 1 && !excludeMode && (
              <button
                onClick={toggleMode}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  mode === 'and' 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
                title={mode === 'and' ? '同时满足所有类目' : '满足任一类目'}
              >
                {mode === 'and' ? 'AND' : 'OR'}
              </button>
            )}
            {onExcludeModeChange && (
              <button
                onClick={() => onExcludeModeChange(!excludeMode)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  excludeMode 
                    ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={excludeMode ? '排除模式：显示不在这些类目的商品' : '包含模式：显示在这些类目的商品'}
              >
                {excludeMode ? '排除' : '包含'}
              </button>
            )}
          </div>

          {/* 已选类目 */}
          {value.length > 0 && (
            <div className="px-2 py-1.5 border-b border-gray-100 bg-gray-50 max-w-md">
              <div className="flex flex-wrap gap-1">
                {value.map(cat => (
                  <span
                    key={cat}
                    className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded flex items-center gap-1"
                  >
                    {cat}
                    <button onClick={() => removeCategory(cat)} className="hover:text-blue-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 级联列表 */}
          {filteredList ? (
            // 搜索模式
            <div className="w-56 max-h-72 overflow-y-auto py-1">
              {filteredList.length > 0 ? (
                filteredList.map(cat => {
                  const isSelected = value.includes(cat.name);
                  return (
                    <div
                      key={cat.id}
                      onClick={() => toggleCategory(cat.name)}
                      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-gray-50 ${
                        isSelected ? 'bg-blue-50' : ''
                      }`}
                    >
                      <span className={`w-4 ${isSelected ? 'text-blue-600' : 'text-transparent'}`}>
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <span className={isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}>
                        {cat.name}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-sm text-gray-400 text-center">
                  没有找到 "{search}"
                </div>
              )}
            </div>
          ) : (
            // 级联模式
            <div className="flex">
              {/* 第一级 */}
              {renderColumn(tree, 0)}
              
              {/* 展开的子级 */}
              {hoveredPath.map((node, idx) => 
                node.children.length > 0 && renderColumn(node.children, idx + 1)
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
