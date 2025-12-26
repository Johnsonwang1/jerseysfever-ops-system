import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

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
  // 上周（周一到周日）
  const getLastWeek = () => {
    const d = new Date();
    const dayOfWeek = d.getDay(); // 0=周日, 1=周一, ...
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 距离本周一的天数
    const lastMonday = new Date(d);
    lastMonday.setDate(d.getDate() - daysToLastMonday - 7); // 上周一
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6); // 上周日
    return {
      from: lastMonday.toISOString().split('T')[0],
      to: lastSunday.toISOString().split('T')[0],
    };
  };
  // 上月
  const getLastMonth = () => {
    const d = new Date();
    const lastMonthYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
    const lastMonth = d.getMonth() === 0 ? 11 : d.getMonth() - 1;
    const firstDay = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(lastMonthYear, lastMonth + 1, 0);
    const lastDayStr = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    return { from: firstDay, to: lastDayStr };
  };
  const getLastYearSameMonth = () => {
    const d = new Date();
    const lastYear = d.getFullYear() - 1;
    const month = d.getMonth();
    const firstDay = `${lastYear}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(lastYear, month + 1, 0);
    const lastDayStr = `${lastYear}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    return { from: firstDay, to: lastDayStr };
  };

  const lastWeek = getLastWeek();
  const lastMonth = getLastMonth();
  const lastYearMonth = getLastYearSameMonth();

  return [
    { label: '今天', from: getToday(), to: getToday() },
    { label: '昨天', from: getYesterday(), to: getYesterday() },
    { label: '上周', from: lastWeek.from, to: lastWeek.to },
    { label: '近7天', from: getDaysAgo(6), to: getToday() },
    { label: '近14天', from: getDaysAgo(13), to: getToday() },
    { label: '上月', from: lastMonth.from, to: lastMonth.to },
    { label: '近30天', from: getDaysAgo(29), to: getToday() },
    { label: '本月', from: getMonthStart(), to: getToday() },
    { label: '去年同月', from: lastYearMonth.from, to: lastYearMonth.to },
  ];
};

// 格式化日期显示
const formatDateDisplay = (date: string) => {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 生成日历网格
const generateCalendarDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

  const days: (number | null)[] = [];
  
  // 填充开头的空白
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  
  // 填充日期
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }
  
  return days;
};

// 格式化为 YYYY-MM-DD
const formatDate = (year: number, month: number, day: number) => {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// 验证日期格式
const isValidDate = (dateStr: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  return d instanceof Date && !isNaN(d.getTime());
};

// 月份名称
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export function DateRangePicker({ dateFrom, dateTo, onChange, presets }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectingStart, setSelectingStart] = useState(true); // true = 选开始日期, false = 选结束日期
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const datePresets = presets || getDefaultPresets();

  // 手动输入的本地状态
  const [inputFrom, setInputFrom] = useState(dateFrom);
  const [inputTo, setInputTo] = useState(dateTo);

  // 同步外部值到本地输入
  useEffect(() => {
    setInputFrom(dateFrom);
    setInputTo(dateTo);
  }, [dateFrom, dateTo]);

  // 日历显示的年月 (两个月份)
  const [viewDate, setViewDate] = useState(() => {
    const d = dateFrom ? new Date(dateFrom) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

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

  // 上一个月
  const prevMonth = useCallback(() => {
    setViewDate(prev => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  }, []);

  // 下一个月
  const nextMonth = useCallback(() => {
    setViewDate(prev => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  }, []);

  // 点击日期
  const handleDateClick = useCallback((dateStr: string) => {
    if (selectingStart) {
      // 选开始日期
      onChange(dateStr, '');
      setSelectingStart(false);
    } else {
      // 选结束日期
      if (dateStr < dateFrom) {
        // 如果结束日期早于开始日期，交换
        onChange(dateStr, dateFrom);
      } else {
        onChange(dateFrom, dateStr);
      }
      setSelectingStart(true);
      setIsOpen(false);
    }
  }, [selectingStart, dateFrom, onChange]);

  // 处理手动输入 - 开始日期
  const handleInputFromBlur = useCallback(() => {
    if (inputFrom && isValidDate(inputFrom)) {
      if (inputTo && inputFrom > inputTo) {
        // 如果开始日期晚于结束日期，交换
        onChange(inputTo, inputFrom);
      } else {
        onChange(inputFrom, dateTo);
      }
    } else if (!inputFrom) {
      onChange('', dateTo);
    } else {
      // 无效输入，恢复原值
      setInputFrom(dateFrom);
    }
  }, [inputFrom, inputTo, dateFrom, dateTo, onChange]);

  // 处理手动输入 - 结束日期
  const handleInputToBlur = useCallback(() => {
    if (inputTo && isValidDate(inputTo)) {
      if (dateFrom && inputTo < dateFrom) {
        // 如果结束日期早于开始日期，交换
        onChange(inputTo, dateFrom);
      } else {
        onChange(dateFrom, inputTo);
      }
    } else if (!inputTo) {
      onChange(dateFrom, '');
    } else {
      // 无效输入，恢复原值
      setInputTo(dateTo);
    }
  }, [inputTo, dateFrom, dateTo, onChange]);

  // 处理回车键
  const handleInputKeyDown = (e: React.KeyboardEvent, isFrom: boolean) => {
    if (e.key === 'Enter') {
      if (isFrom) {
        handleInputFromBlur();
      } else {
        handleInputToBlur();
      }
    }
  };

  // 判断日期是否在选中范围内
  const isInRange = (dateStr: string) => {
    if (!dateFrom) return false;
    const endDate = selectingStart ? dateTo : (hoverDate || dateTo);
    if (!endDate) return false;
    return dateStr >= dateFrom && dateStr <= endDate;
  };

  // 判断是否是开始或结束日期
  const isStartDate = (dateStr: string) => dateStr === dateFrom;
  const isEndDate = (dateStr: string) => dateStr === dateTo || (!selectingStart && dateStr === hoverDate);

  // 渲染单个月份
  const renderMonth = (year: number, month: number) => {
    const days = generateCalendarDays(year, month);
    const today = new Date().toISOString().split('T')[0];

    return (
      <div className="w-[220px]">
        <div className="text-center text-sm font-medium text-gray-700 mb-2">
          {year}年 {MONTH_NAMES[month]}
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAY_NAMES.map(name => (
            <div key={name} className="text-center text-xs text-gray-400 py-1">
              {name}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="h-7" />;
            }
            
            const dateStr = formatDate(year, month, day);
            const isToday = dateStr === today;
            const inRange = isInRange(dateStr);
            const isStart = isStartDate(dateStr);
            const isEnd = isEndDate(dateStr);
            
            return (
              <button
                key={day}
                onClick={() => handleDateClick(dateStr)}
                onMouseEnter={() => !selectingStart && setHoverDate(dateStr)}
                onMouseLeave={() => setHoverDate(null)}
                className={`
                  h-7 text-xs rounded transition-colors relative
                  ${isStart || isEnd 
                    ? 'bg-gray-900 text-white font-medium' 
                    : inRange 
                      ? 'bg-gray-100 text-gray-700' 
                      : 'hover:bg-gray-50 text-gray-700'
                  }
                  ${isToday && !isStart && !isEnd ? 'font-bold text-blue-600' : ''}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // 第二个月
  const nextMonthDate = viewDate.month === 11 
    ? { year: viewDate.year + 1, month: 0 }
    : { year: viewDate.year, month: viewDate.month + 1 };

  return (
    <div className="relative" ref={containerRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setSelectingStart(true);
            // 如果有选中的开始日期，定位到那个月份
            if (dateFrom) {
              const d = new Date(dateFrom);
              setViewDate({ year: d.getFullYear(), month: d.getMonth() });
            }
          }
        }}
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
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4">
          {/* 快捷选项 */}
          <div className="flex flex-wrap gap-1.5 mb-4 pb-3 border-b border-gray-100">
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

          {/* 手动输入区域 */}
          <div className="mb-4 pb-3 border-b border-gray-100">
            <div className="text-xs text-gray-500 mb-2">手动输入 <span className="text-gray-400">(格式: YYYY-MM-DD)</span></div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputFrom}
                onChange={(e) => setInputFrom(e.target.value)}
                onBlur={handleInputFromBlur}
                onKeyDown={(e) => handleInputKeyDown(e, true)}
                placeholder="开始日期"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 font-mono"
              />
              <span className="text-gray-400 text-sm">~</span>
              <input
                type="text"
                value={inputTo}
                onChange={(e) => setInputTo(e.target.value)}
                onBlur={handleInputToBlur}
                onKeyDown={(e) => handleInputKeyDown(e, false)}
                placeholder="结束日期"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 font-mono"
              />
            </div>
          </div>

          {/* 选择提示 */}
          <div className="text-xs text-gray-500 mb-3">
            {selectingStart ? (
              <span>👈 点击选择<span className="font-medium text-gray-700">开始日期</span></span>
            ) : (
              <span>👉 点击选择<span className="font-medium text-gray-700">结束日期</span></span>
            )}
            {dateFrom && (
              <span className="ml-2 text-gray-400">
                已选: {formatDateDisplay(dateFrom)}{dateTo ? ` ~ ${formatDateDisplay(dateTo)}` : ''}
              </span>
            )}
          </div>

          {/* 月份导航 + 日历 */}
          <div className="flex items-start gap-4">
            {/* 上月按钮 */}
            <button
              onClick={prevMonth}
              className="mt-6 p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>

            {/* 两个月份日历 */}
            <div className="flex gap-4">
              {renderMonth(viewDate.year, viewDate.month)}
              {renderMonth(nextMonthDate.year, nextMonthDate.month)}
            </div>

            {/* 下月按钮 */}
            <button
              onClick={nextMonth}
              className="mt-6 p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* 底部操作 */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <button
              onClick={() => {
                onChange('', '');
                setSelectingStart(true);
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              清除
            </button>
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
