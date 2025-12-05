import { useState } from 'react';
import { X, Loader2, MapPin, CreditCard, Package, MessageSquare, Send } from 'lucide-react';
import { updateOrderStatus, addOrderNote, formatCurrency, formatDate, getSiteLabel } from '../lib/orders';
import { ORDER_STATUS_CONFIG, type Order, type OrderStatus } from '../lib/types';

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onStatusChange: () => Promise<void>;
}

const ALL_STATUSES: OrderStatus[] = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];

export function OrderDetailModal({ order, onClose, onStatusChange }: OrderDetailModalProps) {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus>(order.status);
  const [note, setNote] = useState('');
  const [isCustomerNote, setIsCustomerNote] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 更新状态
  const handleUpdateStatus = async () => {
    if (newStatus === order.status) return;

    try {
      setIsUpdatingStatus(true);
      setMessage(null);
      const result = await updateOrderStatus(order.site, order.woo_id, newStatus);

      if (result.success) {
        setMessage({ type: 'success', text: '状态更新成功' });
        await onStatusChange();
      } else {
        setMessage({ type: 'error', text: result.error || '更新失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '更新失败' });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // 添加备注
  const handleAddNote = async () => {
    if (!note.trim()) return;

    try {
      setIsAddingNote(true);
      setMessage(null);
      const result = await addOrderNote(order.site, order.woo_id, note, isCustomerNote);

      if (result.success) {
        setMessage({ type: 'success', text: isCustomerNote ? '备注已发送给客户' : '备注已添加' });
        setNote('');
      } else {
        setMessage({ type: 'error', text: result.error || '添加备注失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '添加备注失败' });
    } finally {
      setIsAddingNote(false);
    }
  };

  // 格式化地址
  const formatAddress = (addr: Order['billing_address'] | Order['shipping_address']) => {
    if (!addr) return '-';
    const parts = [
      addr.address_1,
      addr.address_2,
      addr.city,
      addr.state,
      addr.postcode,
      addr.country,
    ].filter(Boolean);
    return parts.join(', ') || '-';
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              订单 #{order.order_number}
              <span className="text-sm font-normal text-gray-500">
                {getSiteLabel(order.site)}
              </span>
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              创建时间：{formatDate(order.date_created)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 消息提示 */}
          {message && (
            <div className={`mb-4 p-3 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左列 */}
            <div className="space-y-6">
              {/* 订单状态 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  订单状态
                </h3>
                <div className="flex items-center gap-3">
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {ALL_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {ORDER_STATUS_CONFIG[status].label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleUpdateStatus}
                    disabled={isUpdatingStatus || newStatus === order.status}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isUpdatingStatus && <Loader2 className="w-4 h-4 animate-spin" />}
                    更新
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  当前状态：
                  <span className={`ml-1 font-medium ${
                    order.status === 'completed' ? 'text-green-600' :
                    order.status === 'processing' ? 'text-blue-600' :
                    order.status === 'pending' ? 'text-yellow-600' :
                    'text-gray-600'
                  }`}>
                    {ORDER_STATUS_CONFIG[order.status]?.label || order.status}
                  </span>
                </p>
              </div>

              {/* 客户信息 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  客户信息
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-500">姓名：</span>
                    <span className="font-medium">{order.customer_name || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">邮箱：</span>
                    <span className="font-medium">{order.customer_email || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">电话：</span>
                    <span className="font-medium">{order.billing_address?.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">账单地址：</span>
                    <span className="font-medium">{formatAddress(order.billing_address)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">收货地址：</span>
                    <span className="font-medium">{formatAddress(order.shipping_address)}</span>
                  </div>
                </div>
              </div>

              {/* 支付信息 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  支付信息
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">支付方式</span>
                    <span>{order.payment_method_title || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">小计</span>
                    <span>{formatCurrency(order.subtotal, order.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">运费</span>
                    <span>{formatCurrency(order.shipping_total, order.currency)}</span>
                  </div>
                  {order.discount_total > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>折扣</span>
                      <span>-{formatCurrency(order.discount_total, order.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>总计</span>
                    <span>{formatCurrency(order.total, order.currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 右列 */}
            <div className="space-y-6">
              {/* 商品列表 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  商品列表 ({order.line_items.length})
                </h3>
                <div className="space-y-3">
                  {order.line_items.map((item, index) => (
                    <div key={index} className="bg-white rounded-lg p-3 border">
                      <div className="flex gap-3">
                        {/* 商品图片 */}
                        {item.image?.src ? (
                          <img
                            src={item.image.src}
                            alt={item.name}
                            className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        {/* 商品信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{item.name}</div>
                          <div className="flex justify-between text-sm text-gray-500 mt-1">
                            <span>数量: {item.quantity}</span>
                            <span>{formatCurrency(item.price * item.quantity, order.currency)}</span>
                          </div>
                          {item.sku && (
                            <div className="text-xs text-gray-400 mt-1">SKU: {item.sku}</div>
                          )}
                          {/* 显示尺码、印号等 meta_data */}
                          {item.meta_data && item.meta_data.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              {item.meta_data
                                .filter(m => !m.key.startsWith('_'))
                                .map((meta, i) => (
                                  <div key={i} className="text-xs text-gray-500">
                                    {meta.key}: <span className="font-medium">{meta.value}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 配送信息 */}
              {order.shipping_lines && order.shipping_lines.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium mb-3">配送方式</h3>
                  {order.shipping_lines.map((line, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>{line.method_title}</span>
                      <span>{formatCurrency(line.total, order.currency)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 添加备注 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  添加备注
                </h3>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="输入备注内容..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                />
                <div className="flex items-center justify-between mt-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isCustomerNote}
                      onChange={(e) => setIsCustomerNote(e.target.checked)}
                      className="rounded"
                    />
                    发送给客户
                  </label>
                  <button
                    onClick={handleAddNote}
                    disabled={isAddingNote || !note.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isAddingNote ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    添加备注
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
