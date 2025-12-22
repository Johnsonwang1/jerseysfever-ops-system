/**
 * 多站点版本导出对话框
 * 基于确认的图片，为不同站点生成对应语言/货币版本
 */

import { useState, useCallback } from 'react';
import {
  X,
  Check,
  Loader2,
  Globe,
  Download,
  RefreshCw,
} from 'lucide-react';
import type { SiteKey } from '@/lib/types';
import type { AdAspectRatio, AdProductContext } from '@/lib/ad-creative/types';
import { processImage, downloadImage, type AIModelId, type AspectRatioId } from '@/lib/ai-image';

interface SiteExportDialogProps {
  imageUrl: string;
  productContext: AdProductContext | null;
  aspectRatio: AdAspectRatio;
  onClose: () => void;
}

// 站点配置
const SITE_CONFIGS: Record<SiteKey, { label: string; flag: string; currency: string; language: string }> = {
  com: { label: '.com (US)', flag: '🇺🇸', currency: 'USD', language: 'English' },
  uk: { label: '.uk (UK)', flag: '🇬🇧', currency: 'GBP', language: 'English' },
  de: { label: '.de (Germany)', flag: '🇩🇪', currency: 'EUR', language: 'German' },
  fr: { label: '.fr (France)', flag: '🇫🇷', currency: 'EUR', language: 'French' },
};

// 货币符号
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
};

interface SiteImageResult {
  site: SiteKey;
  status: 'pending' | 'generating' | 'success' | 'error';
  imageUrl?: string;
  error?: string;
}

export function SiteExportDialog({
  imageUrl,
  productContext,
  aspectRatio,
  onClose,
}: SiteExportDialogProps) {
  // 选中的站点
  const [selectedSites, setSelectedSites] = useState<Set<SiteKey>>(
    new Set(['com', 'uk', 'de', 'fr'])
  );
  // 生成结果
  const [results, setResults] = useState<SiteImageResult[]>([]);
  // 是否正在生成
  const [isGenerating, setIsGenerating] = useState(false);
  // 选择的模型
  const [model] = useState<AIModelId>('gemini-2.5-flash-image');

  // 切换站点选择
  const toggleSite = (site: SiteKey) => {
    setSelectedSites(prev => {
      const next = new Set(prev);
      if (next.has(site)) {
        next.delete(site);
      } else {
        next.add(site);
      }
      return next;
    });
  };

  // 构建站点特定的 prompt
  const buildSitePrompt = useCallback((site: SiteKey): string => {
    const config = SITE_CONFIGS[site];
    const price = productContext?.prices?.[site];
    const regularPrice = productContext?.regular_prices?.[site];
    const symbol = CURRENCY_SYMBOLS[config.currency];

    let prompt = `Modify this advertisement image for the ${config.language} market.\n\n`;
    prompt += `Requirements:\n`;
    prompt += `- Keep the same overall design and layout\n`;
    prompt += `- Update any text to be in ${config.language}\n`;

    if (price !== undefined) {
      prompt += `- Show the price as "${symbol}${price.toFixed(2)}"\n`;
      if (regularPrice !== undefined && regularPrice > price) {
        prompt += `- Show original price "${symbol}${regularPrice.toFixed(2)}" crossed out\n`;
      }
    }

    prompt += `- Maintain the same product focus and style\n`;
    prompt += `- Keep the brand watermark if present\n`;

    return prompt;
  }, [productContext]);

  // 转换 aspect ratio
  const getApiAspectRatio = (ratio: AdAspectRatio): AspectRatioId => {
    if (ratio === '1.91:1') return '16:9';
    return ratio as AspectRatioId;
  };

  // 生成站点版本
  const handleGenerate = useCallback(async () => {
    const sites = Array.from(selectedSites);
    if (sites.length === 0) return;

    setIsGenerating(true);

    // 初始化结果状态
    const initialResults: SiteImageResult[] = sites.map(site => ({
      site,
      status: 'pending',
    }));
    setResults(initialResults);

    // 逐个生成（或并行）
    for (const site of sites) {
      // 更新状态为 generating
      setResults(prev =>
        prev.map(r => (r.site === site ? { ...r, status: 'generating' } : r))
      );

      try {
        const prompt = buildSitePrompt(site);
        const result = await processImage({
          prompt,
          images: [imageUrl],
          model,
          aspectRatio: getApiAspectRatio(aspectRatio),
          temperature: 0.8,
          maxRetries: 3,
        });

        if (result.images && result.images.length > 0) {
          setResults(prev =>
            prev.map(r =>
              r.site === site
                ? { ...r, status: 'success', imageUrl: result.images[0] }
                : r
            )
          );
        } else {
          throw new Error('No image returned');
        }
      } catch (error) {
        console.error(`Failed to generate for ${site}:`, error);
        setResults(prev =>
          prev.map(r =>
            r.site === site
              ? { ...r, status: 'error', error: (error as Error).message }
              : r
          )
        );
      }
    }

    setIsGenerating(false);
  }, [selectedSites, imageUrl, aspectRatio, model, buildSitePrompt]);

  // 重试单个站点
  const handleRetry = useCallback(async (site: SiteKey) => {
    setResults(prev =>
      prev.map(r => (r.site === site ? { ...r, status: 'generating', error: undefined } : r))
    );

    try {
      const prompt = buildSitePrompt(site);
      const result = await processImage({
        prompt,
        images: [imageUrl],
        model,
        aspectRatio: getApiAspectRatio(aspectRatio),
        temperature: 0.8,
        maxRetries: 3,
      });

      if (result.images && result.images.length > 0) {
        setResults(prev =>
          prev.map(r =>
            r.site === site
              ? { ...r, status: 'success', imageUrl: result.images[0] }
              : r
          )
        );
      } else {
        throw new Error('No image returned');
      }
    } catch (error) {
      setResults(prev =>
        prev.map(r =>
          r.site === site
            ? { ...r, status: 'error', error: (error as Error).message }
            : r
        )
      );
    }
  }, [imageUrl, aspectRatio, model, buildSitePrompt]);

  // 下载图片（使用智能下载函数处理 CORS）
  const handleDownload = async (url: string, site: SiteKey) => {
    const filename = `ad-${productContext?.sku || 'creative'}-${site}.png`;
    await downloadImage(url, filename);
  };

  // 下载全部
  const handleDownloadAll = () => {
    results
      .filter(r => r.status === 'success' && r.imageUrl)
      .forEach(r => handleDownload(r.imageUrl!, r.site));
  };

  const hasResults = results.length > 0;
  const successCount = results.filter(r => r.status === 'success').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-purple-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">生成多站点版本</h3>
              <p className="text-sm text-gray-500">为不同站点生成对应语言和货币的广告图</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto p-6">
          {/* 原图预览 */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">原始图片</p>
            <div className="flex items-start gap-4">
              <img
                src={imageUrl}
                alt="Original"
                className="w-40 h-40 object-cover rounded-lg border border-gray-200"
              />
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-3">
                  选择需要生成的站点版本，AI 将根据各站点的语言和货币自动调整广告图：
                </p>
                {/* 站点选择 */}
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(SITE_CONFIGS) as SiteKey[]).map(site => {
                    const config = SITE_CONFIGS[site];
                    const isSelected = selectedSites.has(site);
                    const price = productContext?.prices?.[site];
                    return (
                      <button
                        key={site}
                        onClick={() => toggleSite(site)}
                        disabled={isGenerating}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="text-lg">{config.flag}</span>
                        <div className="text-left">
                          <p className="font-medium text-sm">{config.label}</p>
                          <p className="text-xs opacity-70">
                            {price !== undefined
                              ? `${CURRENCY_SYMBOLS[config.currency]}${price.toFixed(2)}`
                              : 'No price'}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-purple-500 ml-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 生成结果 */}
          {hasResults && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">生成结果</p>
                {successCount > 0 && (
                  <button
                    onClick={handleDownloadAll}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    下载全部 ({successCount})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {results.map(result => {
                  const config = SITE_CONFIGS[result.site];
                  return (
                    <div
                      key={result.site}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      {/* 图片区域 */}
                      <div className="aspect-square bg-gray-50 relative">
                        {result.status === 'pending' && (
                          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                            <span className="text-sm">等待中...</span>
                          </div>
                        )}
                        {result.status === 'generating' && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                          </div>
                        )}
                        {result.status === 'success' && result.imageUrl && (
                          <img
                            src={result.imageUrl}
                            alt={config.label}
                            className="w-full h-full object-cover"
                          />
                        )}
                        {result.status === 'error' && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 p-4">
                            <span className="text-sm text-center mb-2">生成失败</span>
                            <button
                              onClick={() => handleRetry(result.site)}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 rounded-lg hover:bg-red-100"
                            >
                              <RefreshCw className="w-3 h-3" />
                              重试
                            </button>
                          </div>
                        )}
                      </div>
                      {/* 站点信息 */}
                      <div className="p-2 bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span>{config.flag}</span>
                          <span className="text-xs font-medium text-gray-700">{config.label}</span>
                        </div>
                        {result.status === 'success' && result.imageUrl && (
                          <button
                            onClick={() => handleDownload(result.imageUrl!, result.site)}
                            className="p-1 text-gray-400 hover:text-purple-600 transition-colors"
                            title="下载"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500">
            已选择 {selectedSites.size} 个站点
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              关闭
            </button>
            <button
              onClick={handleGenerate}
              disabled={selectedSites.size === 0 || isGenerating}
              className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  开始生成
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
