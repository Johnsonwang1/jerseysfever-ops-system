import { useState } from 'react';
import { X, Loader2, MapPin, CreditCard, Package, MessageSquare, Send, Truck, Plus, Trash2, ExternalLink, Edit2, Check } from 'lucide-react';
import { updateOrderStatus, addOrderNote, updateOrderTracking, formatCurrency, formatDate, getSiteLabel } from '../lib/orders';
import { ORDER_STATUS_CONFIG, type Order, type OrderStatus, type TrackingInfo } from '../lib/types';

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onStatusChange: () => Promise<void>;
}

const ALL_STATUSES: OrderStatus[] = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];

// 常用物流商
const COMMON_CARRIERS = [
  { name: '17Track', urlTemplate: 'https://t.17track.net/en#nums=' },
  { name: 'DHL', urlTemplate: 'https://www.dhl.com/en/express/tracking.html?AWB=' },
  { name: 'FedEx', urlTemplate: 'https://www.fedex.com/fedextrack/?trknbr=' },
  { name: 'UPS', urlTemplate: 'https://www.ups.com/track?tracknum=' },
  { name: 'USPS', urlTemplate: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' },
  { name: 'Royal Mail', urlTemplate: 'https://www.royalmail.com/track-your-item?trackNumber=' },
  { name: 'China Post', urlTemplate: 'https://t.17track.net/en#nums=' },
  { name: 'YunExpress', urlTemplate: 'https://www.yuntrack.com/Track/Result?c=&tn=' },
  { name: 'Yanwen', urlTemplate: 'https://track.yw56.com.cn/en/querydel?tracknumber=' },
];

export function OrderDetailModal({ order, onClose, onStatusChange }: OrderDetailModalProps) {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus>(order.status);
  const [note, setNote] = useState('');
  const [isCustomerNote, setIsCustomerNote] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // 物流信息状态
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo[]>(order.tracking_info || []);
  const [isEditingTracking, setIsEditingTracking] = useState(false);
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [newTracking, setNewTracking] = useState<TrackingInfo>({
    carrier: '',
    tracking_number: '',
    tracking_url: '',
    date_shipped: new Date().toISOString().split('T')[0],
  });

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

  // 自动生成跟踪链接
  const generateTrackingUrl = (carrier: string, trackingNumber: string): string => {
    const found = COMMON_CARRIERS.find(c => c.name.toLowerCase() === carrier.toLowerCase());
    if (found) {
      return found.urlTemplate + trackingNumber;
    }
    // 默认使用 17Track
    return `https://t.17track.net/en#nums=${trackingNumber}`;
  };

  // 添加新物流信息
  const handleAddTracking = () => {
    if (!newTracking.carrier || !newTracking.tracking_number) {
      setMessage({ type: 'error', text: '请填写物流商和运单号' });
      return;
    }

    // 自动生成跟踪链接（如果没有填写）
    const trackingUrl = newTracking.tracking_url || generateTrackingUrl(newTracking.carrier, newTracking.tracking_number);

    setTrackingInfo([...trackingInfo, { ...newTracking, tracking_url: trackingUrl }]);
    setNewTracking({
      carrier: '',
      tracking_number: '',
      tracking_url: '',
      date_shipped: new Date().toISOString().split('T')[0],
    });
  };

  // 删除物流信息
  const handleRemoveTracking = (index: number) => {
    setTrackingInfo(trackingInfo.filter((_, i) => i !== index));
  };

  // 保存物流信息
  const handleSaveTracking = async () => {
    try {
      setIsSavingTracking(true);
      setMessage(null);
      const result = await updateOrderTracking(order.id, trackingInfo);

      if (result.success) {
        setMessage({ type: 'success', text: '物流信息已保存' });
        setIsEditingTracking(false);
        await onStatusChange(); // 刷新订单数据
      } else {
        setMessage({ type: 'error', text: result.error || '保存失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setIsSavingTracking(false);
    }
  };

  // 选择物流商时自动填充
  const handleCarrierSelect = (carrier: string) => {
    setNewTracking({ ...newTracking, carrier });
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

              {/* 物流跟踪信息 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    物流跟踪
                    {trackingInfo.length > 0 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        {trackingInfo.length}
                      </span>
                    )}
                  </h3>
                  <button
                    onClick={() => setIsEditingTracking(!isEditingTracking)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    {isEditingTracking ? (
                      <>
                        <X className="w-4 h-4" />
                        取消
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-4 h-4" />
                        编辑
                      </>
                    )}
                  </button>
                </div>

                {/* 显示已有物流信息 */}
                {trackingInfo.length > 0 ? (
                  <div className="space-y-3">
                    {trackingInfo.map((tracking, index) => (
                      <div key={index} className="bg-white rounded-lg p-3 border relative group">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{tracking.carrier}</span>
                              {tracking.date_shipped && (
                                <span className="text-xs text-gray-500">
                                  发货于 {new Date(tracking.date_shipped).toLocaleDateString('zh-CN')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                                {tracking.tracking_number}
                              </code>
                              {tracking.tracking_url && (
                                <a
                                  href={tracking.tracking_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  查询
                                </a>
                              )}
                            </div>
                          </div>
                          {isEditingTracking && (
                            <button
                              onClick={() => handleRemoveTracking(index)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-400 text-sm">
                    暂无物流信息
                  </div>
                )}

                {/* 编辑模式下显示添加表单 */}
                {isEditingTracking && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-3">添加物流信息</div>
                    <div className="space-y-3">
                      {/* 物流商选择 */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">物流商</label>
                        <div className="flex gap-2">
                          <select
                            value={newTracking.carrier}
                            onChange={(e) => handleCarrierSelect(e.target.value)}
                            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">选择物流商</option>
                            {COMMON_CARRIERS.map(c => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                            <option value="Other">其他</option>
                          </select>
                          {newTracking.carrier === 'Other' && (
                            <input
                              type="text"
                              placeholder="输入物流商名称"
                              onChange={(e) => setNewTracking({ ...newTracking, carrier: e.target.value })}
                              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                        </div>
                      </div>

                      {/* 运单号 */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">运单号</label>
                        <input
                          type="text"
                          value={newTracking.tracking_number}
                          onChange={(e) => setNewTracking({ ...newTracking, tracking_number: e.target.value })}
                          placeholder="输入运单号"
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>

                      {/* 发货日期 */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">发货日期</label>
                        <input
                          type="date"
                          value={newTracking.date_shipped?.split('T')[0] || ''}
                          onChange={(e) => setNewTracking({ ...newTracking, date_shipped: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* 跟踪链接（可选） */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">跟踪链接（可选，不填将自动生成）</label>
                        <input
                          type="url"
                          value={newTracking.tracking_url || ''}
                          onChange={(e) => setNewTracking({ ...newTracking, tracking_url: e.target.value })}
                          placeholder="https://..."
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <button
                        onClick={handleAddTracking}
                        disabled={!newTracking.carrier || !newTracking.tracking_number}
                        className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        添加
                      </button>
                    </div>

                    {/* 保存按钮 */}
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={handleSaveTracking}
                        disabled={isSavingTracking}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSavingTracking ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        保存物流信息
                      </button>
                    </div>
                  </div>
                )}
              </div>

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
