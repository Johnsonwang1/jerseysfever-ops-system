import { useState } from 'react';
import {
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShoppingCart,
  Globe,
  Brain,
  Hand,
  Loader2,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import type { Customer, SiteKey, Order } from '../../lib/types';
import {
  useCustomer,
  useAssignManually,
  useAnalyzeWithAI,
  useMigrateCustomer,
  useSkipMigration,
} from '../../hooks/useCustomers';
import { useAuth } from '../../lib/auth';

interface CustomerDetailModalProps {
  customer: Customer;
  onClose: () => void;
}

const SITE_CONFIG: Record<SiteKey, { label: string; flag: string; color: string }> = {
  de: { label: 'Germany (DE)', flag: '🇩🇪', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  com: { label: 'International (COM)', flag: '🌐', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  uk: { label: 'United Kingdom (UK)', flag: '🇬🇧', color: 'bg-red-100 text-red-800 border-red-200' },
  fr: { label: 'France (FR)', flag: '🇫🇷', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
};

export function CustomerDetailModal({ customer, onClose }: CustomerDetailModalProps) {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'info' | 'orders' | 'ai'>('info');

  // 获取完整客户数据（包括订单）
  const { data, isLoading } = useCustomer(customer.email);
  const customerData = data?.customer || customer;
  const orders = data?.orders || [];

  // Mutations
  const assignMutation = useAssignManually();
  const analyzeMutation = useAnalyzeWithAI();
  const migrateMutation = useMigrateCustomer();
  const skipMutation = useSkipMigration();

  const handleAssign = async (site: SiteKey) => {
    await assignMutation.mutateAsync({ email: customer.email, site });
  };

  const handleAnalyze = async () => {
    await analyzeMutation.mutateAsync(customer.email);
  };

  const handleMigrate = async () => {
    await migrateMutation.mutateAsync({ email: customer.email });
  };

  const handleSkip = async () => {
    await skipMutation.mutateAsync({ email: customer.email, reason: 'Skipped by admin' });
  };

  const formatAddress = (address: any) => {
    if (!address) return '-';
    const parts = [
      address.address_1,
      address.address_2,
      address.city,
      address.state,
      address.postcode,
      address.country,
    ].filter(Boolean);
    return parts.join(', ') || '-';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-xl font-semibold text-gray-600">
                {customerData.full_name?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {customerData.full_name || 'Unknown'}
              </h2>
              <p className="text-sm text-gray-500">{customerData.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b">
          <div className="flex gap-6">
            {[
              { key: 'info', label: '基本信息' },
              { key: 'orders', label: `订单 (${orders.length})` },
              { key: 'ai', label: 'AI 分析' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : activeTab === 'info' ? (
            <div className="space-y-6">
              {/* 当前分配状态 */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">站点分配</h3>
                  {customerData.assigned_site ? (
                    <span className={`px-3 py-1 text-sm rounded-full border ${SITE_CONFIG[customerData.assigned_site].color}`}>
                      {SITE_CONFIG[customerData.assigned_site].flag} {SITE_CONFIG[customerData.assigned_site].label}
                    </span>
                  ) : (
                    <span className="px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-600">
                      未分配
                    </span>
                  )}
                </div>
                {customerData.assignment_reason && (
                  <p className="text-xs text-gray-500 mb-3">{customerData.assignment_reason}</p>
                )}

                {/* 迁移状态 */}
                <div className="flex items-center gap-2 text-sm">
                  {customerData.migration_status === 'pending' && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <Clock className="w-4 h-4" /> 待迁移
                    </span>
                  )}
                  {customerData.migration_status === 'migrated' && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" /> 已迁移
                    </span>
                  )}
                  {customerData.migration_status === 'error' && (
                    <span className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="w-4 h-4" /> {customerData.migration_error}
                    </span>
                  )}
                  {customerData.migration_status === 'skipped' && (
                    <span className="flex items-center gap-1 text-gray-500">
                      <XCircle className="w-4 h-4" /> 已跳过
                    </span>
                  )}
                </div>
              </div>

              {/* 联系信息 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">联系信息</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{customerData.email}</span>
                  </div>
                  {customerData.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{customerData.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 地址信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">账单地址</h3>
                  <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400 inline mr-1" />
                    {formatAddress(customerData.billing_address)}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">收货地址</h3>
                  <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400 inline mr-1" />
                    {formatAddress(customerData.shipping_address)}
                  </div>
                </div>
              </div>

              {/* 订单统计 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">订单统计</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">总订单</div>
                    <div className="text-lg font-semibold">{customerData.order_stats?.total_orders || 0}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">总消费</div>
                    <div className="text-lg font-semibold">€{(customerData.order_stats?.total_spent || 0).toFixed(2)}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">首次订单</div>
                    <div className="text-sm">{customerData.order_stats?.first_order_date?.split('T')[0] || '-'}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">最近订单</div>
                    <div className="text-sm">{customerData.order_stats?.last_order_date?.split('T')[0] || '-'}</div>
                  </div>
                </div>
              </div>

              {/* 手动分配 */}
              {isAdmin && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">手动分配到站点</h3>
                  <div className="flex flex-wrap gap-2">
                    {(['de', 'com', 'uk', 'fr'] as SiteKey[]).map(site => (
                      <button
                        key={site}
                        onClick={() => handleAssign(site)}
                        disabled={assignMutation.isPending}
                        className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                          customerData.assigned_site === site
                            ? SITE_CONFIG[site].color
                            : 'hover:bg-gray-50 border-gray-200'
                        }`}
                      >
                        {SITE_CONFIG[site].flag} {site.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'orders' ? (
            <div className="space-y-3">
              {orders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>没有订单记录</p>
                </div>
              ) : (
                orders.map((order: any) => (
                  <div key={order.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">#{order.order_number}</span>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100">
                          {order.site?.toUpperCase()}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          order.status === 'completed' ? 'bg-green-100 text-green-700' :
                          order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>€{parseFloat(order.total || 0).toFixed(2)}</span>
                        <span>{order.date_created?.split('T')[0]}</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {customerData.ai_analysis ? (
                <>
                  <div className="p-4 bg-purple-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-5 h-5 text-purple-600" />
                      <span className="font-medium text-purple-900">AI 分析结果</span>
                      <span className="px-2 py-0.5 text-xs bg-purple-200 text-purple-800 rounded-full">
                        置信度: {Math.round((customerData.ai_analysis.overall_confidence || 0) * 100)}%
                      </span>
                    </div>
                    <p className="text-sm text-purple-800">{customerData.ai_analysis.reasoning}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 border rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">名字分析</div>
                      <div className="text-sm font-medium">{customerData.ai_analysis.name_analysis?.detected_origin || '-'}</div>
                      <div className="text-xs text-gray-400">
                        置信度: {Math.round((customerData.ai_analysis.name_analysis?.confidence || 0) * 100)}%
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">邮箱分析</div>
                      <div className="text-sm font-medium">{customerData.ai_analysis.email_analysis?.domain || '-'}</div>
                      <div className="text-xs text-gray-400">
                        国家: {customerData.ai_analysis.email_analysis?.domain_country || '-'}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">推荐站点</div>
                      <div className="text-sm font-medium">
                        {customerData.ai_analysis.recommended_site ? (
                          <>
                            {SITE_CONFIG[customerData.ai_analysis.recommended_site].flag}{' '}
                            {customerData.ai_analysis.recommended_site.toUpperCase()}
                          </>
                        ) : '-'}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Brain className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 mb-4">尚未进行 AI 分析</p>
                  {isAdmin && (
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzeMutation.isPending}
                      className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50"
                    >
                      {analyzeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      ) : (
                        <Brain className="w-4 h-4 inline mr-2" />
                      )}
                      运行 AI 分析
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - 操作按钮 */}
        {isAdmin && customerData.assigned_site && customerData.migration_status === 'pending' && (
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
            <button
              onClick={handleSkip}
              disabled={skipMutation.isPending}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              跳过迁移
            </button>
            <button
              onClick={handleMigrate}
              disabled={migrateMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg disabled:opacity-50"
            >
              {migrateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
              ) : (
                <Globe className="w-4 h-4 inline mr-2" />
              )}
              迁移到 {customerData.assigned_site.toUpperCase()}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
