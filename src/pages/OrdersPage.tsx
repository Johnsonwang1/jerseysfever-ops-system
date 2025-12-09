import { useState, useRef } from 'react';
import { ShoppingCart, Loader2, AlertCircle, RefreshCw, Search, X, Filter, ChevronDown } from 'lucide-react';
import { syncOrders, formatCurrency, formatDate, getSiteLabel } from '../lib/orders';
import { ORDER_STATUS_CONFIG, type Order, type OrderStatus, type SiteKey, type OrderSyncResult } from '../lib/types';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { DateRangePicker } from '../components/DateRangePicker';
import { useAuth } from '../lib/auth';
import { useOrders, useOrdersRealtime } from '../hooks/useOrders';

const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr'];
const ALL_STATUSES: OrderStatus[] = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];

export function OrdersPage() {
  const { isAdmin } = useAuth();
  const [page, setPage] = useState(1);

  // 日期工具函数
  const getToday = () => new Date().toISOString().split('T')[0];
  const getTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  // 筛选状态 - 默认今天到明天
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedSites, setSelectedSites] = useState<SiteKey[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<OrderStatus[]>([]);
  const [dateFrom, setDateFrom] = useState(getToday);
  const [dateTo, setDateTo] = useState(getTomorrow);
  const [showFilters, setShowFilters] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // React Query - 订单数据
  const { 
    data: ordersData, 
    isLoading, 
    error: ordersError,
    refetch: refetchOrders
  } = useOrders({
    page,
    sites: selectedSites.length > 0 ? selectedSites : undefined,
    statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    search: searchQuery || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  // Realtime 订阅
  useOrdersRealtime();

  // 从 React Query 数据中提取
  const orders = ordersData?.orders || [];
  const total = ordersData?.total || 0;
  const totalPages = ordersData?.totalPages || 1;
  const error = ordersError ? (ordersError as Error).message : null;

  // 同步状态
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<OrderSyncResult[] | null>(null);
  const [_syncError, setSyncError] = useState<string | null>(null);

  // 弹窗状态
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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

  // 同步订单（默认只同步最近2天）
  const handleSync = async (site?: SiteKey, syncAll = false) => {
    try {
      setIsSyncing(true);
      setSyncResults(null);

      // 默认只同步最近2天的订单
      const after = syncAll ? undefined : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      console.log(`开始同步订单${after ? ` (${after} 之后)` : ' (全部)'}`);
      const result = await syncOrders({ site, after });
      setSyncResults(result.results);
      // 刷新列表
      await refetchOrders();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setIsSyncing(false);
    }
  };

  // 清除筛选
  const clearFilters = () => {
    setSelectedSites([]);
    setSelectedStatuses([]);
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  // 切换站点筛选
  const toggleSite = (site: SiteKey) => {
    setSelectedSites(prev =>
      prev.includes(site)
        ? prev.filter(s => s !== site)
        : [...prev, site]
    );
    setPage(1);
  };

  // 切换状态筛选
  const toggleStatus = (status: OrderStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
    setPage(1);
  };

  const hasFilters = selectedSites.length > 0 || selectedStatuses.length > 0 || dateFrom || dateTo || searchQuery;

  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* 头部区域 - 不再固定 */}
      <div className="bg-gray-50 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6 space-y-4 sm:space-y-5">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 flex-shrink-0" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">订单管理</h1>
            <span className="hidden sm:inline text-sm text-gray-500">（管理所有站点的订单）</span>
          </div>

          {/* 同步按钮 - 仅管理员可见 */}
          {isAdmin && (
            <button
              onClick={() => handleSync(undefined, false)}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2.5 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">同步最近订单</span>
              <span className="sm:hidden">同步</span>
            </button>
          )}
        </div>

        {/* 同步结果提示 */}
        {syncResults && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-wrap">
                {syncResults.map(r => (
                  <span key={r.site} className={`text-sm ${r.success ? 'text-green-600' : 'text-red-600'}`}>
                    {getSiteLabel(r.site)}: {r.success ? `${r.synced} 条` : r.error}
                  </span>
                ))}
              </div>
              <button onClick={() => setSyncResults(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
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
                placeholder="搜索订单号、客户邮箱、姓名..."
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
              />
            </div>

            {/* 筛选按钮 */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 border rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap ${hasFilters ? 'border-gray-900 text-gray-900' : 'border-gray-200'}`}
            >
              <Filter className="w-4 h-4" />
              筛选
              {hasFilters && (
                <span className="bg-gray-900 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {selectedSites.length + selectedStatuses.length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
              >
                清除
              </button>
            )}
          </div>

          {/* 展开的筛选面板 */}
          {showFilters && (
            <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* 站点筛选 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">站点</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SITES.map(site => (
                    <button
                      key={site}
                      onClick={() => toggleSite(site)}
                      className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                        selectedSites.includes(site)
                          ? 'bg-gray-900 border-gray-900 text-white'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {getSiteLabel(site)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 状态筛选 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_STATUSES.map(status => (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                        selectedStatuses.includes(status)
                          ? 'bg-gray-900 border-gray-900 text-white'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {ORDER_STATUS_CONFIG[status].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 日期范围 */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">日期范围</label>
                <DateRangePicker
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6">
        {/* 订单统计 */}
        <div className="mb-4 sm:mb-5 text-sm sm:text-base text-gray-500">
          共 {total} 条订单
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 sm:mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-700 break-words">{error}</span>
          </div>
        )}

        {/* 订单列表 */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16 text-gray-500 px-4">
                {hasFilters ? '没有符合条件的订单' : '暂无订单，点击同步按钮从 WooCommerce 获取订单'}
              </div>
            ) : (
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">订单号</th>
                    <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">站点</th>
                    <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">客户</th>
                    <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">商品</th>
                    <th className="px-4 sm:px-5 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">金额</th>
                    <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">支付方式</th>
                    <th className="px-4 sm:px-5 py-3 sm:py-4 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">状态</th>
                    <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 sm:px-5 py-3 sm:py-4">
                        <span className="font-mono text-sm sm:text-base font-medium text-gray-900">
                          #{order.order_number}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 sm:py-4">
                        <span className="text-sm sm:text-base text-gray-600">{getSiteLabel(order.site)}</span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 sm:py-4">
                        <div className="text-sm sm:text-base">
                          <div className="font-medium text-gray-900">{order.customer_name || '-'}</div>
                          <div className="text-gray-500 text-xs sm:text-sm mt-0.5">{order.customer_email || '-'}</div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-3 sm:py-4">
                        <span className="text-sm sm:text-base text-gray-600">
                          {order.line_items.length} 件商品
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 sm:py-4 text-right">
                        <span className="font-medium text-sm sm:text-base text-gray-900">
                          {formatCurrency(order.total, order.currency)}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 sm:py-4">
                        <span className="text-sm sm:text-base text-gray-600">
                          {order.payment_method_title || '-'}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 sm:py-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap ${
                            order.status === 'completed' ? 'bg-green-100 text-green-800' :
                            order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            order.status === 'on-hold' ? 'bg-orange-100 text-orange-800' :
                            order.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                            order.status === 'refunded' ? 'bg-purple-100 text-purple-800' :
                            'bg-red-100 text-red-800'
                          }`}
                        >
                          {ORDER_STATUS_CONFIG[order.status]?.label || order.status}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 sm:py-4 text-sm sm:text-base text-gray-500">
                        {formatDate(order.date_created)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 sm:px-5 py-2 sm:py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              上一页
            </button>
            <span className="text-sm sm:text-base text-gray-600 px-2">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 sm:px-5 py-2 sm:py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 订单详情弹窗 */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={async () => {
            await refetchOrders();
          }}
        />
      )}
    </div>
  );
}
