import { useState, useRef } from 'react';
import {
  Users,
  Loader2,
  AlertCircle,
  Search,
  X,
  Filter,
  Download,
  Upload,
  Wand2,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  Globe,
  MapPin,
  Mail,
  Brain,
  Hand,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  useCustomers,
  useCustomersRealtime,
  useCustomerStats,
  useExtractCustomers,
  useAssignByAddress,
  useBatchAnalyzeWithAI,
} from '../hooks/useCustomers';
import { CustomerDetailModal } from '../components/customers/CustomerDetailModal';
import { BatchAssignModal } from '../components/customers/BatchAssignModal';
import type {
  Customer,
  SiteKey,
  CustomerMigrationStatus,
  CustomerAssignmentMethod,
} from '../lib/types';

const ALL_SITES: (SiteKey | 'unassigned')[] = ['de', 'com', 'uk', 'fr', 'unassigned'];
const MIGRATION_STATUSES: CustomerMigrationStatus[] = ['pending', 'migrated', 'skipped', 'error'];
const ASSIGNMENT_METHODS: (CustomerAssignmentMethod | 'unassigned')[] = ['address', 'email_domain', 'ai_analysis', 'manual', 'unassigned'];

const SITE_CONFIG: Record<SiteKey | 'unassigned', { label: string; flag: string; color: string }> = {
  de: { label: 'DE', flag: '🇩🇪', color: 'bg-yellow-100 text-yellow-800' },
  com: { label: 'COM', flag: '🌐', color: 'bg-blue-100 text-blue-800' },
  uk: { label: 'UK', flag: '🇬🇧', color: 'bg-red-100 text-red-800' },
  fr: { label: 'FR', flag: '🇫🇷', color: 'bg-indigo-100 text-indigo-800' },
  unassigned: { label: '未分配', flag: '❓', color: 'bg-gray-100 text-gray-600' },
};

const MIGRATION_STATUS_CONFIG: Record<CustomerMigrationStatus, { label: string; icon: typeof CheckCircle; color: string }> = {
  pending: { label: '待迁移', icon: Clock, color: 'text-yellow-500' },
  migrated: { label: '已迁移', icon: CheckCircle, color: 'text-green-500' },
  skipped: { label: '已跳过', icon: XCircle, color: 'text-gray-400' },
  error: { label: '错误', icon: AlertCircle, color: 'text-red-500' },
};

const METHOD_CONFIG: Record<CustomerAssignmentMethod | 'unassigned', { label: string; icon: typeof MapPin }> = {
  address: { label: '地址', icon: MapPin },
  email_domain: { label: '邮箱', icon: Mail },
  ai_analysis: { label: 'AI', icon: Brain },
  manual: { label: '手动', icon: Hand },
  unassigned: { label: '未分配', icon: Globe },
};

export function CustomersPage() {
  const { isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const perPage = 50;

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedSite, setSelectedSite] = useState<SiteKey | 'unassigned' | ''>('');
  const [selectedMigrationStatus, setSelectedMigrationStatus] = useState<CustomerMigrationStatus | ''>('');
  const [selectedMethod, setSelectedMethod] = useState<CustomerAssignmentMethod | 'unassigned' | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 选择状态（用于批量操作）
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  // 弹窗状态
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showBatchAssignModal, setShowBatchAssignModal] = useState(false);

  // 排序状态（服务端排序）
  const [sortField, setSortField] = useState<'valid_spent' | 'invalid_spent' | ''>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // React Query
  const {
    data: customersData,
    isLoading,
    error: customersError,
    refetch: refetchCustomers,
  } = useCustomers({
    page,
    perPage,
    search: searchQuery || undefined,
    assignedSite: selectedSite || undefined,
    migrationStatus: selectedMigrationStatus || undefined,
    assignmentMethod: selectedMethod === 'unassigned' ? undefined : (selectedMethod || undefined),
    sortField: sortField || undefined,
    sortOrder: sortField ? sortOrder : undefined,
  });

  const { data: stats } = useCustomerStats();

  // Realtime 订阅
  useCustomersRealtime();

  // Mutations
  const extractMutation = useExtractCustomers();
  const assignByAddressMutation = useAssignByAddress();
  const batchAIMutation = useBatchAnalyzeWithAI();

  const customers = customersData?.customers || [];
  const total = customersData?.total || 0;
  const totalPages = customersData?.totalPages || 1;
  const error = customersError ? (customersError as Error).message : null;

  // 实时搜索（防抖 300ms）
  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
      setPage(1);
    }, 300);
  };

  // 清除筛选
  const clearFilters = () => {
    setSelectedSite('');
    setSelectedMigrationStatus('');
    setSelectedMethod('');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  // 提取客户
  const handleExtract = async () => {
    await extractMutation.mutateAsync();
    refetchCustomers();
  };

  // 基于地址分配
  const handleAssignByAddress = async () => {
    await assignByAddressMutation.mutateAsync({});
    refetchCustomers();
  };

  // AI 分析
  const handleBatchAI = async () => {
    await batchAIMutation.mutateAsync({ batchSize: 10 });
    refetchCustomers();
  };

  // 切换选择
  const toggleSelect = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedEmails.size === customers.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(customers.map(c => c.email)));
    }
  };

  const hasFilters = selectedSite || selectedMigrationStatus || selectedMethod || searchQuery;

  // 排序处理（服务端排序）
  const handleSort = (field: 'valid_spent' | 'invalid_spent') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1); // 排序时回到第一页
  };

  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* 头部区域 */}
      <div className="bg-gray-50 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6 space-y-4 sm:space-y-5">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 flex-shrink-0" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">客户管理</h1>
            <span className="hidden sm:inline text-sm text-gray-500">
              （{total} 个客户）
            </span>
          </div>

          {/* 操作按钮 */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExtract}
                disabled={extractMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {extractMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">提取客户</span>
              </button>

              <button
                onClick={handleAssignByAddress}
                disabled={assignByAddressMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {assignByAddressMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MapPin className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">地址分配</span>
              </button>

              <button
                onClick={handleBatchAI}
                disabled={batchAIMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {batchAIMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">AI 分析</span>
              </button>
            </div>
          )}
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(['de', 'com', 'uk', 'fr', 'unassigned'] as const).map(site => {
              const config = SITE_CONFIG[site];
              const count = stats.siteDistribution[site] || 0;
              return (
                <button
                  key={site}
                  onClick={() => {
                    setSelectedSite(selectedSite === site ? '' : site);
                    setPage(1);
                  }}
                  className={`p-3 rounded-xl border transition-all ${
                    selectedSite === site
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">{config.flag}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <div className="text-xl font-semibold text-gray-900">{count.toLocaleString()}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* 搜索和筛选栏 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索邮箱、姓名..."
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
              />
            </div>

            {/* 筛选按钮 */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 border rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap ${
                hasFilters ? 'border-gray-900 text-gray-900' : 'border-gray-200'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>筛选</span>
              {hasFilters && (
                <span className="px-1.5 py-0.5 text-xs bg-gray-900 text-white rounded">
                  {[selectedSite, selectedMigrationStatus, selectedMethod].filter(Boolean).length}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {/* 批量操作按钮 */}
            {selectedEmails.size > 0 && (
              <button
                onClick={() => setShowBatchAssignModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                批量分配 ({selectedEmails.size})
              </button>
            )}

            {/* 清除筛选 */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
                清除
              </button>
            )}
          </div>

          {/* 筛选面板 */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
              {/* 迁移状态 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">迁移状态</label>
                <div className="flex flex-wrap gap-2">
                  {MIGRATION_STATUSES.map(status => {
                    const config = MIGRATION_STATUS_CONFIG[status];
                    const Icon = config.icon;
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          setSelectedMigrationStatus(selectedMigrationStatus === status ? '' : status);
                          setPage(1);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                          selectedMigrationStatus === status
                            ? 'border-gray-900 bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 分配方法 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">分配方法</label>
                <div className="flex flex-wrap gap-2">
                  {ASSIGNMENT_METHODS.map(method => {
                    const config = METHOD_CONFIG[method];
                    const Icon = config.icon;
                    return (
                      <button
                        key={method}
                        onClick={() => {
                          setSelectedMethod(selectedMethod === method ? '' : method);
                          setPage(1);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                          selectedMethod === method
                            ? 'border-gray-900 bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 客户列表 */}
      <div className="flex-1 px-4 sm:px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-red-500">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="w-12 h-12 mb-4 text-gray-300" />
            <p>没有找到客户</p>
            {!hasFilters && isAdmin && (
              <button
                onClick={handleExtract}
                className="mt-4 px-4 py-2 text-sm text-white bg-gray-900 rounded-lg hover:bg-gray-800"
              >
                从订单提取客户
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedEmails.size === customers.length && customers.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">客户</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">国家</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">站点</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">分配方法</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">订单</th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('valid_spent')}
                  >
                    有效消费 {sortField === 'valid_spent' && (sortOrder === 'desc' ? '↓' : '↑')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden xl:table-cell cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('invalid_spent')}
                  >
                    无效消费 {sortField === 'invalid_spent' && (sortOrder === 'desc' ? '↓' : '↑')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden xl:table-cell">首单</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">最近下单</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map(customer => {
                  const siteConfig = SITE_CONFIG[customer.assigned_site || 'unassigned'];
                  const methodConfig = METHOD_CONFIG[customer.assignment_method || 'unassigned'] || METHOD_CONFIG.unassigned;
                  const migrationConfig = MIGRATION_STATUS_CONFIG[customer.migration_status] || MIGRATION_STATUS_CONFIG.pending;
                  const MigrationIcon = migrationConfig.icon;
                  const MethodIcon = methodConfig.icon;

                  return (
                    <tr
                      key={customer.email}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedEmails.has(customer.email)}
                          onChange={() => toggleSelect(customer.email)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">
                            {customer.full_name || '-'}
                          </span>
                          <span className="text-xs text-gray-500 truncate max-w-[200px]">
                            {customer.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {customer.shipping_address?.country || customer.billing_address?.country || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${siteConfig.color}`}>
                          {siteConfig.flag} {siteConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                          <MethodIcon className="w-3.5 h-3.5" />
                          {methodConfig.label}
                          {customer.assignment_confidence && (
                            <span className="text-gray-400">
                              ({Math.round(customer.assignment_confidence * 100)}%)
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                        <span className="text-green-600">{customer.order_stats?.valid_orders || 0}</span>
                        {(customer.order_stats?.invalid_orders || 0) > 0 && (
                          <span className="text-gray-400"> / {customer.order_stats?.invalid_orders}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm hidden lg:table-cell">
                        <span className="text-green-600 font-medium">
                          €{(Number(customer.order_stats?.valid_spent) || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm hidden xl:table-cell">
                        <span className="text-gray-400">
                          €{(Number(customer.order_stats?.invalid_spent) || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden xl:table-cell">
                        {customer.order_stats?.first_order_date
                          ? new Date(customer.order_stats.first_order_date).toLocaleDateString('zh-CN')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                        {customer.order_stats?.last_order_date
                          ? new Date(customer.order_stats.last_order_date).toLocaleDateString('zh-CN')
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs ${migrationConfig.color}`}>
                          <MigrationIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{migrationConfig.label}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  第 {page} / {totalPages} 页，共 {total} 条
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 客户详情弹窗 */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* 批量分配弹窗 */}
      {showBatchAssignModal && (
        <BatchAssignModal
          emails={Array.from(selectedEmails)}
          onClose={() => {
            setShowBatchAssignModal(false);
            setSelectedEmails(new Set());
            refetchCustomers();
          }}
        />
      )}
    </div>
  );
}
