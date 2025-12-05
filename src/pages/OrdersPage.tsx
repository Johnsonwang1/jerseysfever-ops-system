import { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingCart, Loader2, AlertCircle, RefreshCw, Search, X, Filter, ChevronDown } from 'lucide-react';
import { getOrders, syncOrders, subscribeToOrders, formatCurrency, formatDate, getSiteLabel, type OrderQueryResult } from '../lib/orders';
import { ORDER_STATUS_CONFIG, type Order, type OrderStatus, type SiteKey, type OrderSyncResult } from '../lib/types';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { useAuth } from '../lib/auth';

const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr'];
const ALL_STATUSES: OrderStatus[] = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];

export function OrdersPage() {
  const { isAdmin } = useAuth();

  // 数据状态
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedSites, setSelectedSites] = useState<SiteKey[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<OrderStatus[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 同步状态
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<OrderSyncResult[] | null>(null);

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

  // 加载订单
  const loadOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result: OrderQueryResult = await getOrders({
        sites: selectedSites.length > 0 ? selectedSites : undefined,
        statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
        search: searchQuery || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit: 20,
      });

      setOrders(result.orders);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载订单失败');
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, selectedSites, selectedStatuses, dateFrom, dateTo]);

  // 初始加载和筛选变化时重新加载
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // 实时订阅
  useEffect(() => {
    const channel = subscribeToOrders((payload) => {
      console.log('订单变化:', payload.eventType, payload.new?.order_number);
      // 刷新列表
      loadOrders();
    });

    return () => {
      channel.unsubscribe();
    };
  }, [loadOrders]);

  // 同步订单（默认只同步最近2天）
  const handleSync = async (site?: SiteKey, syncAll = false) => {
    try {
      setIsSyncing(true);
      setSyncResults(null);
      setError(null);

      // 默认只同步最近2天的订单
      const after = syncAll ? undefined : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      console.log(`开始同步订单${after ? ` (${after} 之后)` : ' (全部)'}`);
      const result = await syncOrders({ site, after });
      setSyncResults(result.results);
      // 刷新列表
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
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
    <div className="h-full flex flex-col">
      {/* 固定头部区域 */}
      <div className="sticky top-0 z-20 bg-gray-50 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 space-y-4">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">订单管理</h1>
            <span className="hidden sm:inline text-sm text-gray-500">（管理所有站点的订单）</span>
          </div>

          {/* 同步按钮 - 仅管理员可见 */}
          {isAdmin && (
            <button
              onClick={() => handleSync(undefined, false)}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-sm text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
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
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索订单号、客户邮箱、姓名..."
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
              />
            </div>

            {/* 筛选按钮 */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center justify-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors ${hasFilters ? 'border-gray-900 text-gray-900' : 'border-gray-200'}`}
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
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                清除
              </button>
            )}
          </div>

          {/* 展开的筛选面板 */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">开始日期</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">结束日期</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 px-4 lg:px-6 pb-4 lg:pb-6 overflow-auto">
        {/* 订单统计 */}
        <div className="mb-4 text-sm text-gray-500">
          共 {total} 条订单
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        {/* 订单列表 */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              {hasFilters ? '没有符合条件的订单' : '暂无订单，点击同步按钮从 WooCommerce 获取订单'}
            </div>
          ) : (
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">订单号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">站点</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">客户</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">商品</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">金额</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">支付方式</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">创建时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-medium text-gray-900">
                        #{order.order_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{getSiteLabel(order.site)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{order.customer_name || '-'}</div>
                        <div className="text-gray-500 text-xs">{order.customer_email || '-'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {order.line_items.length} 件商品
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium text-gray-900">
                        {formatCurrency(order.total, order.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {order.payment_method_title || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
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
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(order.date_created)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
            await loadOrders();
          }}
        />
      )}
    </div>
  );
}
