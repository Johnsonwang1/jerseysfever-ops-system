import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  presets?: { label: string; from: string; to: string }[];
}

// 默认的日期快捷选项
const getDefaultPresets = () => {
  const getToday = () => new Date().toISOString().split('T')[0];
  const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const getDaysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };
  const getMonthStart = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };

  return [
    { label: '今天', from: getToday(), to: getToday() },
    { label: '昨天', from: getYesterday(), to: getYesterday() },
    { label: '近7天', from: getDaysAgo(6), to: getToday() },
    { label: '近30天', from: getDaysAgo(29), to: getToday() },
    { label: '本月', from: getMonthStart(), to: getToday() },
    { label: '全部', from: '', to: '' },
  ];
};

// 格式化日期显示
const formatDateDisplay = (date: string) => {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function DateRangePicker({ dateFrom, dateTo, onChange, presets }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const datePresets = presets || getDefaultPresets();

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

  // 开始日期变化后自动聚焦到结束日期
  const handleFromChange = useCallback((value: string) => {
    onChange(value, dateTo);
    // 延迟一下再聚焦，等 DOM 更新
    setTimeout(() => {
      dateToRef.current?.focus();
      dateToRef.current?.showPicker?.();
    }, 50);
  }, [onChange, dateTo]);

  // 找到当前选中的预设
  const currentPreset = datePresets.find(p => p.from === dateFrom && p.to === dateTo);

  // 显示文本
  const displayText = currentPreset
    ? currentPreset.label
    : dateFrom && dateTo
      ? `${formatDateDisplay(dateFrom)} ~ ${formatDateDisplay(dateTo)}`
      : dateFrom
        ? `${formatDateDisplay(dateFrom)} ~`
        : '选择日期';

  return (
    <div className="relative" ref={containerRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors min-w-[140px] ${
          isOpen ? 'border-gray-400 ring-2 ring-gray-900/10' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-700 flex-1 text-left">{displayText}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3 min-w-[280px]">
          {/* 快捷选项 */}
          <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-gray-100">
            {datePresets.map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  onChange(preset.from, preset.to);
                  setIsOpen(false);
                }}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  dateFrom === preset.from && dateTo === preset.to
                    ? 'bg-gray-900 border-gray-900 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* 自定义日期输入 */}
          <div className="space-y-2">
            <div className="text-xs text-gray-500 font-medium">自定义范围 <span className="text-gray-400 font-normal">(选完开始自动跳转结束)</span></div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleFromChange(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
              />
              <span className="text-gray-400 text-sm">~</span>
              <input
                ref={dateToRef}
                type="date"
                value={dateTo}
                onChange={(e) => onChange(dateFrom, e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
              />
            </div>
          </div>

          {/* 确认按钮 */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
