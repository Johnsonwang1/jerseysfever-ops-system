import type { ProductInfo } from '../lib/types';
import { ATTRIBUTE_OPTIONS, generateProductTitle, calculatePrice } from '../lib/attributes';
import { CategorySelector } from './CategorySelector';

interface ProductFormProps {
  info: ProductInfo;
  onChange: (info: ProductInfo) => void;
}

export function ProductForm({ info, onChange }: ProductFormProps) {
  const handleChange = (field: keyof ProductInfo, value: any) => {
    const newInfo = { ...info, [field]: value };

    // 当属性变化时自动计算价格
    if (['season', 'type', 'gender', 'sleeve'].includes(field)) {
      newInfo.price = calculatePrice(newInfo);
    }

    onChange(newInfo);
  };

  // 生成标题预览
  const titlePreview = generateProductTitle(info);

  return (
    <div className="space-y-4">
      {/* 标题预览 */}
      {titlePreview && (
        <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">标题预览</p>
          <p className="text-sm font-medium text-gray-900">{titlePreview}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 分类 */}
        <div className="col-span-2 md:col-span-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">分类</label>
          <CategorySelector
            value={info.categories}
            onChange={(value) => handleChange('categories', value)}
          />
        </div>

        {/* 赛季 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">赛季</label>
          <select
            value={ATTRIBUTE_OPTIONS.season.includes(info.season) ? info.season : '_custom'}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '_custom') {
                // 选择自定义时，设置一个不在列表中的值以显示输入框
                const newInfo = { ...info, season: '' };
                newInfo.price = calculatePrice(newInfo);
                onChange(newInfo);
                return;
              }
              // 根据赛季自动设置版本和分类，一次性更新所有字段
              const newInfo = { ...info, season: value };
              if (value === 'Retro') {
                newInfo.version = 'Retro';
                // 添加 Retro 分类
                if (!newInfo.categories.includes('Retro')) {
                  newInfo.categories = [...newInfo.categories, 'Retro'];
                }
              } else {
                newInfo.version = 'Standard';
                newInfo.year = '';
                // 移除 Retro 分类
                newInfo.categories = newInfo.categories.filter(c => c !== 'Retro');
              }
              newInfo.price = calculatePrice(newInfo);
              onChange(newInfo);
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
          >
            {ATTRIBUTE_OPTIONS.season.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="_custom">自定义...</option>
          </select>
          {/* 自定义赛季输入框 */}
          {!ATTRIBUTE_OPTIONS.season.includes(info.season) && (
            <input
              type="text"
              value={info.season}
              onChange={(e) => handleChange('season', e.target.value)}
              placeholder="输入自定义赛季，如 2021/22"
              className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
          )}
        </div>

        {/* Retro 年份 - 仅当赛季选择 Retro 时显示 */}
        {info.season === 'Retro' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Retro 年份</label>
            <input
              type="text"
              value={info.year}
              onChange={(e) => handleChange('year', e.target.value)}
              placeholder="例如: 1998/99"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>
        )}

        {/* 类型 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">类型</label>
          <select
            value={info.type}
            onChange={(e) => handleChange('type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
          >
            {ATTRIBUTE_OPTIONS.type.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* 版本 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">版本</label>
          <select
            value={info.version}
            onChange={(e) => handleChange('version', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
          >
            {ATTRIBUTE_OPTIONS.version.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* 性别 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">性别</label>
          <select
            value={info.gender}
            onChange={(e) => handleChange('gender', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
          >
            {ATTRIBUTE_OPTIONS.gender.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* 袖长 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">袖长</label>
          <select
            value={info.sleeve}
            onChange={(e) => handleChange('sleeve', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
          >
            {ATTRIBUTE_OPTIONS.sleeve.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* 价格 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">价格</label>
          <input
            type="text"
            value={info.price}
            onChange={(e) => handleChange('price', e.target.value)}
            placeholder="29.99"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
          />
        </div>

        {/* 赛事（多选） */}
        <div className="col-span-2 md:col-span-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">赛事</label>
          <div className="flex flex-wrap gap-2">
            {ATTRIBUTE_OPTIONS.event.map((event) => (
              <label
                key={event}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer transition-colors
                  ${
                    info.events.includes(event)
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={info.events.includes(event)}
                  onChange={(ev) => {
                    if (ev.target.checked) {
                      handleChange('events', [...info.events, event]);
                    } else {
                      handleChange(
                        'events',
                        info.events.filter((item) => item !== event)
                      );
                    }
                  }}
                  className="sr-only"
                />
                {event}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
