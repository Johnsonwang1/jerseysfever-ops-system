/**
 * 尺寸比例选择器
 */

import { AD_ASPECT_RATIOS, type AdAspectRatio } from '@/lib/ad-creative/types';
import { Monitor, Smartphone, Layout } from 'lucide-react';

interface AspectRatioSelectorProps {
  value: AdAspectRatio;
  onChange: (ratio: AdAspectRatio) => void;
}

const RATIO_ICONS: Record<AdAspectRatio, typeof Monitor> = {
  '1:1': Layout,
  '9:16': Smartphone,
  '1.91:1': Monitor,
};

export function AspectRatioSelector({ value, onChange }: AspectRatioSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {(Object.entries(AD_ASPECT_RATIOS) as [AdAspectRatio, typeof AD_ASPECT_RATIOS['1:1']][]).map(([ratio, config]) => {
        const Icon = RATIO_ICONS[ratio];
        const isActive = value === ratio;

        return (
          <button
            key={ratio}
            onClick={() => onChange(ratio)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title={`${config.label} - ${config.description}`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}
