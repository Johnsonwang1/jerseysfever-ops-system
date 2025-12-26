/**
 * 广告图列表页
 * 显示用户所有广告创作，支持筛选和搜索
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Trash2,
  Loader2,
  Copy,
  Download,
} from 'lucide-react';
import { useAdCreatives, useDeleteAdCreative, type AdCreativeStatus, type AdCreative } from '@/hooks/useAdCreatives';
import { ProductSelector } from '@/components/ad-creative/ProductSelector';
import { downloadImage } from '@/lib/ai-image';
import type { AdProductContext } from '@/lib/ad-creative/types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

type FilterStatus = AdCreativeStatus | 'all';

export function AdCreativeListPage() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // 模板套用相关状态
  const [templateForApply, setTemplateForApply] = useState<AdCreative | null>(null);

  const { data: creatives, isLoading } = useAdCreatives({
    status: filterStatus,
    search: searchQuery || undefined,
  });

  const deleteMutation = useDeleteAdCreative();

  // 处理删除
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个广告图吗？')) return;
    setDeleteId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } finally {
      setDeleteId(null);
    }
  };

  // 处理套用到其他商品
  const handleApplyTemplate = (creative: AdCreative) => {
    setTemplateForApply(creative);
  };

  // 选择商品后跳转
  const handleSelectProductForTemplate = (products: AdProductContext[]) => {
    if (templateForApply && products.length > 0) {
      const sku = products[0].sku;
      navigate(`/ad-creative/new?templateId=${templateForApply.id}&sku=${sku}`);
    }
    setTemplateForApply(null);
  };

  // 状态筛选按钮
  const FilterButton = ({
    status,
    label,
    icon: Icon,
  }: {
    status: FilterStatus;
    label: string;
    icon?: React.ElementType;
  }) => (
    <button
      onClick={() => setFilterStatus(status)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        filterStatus === status
          ? 'bg-purple-100 text-purple-700'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {label}
    </button>
  );

  // 状态徽章
  const StatusBadge = ({ status }: { status: AdCreativeStatus }) => {
    if (status === 'completed') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          已完成
        </span>
      );
    }
    if (status === 'draft') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
          <Clock className="w-3 h-3" />
          草稿
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
        已归档
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* 头部 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">广告图设计</h1>
          <button
            onClick={() => navigate('/ad-creative/new')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建
          </button>
        </div>

        {/* 筛选和搜索 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FilterButton status="all" label="全部" />
            <FilterButton status="draft" label="草稿" icon={Clock} />
            <FilterButton status="completed" label="已完成" icon={CheckCircle2} />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索商品..."
              className="pl-10 pr-4 py-2 w-64 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>
      </header>

      {/* 列表内容 */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : creatives && creatives.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {creatives.map((creative) => (
              <div
                key={creative.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-purple-200 transition-all group cursor-pointer"
                onClick={() => navigate(`/ad-creative/${creative.id}`)}
              >
                {/* 图片 */}
                <div className="aspect-square bg-gray-100 relative">
                  {creative.image_url ? (
                    <img
                      src={creative.image_url}
                      alt={creative.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <ImageIcon className="w-12 h-12" />
                    </div>
                  )}

                  {/* 悬停操作 */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    {/* 下载 */}
                    {creative.image_url && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const filename = creative.sku 
                            ? `ad-${creative.sku}-${creative.aspect_ratio}.png`
                            : `ad-creative-${creative.id}.png`;
                          downloadImage(creative.image_url!, filename);
                        }}
                        className="p-2 bg-white/90 text-gray-700 rounded-lg hover:bg-white transition-colors"
                        title="下载图片"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    {/* 套用到其他商品 */}
                    {creative.image_url && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyTemplate(creative);
                        }}
                        className="p-2 bg-white/90 text-purple-600 rounded-lg hover:bg-white transition-colors"
                        title="套用到其他商品"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    {/* 删除 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(creative.id);
                      }}
                      disabled={deleteId === creative.id}
                      className="p-2 bg-white/90 text-red-500 rounded-lg hover:bg-white transition-colors"
                      title="删除"
                    >
                      {deleteId === creative.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* 尺寸标签 */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                    {creative.aspect_ratio}
                  </div>
                </div>

                {/* 信息 */}
                <div className="p-3">
                  <h3 className="font-medium text-gray-900 text-sm truncate mb-1">
                    {creative.name}
                  </h3>
                  {creative.sku && (
                    <p className="text-xs text-gray-500 truncate mb-2">
                      SKU: {creative.sku}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <StatusBadge status={creative.status} />
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(creative.created_at), {
                        addSuffix: true,
                        locale: zhCN,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <ImageIcon className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg mb-2">暂无广告图</p>
            <p className="text-sm mb-4">点击"新建"开始创建你的第一个广告图</p>
            <button
              onClick={() => navigate('/ad-creative/new')}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建广告图
            </button>
          </div>
        )}
      </div>

      {/* 模板套用 - 商品选择器 */}
      {templateForApply && (
        <ProductSelector
          currentSkus={[]}
          multiSelect={false}
          onSelect={handleSelectProductForTemplate}
          onClose={() => setTemplateForApply(null)}
        />
      )}
    </div>
  );
}
