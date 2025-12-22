import { useState } from 'react';
import { X, Loader2, Users, Globe } from 'lucide-react';
import type { SiteKey } from '../../lib/types';
import { useBatchAssign, useBatchMigrate } from '../../hooks/useCustomers';

interface BatchAssignModalProps {
  emails: string[];
  onClose: () => void;
}

const SITE_CONFIG: Record<SiteKey, { label: string; flag: string; description: string }> = {
  de: { label: 'Germany (DE)', flag: '🇩🇪', description: '德国、奥地利、瑞士等德语区' },
  com: { label: 'International (COM)', flag: '🌐', description: '美国及其他国际市场' },
  uk: { label: 'United Kingdom (UK)', flag: '🇬🇧', description: '英国和爱尔兰' },
  fr: { label: 'France (FR)', flag: '🇫🇷', description: '法国、比利时、卢森堡等法语区' },
};

export function BatchAssignModal({ emails, onClose }: BatchAssignModalProps) {
  const [selectedSite, setSelectedSite] = useState<SiteKey | null>(null);
  const [reason, setReason] = useState('');
  const [shouldMigrate, setShouldMigrate] = useState(false);

  const assignMutation = useBatchAssign();
  const migrateMutation = useBatchMigrate();

  const handleSubmit = async () => {
    if (!selectedSite) return;

    try {
      // 先分配
      await assignMutation.mutateAsync({
        emails,
        site: selectedSite,
        reason: reason || `Batch assigned to ${selectedSite}`,
      });

      // 如果选择了迁移
      if (shouldMigrate) {
        await migrateMutation.mutateAsync({ emails });
      }

      onClose();
    } catch (error) {
      console.error('Batch assign error:', error);
    }
  };

  const isLoading = assignMutation.isPending || migrateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">批量分配客户</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 选中数量 */}
          <div className="p-4 bg-blue-50 rounded-xl">
            <div className="text-sm text-blue-600">
              已选择 <span className="font-semibold">{emails.length}</span> 个客户
            </div>
          </div>

          {/* 站点选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              选择目标站点
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['de', 'com', 'uk', 'fr'] as SiteKey[]).map(site => {
                const config = SITE_CONFIG[site];
                return (
                  <button
                    key={site}
                    onClick={() => setSelectedSite(site)}
                    className={`p-4 text-left border rounded-xl transition-all ${
                      selectedSite === site
                        ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{config.flag}</span>
                      <span className="font-medium">{site.toUpperCase()}</span>
                    </div>
                    <div className="text-xs text-gray-500">{config.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 分配原因 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              分配原因（可选）
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="例如：根据客户要求手动分配"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
          </div>

          {/* 是否同时迁移 */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="shouldMigrate"
              checked={shouldMigrate}
              onChange={e => setShouldMigrate(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="shouldMigrate" className="text-sm text-gray-700">
              分配后立即迁移到 WooCommerce
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedSite || isLoading}
            className="px-4 py-2 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
            {shouldMigrate ? '分配并迁移' : '确认分配'}
          </button>
        </div>
      </div>
    </div>
  );
}
