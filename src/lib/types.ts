// ==================== 认证相关类型 ====================

// 用户角色类型
export type UserRole = 'admin' | 'editor' | 'viewer';

// 认证状态
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

// 用户资料
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// ==================== 上传相关类型 ====================

// 上传的图片
export interface UploadedImage {
  id: string;
  url: string;
  file?: File;  // Optional when loaded from database
  base64?: string;
}

// 商品信息
export interface ProductInfo {
  categories: string[];  // 分类（可多选，包括球队、Retro、Best Sellers等）
  season: string;        // 赛季（如 2024/25）
  year: string;          // 年份（用于 Retro，如 1998/99）
  type: string;
  version: string;
  gender: string;
  sleeve: string;
  events: string[];
  price: string;
}

// 商品内容（多语言）
export interface ProductContent {
  name: string;
  description: string;
  short_description: string;
}

// 商品组
export interface ProductGroup {
  id: string;
  images: UploadedImage[];
  info: ProductInfo;
  content: Record<SiteKey, ProductContent>;
  selectedSites: SiteKey[];
  isGenerating?: boolean; // AI 正在生成中
}

// 站点
export type SiteKey = 'de' | 'com' | 'fr' | 'uk';

export interface SiteConfig {
  key: SiteKey;
  name: string;
  url: string;
  flag: string;
  language: 'de' | 'en' | 'fr';
}

// 发布结果
export interface PublishResult {
  site: SiteKey;
  status: 'pending' | 'uploading' | 'creating' | 'success' | 'error';
  productId?: number;
  productUrl?: string;
  error?: string;
}

// WooCommerce 产品属性
export interface ProductAttribute {
  id: number;
  name?: string;
  visible: boolean;
  variation: boolean;
  options: string[];
}

// WooCommerce 变体
export interface ProductVariation {
  regular_price: string;
  attributes: { id: number; option: string }[];
}

// WooCommerce 产品创建请求
export interface WooProductRequest {
  name: string;
  type: 'variable';
  description: string;
  short_description: string;
  categories: { id: number }[];
  images: { src: string }[];
  attributes: ProductAttribute[];
}

// WooCommerce 分类（从 API 返回）
export interface WooCategory {
  id: number;
  name: string;
  parent: number;
}

// 数据库中的分类（从 Supabase woo_categories 表）
export interface DbCategory {
  name: string;
  woo_id: number;
  parent: number;
  site: SiteKey;
}

// WooCommerce 商品属性（用于更新）
export interface WooProductAttribute {
  id: number;
  name?: string;
  visible?: boolean;
  variation?: boolean;
  options: string[];
}

// WooCommerce 商品（从 API 返回）
export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: string;
  status: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  images: { id: number; src: string; alt: string }[];
  categories: { id: number; name: string; slug: string }[];
  attributes: WooProductAttribute[];
  date_created: string;
  date_modified: string;
  description: string;
  short_description: string;
}

// ==================== 订单相关类型 ====================

// 订单状态
export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed';

// 订单状态显示配置
export const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  'pending': { label: '待付款', color: 'yellow' },
  'processing': { label: '处理中', color: 'blue' },
  'on-hold': { label: '保留', color: 'orange' },
  'completed': { label: '已完成', color: 'green' },
  'cancelled': { label: '已取消', color: 'gray' },
  'refunded': { label: '已退款', color: 'purple' },
  'failed': { label: '失败', color: 'red' },
};

// 地址
export interface Address {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

// 订单商品项
export interface OrderLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  price: number;
  sku: string;
  image?: { src: string };  // 商品图片
  meta_data: Array<{ key: string; value: string }>;
}

// 配送信息
export interface ShippingLine {
  method_title: string;
  total: number;
}

// 物流跟踪信息
export interface TrackingInfo {
  carrier: string;           // 物流商名称 (如 DHL, FedEx, 17Track)
  tracking_number: string;   // 运单号
  tracking_url?: string;     // 跟踪链接
  date_shipped?: string;     // 发货日期 (ISO 格式)
}

// 订单（数据库格式）
export interface Order {
  id: string;
  order_number: string;
  site: SiteKey;
  woo_id: number;
  status: OrderStatus;
  currency: string;
  total: number;
  subtotal: number;
  shipping_total: number;
  discount_total: number;
  customer_email: string | null;
  customer_name: string | null;
  billing_address: Address;
  shipping_address: Address;
  line_items: OrderLineItem[];
  shipping_lines: ShippingLine[];
  payment_method: string | null;
  payment_method_title: string | null;
  date_created: string;
  date_paid: string | null;
  date_completed: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
  tracking_info: TrackingInfo[];  // 物流跟踪信息
  order_source: string | null;    // 订单来源（兼容旧字段）
  // 订单归属信息
  attribution_source_type: string | null;  // 来源类型：organic, direct, paid, referral
  attribution_utm_source: string | null;   // UTM来源：google, facebook 等
  attribution_device_type: string | null;  // 设备类型：Desktop, Mobile
  attribution_session_pages: number | null; // 会话页面浏览量
  attribution_referrer: string | null;      // 引荐来源URL
}

// 订单查询参数
export interface OrderQueryParams {
  sites?: SiteKey[];
  statuses?: OrderStatus[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

// 订单同步结果
export interface OrderSyncResult {
  site: SiteKey;
  success: boolean;
  synced: number;
  errors: number;
  error?: string;
}

// 销售分析数据
// 各站点原始货币销售额
export interface SiteRevenue {
  site: SiteKey;
  currency: string;          // 'USD' | 'EUR' | 'GBP'
  revenue: number;           // 原始货币销售额
  refunds: number;           // 原始货币退款额
  orderCount: number;        // 订单数
  itemCount: number;         // 销售件数
}

// 发货前退款统计
export interface RefundBeforeShip {
  ratio: number;             // 发货前退款比例（72%）
  amount: number;            // 发货前退款金额
  costSaved: number;         // 节省的成本（采购+物流）
}

// 发货后退款统计
export interface RefundAfterShip {
  ratio: number;             // 发货后退款比例（28%）
  amount: number;            // 发货后退款金额
  costLoss: number;          // 损失的成本（采购+物流）
}

export interface AnalyticsData {
  orderCount: number;        // 有效订单数
  itemCount: number;         // 销售件数
  // 收入
  grossRevenue?: number;     // 毛收入（有效订单总收入）
  estimatedRefund?: number;  // 预估退款（基于 PayPal 退款率）
  netRevenue?: number;       // 净收入 = 毛收入 - 预估退款
  revenue: number;           // 净收入（兼容旧字段）
  refunds: number;           // 预估退款（兼容旧字段）
  refundCount: number;       // 预估退款订单数
  // 成本（已根据退款率调整）
  productCost: number;       // 采购成本（USD）
  shippingCost: number;      // 物流成本（USD）
  platformFee: number;       // 平台手续费（USD）
  totalCost: number;         // 总成本（USD）= 采购 + 物流 + 手续费
  // 利润
  grossProfit: number;       // 毛利润（USD）= 净收入 - 总成本
  grossProfitRate?: number;  // 毛利率 = 毛利润 / 毛收入 × 100%
  // 退款率和分类明细
  refundRate?: number;       // 退款率（基于 PayPal 数据，约 8%）
  refundBeforeShip?: RefundBeforeShip;  // 发货前退款明细
  refundAfterShip?: RefundAfterShip;    // 发货后退款明细
  // 各站点原始货币明细
  siteRevenues: SiteRevenue[];
  // 按日期分组的数据（用于图表）
  dailyStats: DailyStat[];
}

export interface DailyStat {
  date: string;              // YYYY-MM-DD
  orderCount: number;
  itemCount: number;
  revenue: number;           // 毛收入
  refunds: number;           // 退款金额
  productCost: number;       // 采购成本
  shippingCost: number;      // 物流成本
  platformFee: number;       // 平台手续费
  cost: number;              // 总成本（不含广告）
  netRevenue?: number;       // 净收入 = revenue - refunds
  profit?: number;           // 毛利润 = netRevenue - cost
}

// 商品销量统计
export interface ProductStat {
  sku: string;
  name: string;
  image: string;             // 商品图片 URL
  quantity: number;          // 销售件数
  revenue: number;           // 销售收入（USD）
  productCost: number;       // 采购成本（USD）
  shippingCost: number;      // 物流成本（USD）
  platformFee: number;       // 平台手续费（USD）
  cost: number;              // 总成本（USD）
  profit: number;            // 毛利润（USD）= 收入 - 成本
  refundQuantity: number;    // 退款件数
  refundAmount: number;      // 退款金额
  orderCount: number;        // 订单数（出现在多少个订单中）
}

// ==================== 客户管理相关类型 ====================

// 客户分配方法
export type CustomerAssignmentMethod = 'address' | 'email_domain' | 'ai_analysis' | 'manual';

// 客户迁移状态
export type CustomerMigrationStatus = 'pending' | 'migrated' | 'skipped' | 'error';

// 客户订单统计
export interface CustomerOrderStats {
  total_orders: number;
  total_spent: number;
  valid_orders: number;
  valid_spent: number;
  invalid_orders: number;
  invalid_spent: number;
  first_order_date: string;
  last_order_date: string;
  by_site: Partial<Record<SiteKey, { orders: number; spent: number; valid_orders: number; valid_spent: number }>>;
}

// 客户 AI 分析结果
export interface CustomerAIAnalysis {
  name_analysis: {
    detected_origin: string;
    confidence: number;
    reasoning?: string;
  };
  email_analysis: {
    domain: string;
    domain_country: string | null;
    confidence: number;
  };
  order_history_analysis?: {
    primary_site: SiteKey | null;
    confidence: number;
  };
  recommended_site: SiteKey;
  overall_confidence: number;
  reasoning: string;
}

// 客户
export interface Customer {
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  phone: string | null;
  woo_ids: Partial<Record<SiteKey, number>>;
  assigned_site: SiteKey | null;
  assignment_method: CustomerAssignmentMethod | null;
  assignment_confidence: number | null;
  assignment_reason: string | null;
  billing_address: Address | null;
  shipping_address: Address | null;
  order_stats: CustomerOrderStats;
  ai_analysis: CustomerAIAnalysis | null;
  migration_status: CustomerMigrationStatus;
  migrated_at: string | null;
  migration_error: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

// 客户排序字段
export type CustomerSortField = 'valid_spent' | 'invalid_spent' | 'valid_orders' | 'total_spent';

// 客户查询参数
export interface CustomerQueryParams {
  page?: number;
  perPage?: number;
  search?: string;
  assignedSite?: SiteKey | 'unassigned';
  migrationStatus?: CustomerMigrationStatus;
  assignmentMethod?: CustomerAssignmentMethod;
  sortField?: CustomerSortField;
  sortOrder?: 'asc' | 'desc';
}

// 客户列表响应
export interface CustomerListResponse {
  customers: Customer[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// 客户统计
export interface CustomerStats {
  totalCustomers: number;
  siteDistribution: Record<SiteKey | 'unassigned', number>;
  methodDistribution: Record<CustomerAssignmentMethod | 'unassigned', number>;
  migrationDistribution: Record<CustomerMigrationStatus, number>;
}
