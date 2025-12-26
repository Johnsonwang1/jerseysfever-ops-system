/**
 * 销售分析 Edge Function
 * 计算销售额、成本（采购+物流）、利润等数据（所有金额统一转为 USD）
 * 
 * 成本计算逻辑：
 * 1. 基于有效订单（completed/processing）计算收入和基础成本
 * 2. 基于 PayPal 退款率（8%）预估退款
 * 3. 发货前退款（72%）：采购+物流成本返还，不计入成本
 * 4. 发货后退款（28%）：成本已发生，无法返还
 * 5. 平台手续费：全部计入（退款不退还）
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// 有效订单状态
const VALID_ORDER_STATUSES = ["completed", "processing"];

// 默认成本（CNY）
const DEFAULT_PRODUCT_COST_CNY = 28;
const DEFAULT_JERSEY_WEIGHT_KG = 0.3;

// 站点货币
const SITE_CURRENCY: Record<string, string> = {
  com: "USD",
  uk: "GBP",
  de: "EUR",
  fr: "EUR",
};

// 支付平台手续费率
const PAYPAL_METHODS = ["niumu_paypal", "fortune_paypal"];
const CREDIT_CARD_METHODS = ["onlypay", "sswppayment", "cartadicreditopay_cc", "niumu_stripe"];
const PAYPAL_FEE_RATE = 0.05;
const CREDIT_CARD_FEE_RATE = 0.08;

// ==================== 退款率常量（基于 PayPal BigQuery 数据）====================
// PayPal 退款率：8%（包含退款+争议+拒付）
const PAYPAL_REFUND_RATE = 0.08;
// 信用卡退款率：预估与 PayPal 相近
const CREDIT_CARD_REFUND_RATE = 0.08;
// 发货前退款比例：72%（基于 WooCommerce 历史数据）
const REFUND_BEFORE_SHIP_RATIO = 0.72;
// 发货后退款比例：28%
const REFUND_AFTER_SHIP_RATIO = 0.28;

// 获取支付手续费率
const getPaymentFeeRate = (paymentMethod: string): number => {
  if (PAYPAL_METHODS.includes(paymentMethod)) return PAYPAL_FEE_RATE;
  if (CREDIT_CARD_METHODS.includes(paymentMethod)) return CREDIT_CARD_FEE_RATE;
  return 0;
};

// 获取退款率
const getRefundRate = (paymentMethod: string): number => {
  if (PAYPAL_METHODS.includes(paymentMethod)) return PAYPAL_REFUND_RATE;
  if (CREDIT_CARD_METHODS.includes(paymentMethod)) return CREDIT_CARD_REFUND_RATE;
  return PAYPAL_REFUND_RATE; // 默认使用 PayPal 退款率
};

interface OrderLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  price: number;
  sku: string;
  image?: { src: string };
}

interface ShippingAddress {
  country?: string;
}

interface ExchangeRate {
  month: string;
  usd_cny: number;
  usd_eur: number;
  usd_gbp: number;
}

interface ShippingCost {
  country_code: string;
  price_per_kg: number;
  registration_fee: number;
}

interface AnalyticsRequest {
  dateFrom: string;
  dateTo: string;
  sites?: string[];
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { dateFrom, dateTo, sites, limit = 100 }: AnalyticsRequest = await req.json();

    if (!dateFrom || !dateTo) {
      return new Response(
        JSON.stringify({ error: "缺少日期参数" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. 获取汇率数据
    const { data: exchangeRates } = await supabase
      .from("exchange_rates")
      .select("month, usd_cny, usd_eur, usd_gbp")
      .order("month", { ascending: false });

    const rateMap = new Map<string, ExchangeRate>();
    for (const rate of exchangeRates || []) {
      rateMap.set(rate.month, rate);
    }
    const latestRate = exchangeRates?.[0];

    const getRateForDate = (date: string): ExchangeRate => {
      const month = date.slice(0, 7);
      return rateMap.get(month) || latestRate || { month: "", usd_cny: 7.2, usd_eur: 0.92, usd_gbp: 0.79 };
    };

    const convertToUSD = (amount: number, site: string, date: string): number => {
      const currency = SITE_CURRENCY[site] || "USD";
      if (currency === "USD") return amount;
      const rate = getRateForDate(date);
      if (currency === "EUR") return amount / rate.usd_eur;
      if (currency === "GBP") return amount / rate.usd_gbp;
      return amount;
    };

    const convertCNYtoUSD = (amountCNY: number, date: string): number => {
      const rate = getRateForDate(date);
      return amountCNY / rate.usd_cny;
    };

    // 2. 获取物流成本配置
    const { data: shippingCostsData } = await supabase
      .from("shipping_costs")
      .select("country_code, price_per_kg, registration_fee")
      .eq("enabled", true);

    const shippingCostMap = new Map<string, ShippingCost>();
    for (const sc of shippingCostsData || []) {
      shippingCostMap.set(sc.country_code, sc);
    }

    const getOrderShippingCostCNY = (countryCode: string, totalQuantity: number): number => {
      const config = shippingCostMap.get(countryCode);
      if (!config) {
        return 65 * DEFAULT_JERSEY_WEIGHT_KG * totalQuantity + 25;
      }
      return config.price_per_kg * DEFAULT_JERSEY_WEIGHT_KG * totalQuantity + config.registration_fee;
    };

    // 3. 查询订单数据（分页获取所有数据，Supabase 默认 limit 1000）
    const dateToEnd = `${dateTo}T23:59:59.999Z`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allOrders: any[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from("orders")
        .select("*")
        .gte("date_created", dateFrom)
        .lte("date_created", dateToEnd)
        .range(offset, offset + PAGE_SIZE - 1);

      if (sites && sites.length > 0) {
        query = query.in("site", sites);
      }

      const { data: pageOrders, error: pageError } = await query;
      if (pageError) throw pageError;

      if (pageOrders && pageOrders.length > 0) {
        allOrders.push(...pageOrders);
        offset += PAGE_SIZE;
        hasMore = pageOrders.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    const orders = allOrders;

    // 4. 收集 SKU 并查询成本
    const allSkus = new Set<string>();
    for (const order of orders || []) {
      const items = (order.line_items as OrderLineItem[]) || [];
      for (const item of items) {
        if (item.sku) {
          allSkus.add(item.sku);
          const parentSku = item.sku.replace(/-(?:XS|S|M|L|XL|2XL|3XL|4XL|XXL|XXXL)$/i, "");
          if (parentSku !== item.sku) allSkus.add(parentSku);
        }
      }
    }

    const { data: productCosts } = await supabase
      .from("products")
      .select("sku, cost")
      .in("sku", Array.from(allSkus));

    const costMapCNY = new Map<string, number>();
    for (const p of productCosts || []) {
      if (p.cost !== null) costMapCNY.set(p.sku, parseFloat(p.cost));
    }

    const getProductCostCNY = (sku: string): number => {
      if (costMapCNY.has(sku)) return costMapCNY.get(sku)!;
      const parentSku = sku.replace(/-(?:XS|S|M|L|XL|2XL|3XL|4XL|XXL|XXXL)$/i, "");
      if (parentSku !== sku && costMapCNY.has(parentSku)) return costMapCNY.get(parentSku)!;
      return DEFAULT_PRODUCT_COST_CNY;
    };

    // 5. 筛选有效订单
    const validOrders = (orders || []).filter((o) => VALID_ORDER_STATUSES.includes(o.status));

    // 6. 初始化汇总
    let orderCount = validOrders.length;
    let itemCount = 0;
    let grossRevenue = 0;           // 毛收入（有效订单）
    let baseProductCost = 0;        // 基础采购成本
    let baseShippingCost = 0;       // 基础物流成本
    let basePlatformFee = 0;        // 基础平台手续费
    let estimatedRefund = 0;        // 预估退款金额

    // 各站点统计
    const siteStats = new Map<string, { revenue: number; refunds: number; orderCount: number; itemCount: number }>();
    for (const site of ["com", "uk", "de", "fr"]) {
      siteStats.set(site, { revenue: 0, refunds: 0, orderCount: 0, itemCount: 0 });
    }

    // 按日期统计
    const dailyMap = new Map<string, {
      date: string;
      orderCount: number;
      itemCount: number;
      revenue: number;
      refunds: number;
      productCost: number;
      shippingCost: number;
      platformFee: number;
    }>();
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      dailyMap.set(dateStr, { date: dateStr, orderCount: 0, itemCount: 0, revenue: 0, refunds: 0, productCost: 0, shippingCost: 0, platformFee: 0 });
    }

    // 商品统计
    const productMap = new Map<string, {
      sku: string;
      name: string;
      image: string;
      quantity: number;
      revenue: number;
      productCost: number;
      shippingCost: number;
      platformFee: number;
      profit: number;
      refundQuantity: number;
      refundAmount: number;
      orderCount: number;
    }>();

    // ==================== 处理有效订单 ====================
    for (const order of validOrders) {
      const items = (order.line_items as OrderLineItem[]) || [];
      const site = order.site;
      const dateStr = order.date_created.split("T")[0];
      const siteStat = siteStats.get(site);
      const dailyStat = dailyMap.get(dateStr);
      const orderSkus = new Set<string>();

      const shippingAddress = order.shipping_address as ShippingAddress | null;
      const countryCode = shippingAddress?.country || "US";
      const paymentMethod = order.payment_method || "";

      let orderItemCount = 0;
      let orderRevenue = 0;
      let orderProductCost = 0;

      // 计算订单收入和采购成本
      for (const item of items) {
        const qty = item.quantity || 0;
        const price = item.price || 0;
        const sku = item.sku || `product-${item.product_id}`;

        orderItemCount += qty;

        const itemRevenueLocal = qty * price;
        const itemRevenueUSD = convertToUSD(itemRevenueLocal, site, order.date_created);
        orderRevenue += itemRevenueUSD;

        const unitProductCostCNY = getProductCostCNY(sku);
        const unitProductCostUSD = convertCNYtoUSD(unitProductCostCNY, order.date_created);
        const itemProductCostUSD = unitProductCostUSD * qty;
        orderProductCost += itemProductCostUSD;

        // 商品统计
        if (!productMap.has(sku)) {
          productMap.set(sku, {
            sku,
            name: item.name || "",
            image: item.image?.src || "",
            quantity: 0,
            revenue: 0,
            productCost: 0,
            shippingCost: 0,
            platformFee: 0,
            profit: 0,
            refundQuantity: 0,
            refundAmount: 0,
            orderCount: 0,
          });
        }
        const pStat = productMap.get(sku)!;
        pStat.quantity += qty;
        pStat.revenue += itemRevenueUSD;
        pStat.productCost += itemProductCostUSD;
        if (!orderSkus.has(sku)) {
          pStat.orderCount++;
          orderSkus.add(sku);
        }
      }

      // 计算物流成本
      const orderShippingCostCNY = getOrderShippingCostCNY(countryCode, orderItemCount);
      const orderShippingCost = convertCNYtoUSD(orderShippingCostCNY, order.date_created);

      // 计算平台手续费
      const feeRate = getPaymentFeeRate(paymentMethod);
      const orderPlatformFee = orderRevenue * feeRate;

      // 计算该订单的预估退款
      const refundRate = getRefundRate(paymentMethod);
      const orderEstimatedRefund = orderRevenue * refundRate;

      // 分摊到商品
      for (const item of items) {
        const qty = item.quantity || 0;
        const sku = item.sku || `product-${item.product_id}`;
        const pStat = productMap.get(sku);
        if (pStat && orderItemCount > 0) {
          const ratio = qty / orderItemCount;
          pStat.shippingCost += orderShippingCost * ratio;
          pStat.platformFee += orderPlatformFee * ratio;
        }
      }

      // 汇总
      itemCount += orderItemCount;
      grossRevenue += orderRevenue;
      baseProductCost += orderProductCost;
      baseShippingCost += orderShippingCost;
      basePlatformFee += orderPlatformFee;
      estimatedRefund += orderEstimatedRefund;

      if (siteStat) {
        siteStat.revenue += parseFloat(order.total) || 0;
        siteStat.orderCount += 1;
        siteStat.itemCount += orderItemCount;
        // 预估退款分配到站点
        siteStat.refunds += convertToUSD(parseFloat(order.total) * refundRate, site, order.date_created);
      }

      if (dailyStat) {
        dailyStat.orderCount += 1;
        dailyStat.itemCount += orderItemCount;
        dailyStat.revenue += orderRevenue;
        dailyStat.refunds += orderEstimatedRefund;
        dailyStat.productCost += orderProductCost;
        dailyStat.shippingCost += orderShippingCost;
        dailyStat.platformFee += orderPlatformFee;
      }
    }

    // ==================== 基于退款率调整成本 ====================
    // 发货前退款比例的成本返还系数
    // 发货前退款（72%）：采购+物流成本不发生
    // 公式：实际成本 = 基础成本 × (1 - 退款率 × 发货前退款比例)
    const avgRefundRate = estimatedRefund / grossRevenue || 0;
    const costReturnRatio = avgRefundRate * REFUND_BEFORE_SHIP_RATIO;
    const actualCostMultiplier = 1 - costReturnRatio;

    // 调整后的成本
    const actualProductCost = baseProductCost * actualCostMultiplier;
    const actualShippingCost = baseShippingCost * actualCostMultiplier;
    // 平台手续费不调整（退款也收）
    const actualPlatformFee = basePlatformFee;

    // 净收入 = 毛收入 - 预估退款
    const netRevenue = grossRevenue - estimatedRefund;

    // 总成本
    const totalCost = actualProductCost + actualShippingCost + actualPlatformFee;

    // 毛利润
    const grossProfit = netRevenue - totalCost;

    // 毛利率
    const grossProfitRate = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

    // 退款明细
    const refundBeforeShipAmount = estimatedRefund * REFUND_BEFORE_SHIP_RATIO;
    const refundAfterShipAmount = estimatedRefund * REFUND_AFTER_SHIP_RATIO;
    const refundBeforeShipCostSaved = (baseProductCost + baseShippingCost) * costReturnRatio;
    const refundAfterShipCostLoss = (baseProductCost + baseShippingCost) * avgRefundRate * REFUND_AFTER_SHIP_RATIO;

    // 各站点明细
    const siteRevenues = ["com", "uk", "de", "fr"]
      .map((site) => {
        const stat = siteStats.get(site)!;
        return {
          site,
          currency: SITE_CURRENCY[site] || "USD",
          revenue: stat.revenue,
          refunds: Math.round(stat.refunds * 100) / 100,
          orderCount: stat.orderCount,
          itemCount: stat.itemCount,
        };
      })
      .filter((sr) => sr.orderCount > 0 || sr.refunds > 0);

    // 每日统计（调整成本）
    const dailyStats = Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        const dayProductCost = d.productCost * actualCostMultiplier;
        const dayShippingCost = d.shippingCost * actualCostMultiplier;
        const dayNetRevenue = d.revenue - d.refunds;
        const dayCost = dayProductCost + dayShippingCost + d.platformFee;
        return {
          ...d,
          revenue: Math.round(d.revenue * 100) / 100,
          refunds: Math.round(d.refunds * 100) / 100,
          productCost: Math.round(dayProductCost * 100) / 100,
          shippingCost: Math.round(dayShippingCost * 100) / 100,
          platformFee: Math.round(d.platformFee * 100) / 100,
          cost: Math.round(dayCost * 100) / 100,
          netRevenue: Math.round(dayNetRevenue * 100) / 100,
          profit: Math.round((dayNetRevenue - dayCost) * 100) / 100,
        };
      });

    // 商品排行（调整成本）
    const products = Array.from(productMap.values())
      .map((p) => {
        const adjProductCost = p.productCost * actualCostMultiplier;
        const adjShippingCost = p.shippingCost * actualCostMultiplier;
        const cost = adjProductCost + adjShippingCost + p.platformFee;
        const profit = p.revenue - cost;
        return {
          ...p,
          productCost: adjProductCost,
          shippingCost: adjShippingCost,
          cost,
          profit,
        };
      })
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);

    // 返回结果
    const result = {
      summary: {
        orderCount,
        itemCount,
        // 收入
        grossRevenue: Math.round(grossRevenue * 100) / 100,
        estimatedRefund: Math.round(estimatedRefund * 100) / 100,
        netRevenue: Math.round(netRevenue * 100) / 100,
        // 成本（调整后）
        productCost: Math.round(actualProductCost * 100) / 100,
        shippingCost: Math.round(actualShippingCost * 100) / 100,
        platformFee: Math.round(actualPlatformFee * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        // 利润
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossProfitRate: Math.round(grossProfitRate * 100) / 100,
        // 退款明细
        refundRate: Math.round(avgRefundRate * 10000) / 100, // 百分比
        refundBeforeShip: {
          ratio: Math.round(REFUND_BEFORE_SHIP_RATIO * 100),
          amount: Math.round(refundBeforeShipAmount * 100) / 100,
          costSaved: Math.round(refundBeforeShipCostSaved * 100) / 100,
        },
        refundAfterShip: {
          ratio: Math.round(REFUND_AFTER_SHIP_RATIO * 100),
          amount: Math.round(refundAfterShipAmount * 100) / 100,
          costLoss: Math.round(refundAfterShipCostLoss * 100) / 100,
        },
        // 兼容旧字段
        revenue: Math.round(netRevenue * 100) / 100,
        refunds: Math.round(estimatedRefund * 100) / 100,
        refundCount: Math.round(orderCount * avgRefundRate),
      },
      siteRevenues,
      dailyStats,
      products: products.map((p) => ({
        ...p,
        revenue: Math.round(p.revenue * 100) / 100,
        productCost: Math.round(p.productCost * 100) / 100,
        shippingCost: Math.round(p.shippingCost * 100) / 100,
        platformFee: Math.round(p.platformFee * 100) / 100,
        cost: Math.round(p.cost * 100) / 100,
        profit: Math.round(p.profit * 100) / 100,
        refundAmount: Math.round(p.refundAmount * 100) / 100,
      })),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("销售分析错误:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "未知错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
