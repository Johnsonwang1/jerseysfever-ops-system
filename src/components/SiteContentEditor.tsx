import { useState } from 'react';
import { Eye, Edit3, Copy } from 'lucide-react';
import type { SiteKey } from '../lib/types';

interface SiteContent {
  name: string;
  description: string;
  short_description: string;
}

interface SiteContentEditorProps {
  content: Partial<Record<SiteKey, SiteContent>>;
  defaultName: string;
  onChange: (content: Partial<Record<SiteKey, SiteContent>>) => void;
  syncStatus?: Partial<Record<SiteKey, string>>;
  disabled?: boolean;
}

const SITE_CONFIG: {
  key: SiteKey;
  label: string;
  flag: string;
  language: string;
}[] = [
  { key: 'com', label: 'jerseysfever.com', flag: '🇺🇸', language: 'English' },
  { key: 'uk', label: 'jerseysfever.uk', flag: '🇬🇧', language: 'English' },
  { key: 'de', label: 'jerseysfever.de', flag: '🇩🇪', language: 'Deutsch' },
  { key: 'fr', label: 'jerseysfever.fr', flag: '🇫🇷', language: 'Français' },
];

export function SiteContentEditor({
  content,
  defaultName,
  onChange,
  syncStatus,
  disabled
}: SiteContentEditorProps) {
  const [activeSite, setActiveSite] = useState<SiteKey>('com');
  const [isPreview, setIsPreview] = useState(true); // 默认预览模式

  // 获取当前站点的内容，如果没有则回退到 com 站点的内容
  const getContentForSite = (site: SiteKey): SiteContent => {
    const siteContent = content[site];
    const comContent = content.com;
    
    return {
      name: siteContent?.name || comContent?.name || defaultName,
      description: siteContent?.description || comContent?.description || '',
      short_description: siteContent?.short_description || comContent?.short_description || '',
    };
  };

  const currentContent = getContentForSite(activeSite);
  const hasOwnContent = !!content[activeSite]?.name;

  const handleChange = (field: keyof SiteContent, value: string) => {
    onChange({
      ...content,
      [activeSite]: {
        ...currentContent,
        [field]: value,
      },
    });
  };

  // 从 com 站点复制到当前站点
  const copyFromCom = () => {
    const comContent = content.com;
    if (comContent) {
      onChange({
        ...content,
        [activeSite]: { ...comContent },
      });
    }
  };

  // 复制当前站点到所有站点
  const copyToAll = () => {
    const newContent: Partial<Record<SiteKey, SiteContent>> = {};
    SITE_CONFIG.forEach(site => {
      newContent[site.key] = { ...currentContent };
    });
    onChange(newContent);
  };

  // HTML 预览组件
  const HtmlPreview = ({ html, className = '' }: { html: string; className?: string }) => (
    <div 
      className={`prose prose-sm max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html || '<span class="text-gray-400 italic">暂无内容</span>' }}
    />
  );

  return (
    <div className="space-y-4">
      {/* 站点切换标签 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        {SITE_CONFIG.map((site) => {
          const status = syncStatus?.[site.key];
          const isActive = activeSite === site.key;
          const hasSiteContent = !!content[site.key]?.name;
          
          return (
            <button
              key={site.key}
              onClick={() => setActiveSite(site.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>{site.flag}</span>
              <span>{site.key.toUpperCase()}</span>
              {hasSiteContent && (
                <span className="w-2 h-2 rounded-full bg-green-500" />
              )}
              {status === 'error' && (
                <span className="w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* 工具栏 */}
      <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-sm">
            <span className="text-gray-500">当前站点：</span>
            <span className="font-medium text-gray-900 ml-1">
              {SITE_CONFIG.find(s => s.key === activeSite)?.label}
            </span>
            <span className="text-gray-400 ml-2">
              ({SITE_CONFIG.find(s => s.key === activeSite)?.language})
            </span>
          </div>
          {!hasOwnContent && activeSite !== 'com' && (
            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
              使用 .com 内容
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 预览/编辑切换 */}
          <div className="flex items-center gap-1 p-1 bg-gray-200 rounded-lg">
            <button
              onClick={() => setIsPreview(true)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                isPreview ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              <Eye className="w-3 h-3" />
              预览
            </button>
            <button
              onClick={() => setIsPreview(false)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                !isPreview ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              编辑
            </button>
          </div>
          
          {activeSite !== 'com' && (
            <button
              onClick={copyFromCom}
              disabled={disabled || !content.com}
              className="flex items-center gap-1 text-xs px-2 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Copy className="w-3 h-3" />
              从 .com 复制
            </button>
          )}
          <button
            onClick={copyToAll}
            disabled={disabled}
            className="text-xs px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
          >
            复制到所有站点
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      {isPreview ? (
        // 预览模式
        <div className="space-y-4">
          {/* 名称预览 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">商品名称</label>
            <div className="px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg">
              {currentContent.name || <span className="text-gray-400 italic">暂无名称</span>}
            </div>
          </div>

          {/* 短描述预览 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">短描述</label>
            <div className="px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg min-h-[60px]">
              <HtmlPreview html={currentContent.short_description} />
            </div>
          </div>

          {/* 详细描述预览 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">详细描述</label>
            <div className="px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg min-h-[150px] max-h-[300px] overflow-y-auto">
              <HtmlPreview html={currentContent.description} />
            </div>
          </div>
        </div>
      ) : (
        // 编辑模式
        <div className="space-y-4">
          {/* 名称 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              商品名称
            </label>
            <input
              type="text"
              value={currentContent.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="输入商品名称"
              disabled={disabled}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* 短描述 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              短描述 <span className="text-gray-400 font-normal">(支持 HTML)</span>
            </label>
            <textarea
              value={currentContent.short_description}
              onChange={(e) => handleChange('short_description', e.target.value)}
              placeholder="输入短描述（显示在商品列表，支持 HTML）"
              rows={4}
              disabled={disabled}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed font-mono text-xs"
            />
          </div>

          {/* 详细描述 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              详细描述 <span className="text-gray-400 font-normal">(支持 HTML)</span>
            </label>
            <textarea
              value={currentContent.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="输入详细描述（支持 HTML）"
              rows={8}
              disabled={disabled}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed font-mono text-xs"
            />
          </div>
        </div>
      )}

      {/* 内容状态提示 */}
      <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
        {SITE_CONFIG.map(site => {
          const hasContent = content[site.key]?.name;
          return (
            <div key={site.key} className="flex items-center gap-1">
              <span>{site.flag}</span>
              <span className={hasContent ? 'text-green-600' : 'text-gray-400'}>
                {hasContent ? '已设置' : '使用主站'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
