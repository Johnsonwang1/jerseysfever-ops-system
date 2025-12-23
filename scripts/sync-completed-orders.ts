/**
 * 同步所有已完成订单的物流信息和订单来源
 * 使用方式: npx tsx scripts/sync-completed-orders.ts [site]
 * 示例: npx tsx scripts/sync-completed-orders.ts de
 *       npx tsx scripts/sync-completed-orders.ts (同步所有站点)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 手动加载 .env 文件
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    try {
      const envPath = resolve(process.cwd(), envFile);
      const envContent = readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) return;
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex === -1) return;
        const key = trimmedLine.slice(0, equalIndex).trim();
        const value = trimmedLine.slice(equalIndex + 1).trim();
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      });
      console.log(`✓ Loaded ${envFile}`);
      return;
    } catch {
      // try next file
    }
  }
  console.warn('Warning: Could not load any .env file');
}

loadEnv();

// Supabase 配置
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// WooCommerce API 配置
const WOO_CONFIG: Record<string, { url: string; key: string; secret: string }> = {
  com: {
    url: 'https://jerseysfever.com',
    key: process.env.WOO_COM_KEY!,
    secret: process.env.WOO_COM_SECRET!,
  },
  uk: {
    url: 'https://jerseysfever.uk',
    key: process.env.WOO_UK_KEY!,
    secret: process.env.WOO_UK_SECRET!,
  },
  de: {
    url: 'https://jerseysfever.de',
    key: process.env.WOO_DE_KEY!,
    secret: process.env.WOO_DE_SECRET!,
  },
  fr: {
    url: 'https://jerseysfever.fr',
    key: process.env.WOO_FR_KEY!,
    secret: process.env.WOO_FR_SECRET!,
  },
};

type SiteKey = 'com' | 'uk' | 'de' | 'fr';

interface TrackingInfo {
  carrier: string;
  tracking_number: string;
  tracking_url?: string;
  date_shipped?: string;
}

// 批量从 WooCommerce 获取订单（每批最多100个）
const WOO_BATCH_SIZE = 100;

async function fetchWooOrdersBatch(site: SiteKey, orderIds: number[]): Promise<Map<number, any>> {
  const config = WOO_CONFIG[site];
  const auth = Buffer.from(`${config.key}:${config.secret}`).toString('base64');
  
  const results = new Map<number, any>();
  
  // WooCommerce API 限制每次最多100个
  for (let i = 0; i < orderIds.length; i += WOO_BATCH_SIZE) {
    const batchIds = orderIds.slice(i, i + WOO_BATCH_SIZE);
    const includeParam = batchIds.join(',');
    
    const response = await fetch(
      `${config.url}/wp-json/wc/v3/orders?include=${includeParam}&per_page=${WOO_BATCH_SIZE}`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      }
    );
    
    if (!response.ok) {
      console.error(`\n❌ 批量获取订单失败: ${response.status}`);
      continue;
    }
    
    const orders = await response.json();
    for (const order of orders) {
      results.set(order.id, order);
    }
    
    // 进度显示
    const progress = Math.min(i + WOO_BATCH_SIZE, orderIds.length);
    process.stdout.write(`\r⏳ 获取 WooCommerce 数据: ${progress}/${orderIds.length} (${Math.round(progress / orderIds.length * 100)}%)`);
  }
  
  console.log('');
  return results;
}

// 提取物流跟踪信息
function extractTrackingInfo(wooOrder: any): TrackingInfo[] {
  const metaData = wooOrder.meta_data || [];
  const trackingMeta = metaData.find((m: any) => m.key === '_wc_shipment_tracking_items');
  
  if (!trackingMeta?.value || !Array.isArray(trackingMeta.value)) {
    return [];
  }
  
  return trackingMeta.value.map((item: any) => {
    const carrier = item.tracking_provider || item.custom_tracking_provider || 'Unknown';
    const trackingNumber = item.tracking_number || '';
    
    // 生成跟踪链接
    let trackingUrl = item.custom_tracking_link || item.tracking_link || '';
    if (!trackingUrl && trackingNumber) {
      // 根据物流商生成链接
      if (carrier.toLowerCase().includes('dhl')) {
        trackingUrl = `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
      } else if (carrier.toLowerCase().includes('fedex')) {
        trackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
      } else if (carrier.toLowerCase().includes('ups')) {
        trackingUrl = `https://www.ups.com/track?tracknum=${trackingNumber}`;
      } else {
        trackingUrl = `https://t.17track.net/en#nums=${trackingNumber}`;
      }
    }
    
    // 处理发货日期
    let dateShipped: string | undefined;
    if (item.date_shipped) {
      const timestamp = parseInt(item.date_shipped);
      if (!isNaN(timestamp)) {
        dateShipped = new Date(timestamp * 1000).toISOString();
      }
    }
    
    return {
      carrier,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      date_shipped: dateShipped,
    };
  }).filter((t: TrackingInfo) => t.tracking_number);
}

// 订单归属信息接口
interface OrderAttribution {
  source_type: string | null;
  utm_source: string | null;
  device_type: string | null;
  session_pages: number | null;
  referrer: string | null;
}

// 提取订单归属信息（WooCommerce Order Attribution）
function extractOrderAttribution(wooOrder: any): OrderAttribution {
  const metaData = wooOrder.meta_data || [];
  
  const getMeta = (key: string): string | null => {
    const meta = metaData.find((m: any) => m.key === key);
    return meta?.value || null;
  };
  
  return {
    source_type: getMeta('_wc_order_attribution_source_type'),
    utm_source: getMeta('_wc_order_attribution_utm_source'),
    device_type: getMeta('_wc_order_attribution_device_type'),
    session_pages: getMeta('_wc_order_attribution_session_pages') 
      ? parseInt(getMeta('_wc_order_attribution_session_pages')!) 
      : null,
    referrer: getMeta('_wc_order_attribution_referrer'),
  };
}

// 提取订单来源（友好名称）
function extractOrderSource(wooOrder: any): string {
  const createdVia = wooOrder.created_via || '';
  const paymentMethod = wooOrder.payment_method || '';
  const metaData = wooOrder.meta_data || [];
  
  // 优先使用 WooCommerce Order Attribution 的来源类型
  const sourceTypeMeta = metaData.find((m: any) => m.key === '_wc_order_attribution_source_type');
  if (sourceTypeMeta?.value) {
    const sourceType = sourceTypeMeta.value;
    const utmSourceMeta = metaData.find((m: any) => m.key === '_wc_order_attribution_utm_source');
    const utmSource = utmSourceMeta?.value || '';
    
    if (sourceType === 'organic' && utmSource) {
      return `Organic (${utmSource})`;
    }
    if (sourceType === 'direct') return 'Direct';
    if (sourceType === 'organic') return 'Organic';
    if (sourceType === 'paid') return `Paid (${utmSource || 'ads'})`;
    if (sourceType === 'referral') return `Referral`;
    return sourceType;
  }
  
  // 根据 created_via 和 payment_method 判断来源
  if (createdVia === 'checkout') {
    if (paymentMethod.toLowerCase().includes('paypal')) return 'PayPal';
    if (paymentMethod.toLowerCase().includes('stripe')) return 'Stripe';
    if (paymentMethod.toLowerCase().includes('klarna')) return 'Klarna';
    return 'Website';
  }
  if (createdVia === 'admin') return 'Admin';
  if (createdVia === 'rest-api') return 'API';
  if (createdVia === 'import') return 'Import';
  
  return createdVia || 'Unknown';
}

// 批量处理配置
const DB_BATCH_SIZE = 500;    // Supabase 批量写入数量

// 更新数据结构
interface OrderUpdate {
  id: string;
  order_number: string;
  tracking_info: TrackingInfo[];
  order_source: string;
  attribution_source_type: string | null;
  attribution_utm_source: string | null;
  attribution_device_type: string | null;
  attribution_session_pages: number | null;
  attribution_referrer: string | null;
}

// 批量写入 Supabase（使用并发 update）
async function batchUpdateOrders(updates: OrderUpdate[]): Promise<number> {
  let successCount = 0;
  
  // 并发更新，每批 50 个并发
  const UPDATE_CONCURRENCY = 50;
  
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    const batch = updates.slice(i, i + UPDATE_CONCURRENCY);
    
    const results = await Promise.all(
      batch.map(async (u) => {
        const { error } = await supabase
          .from('orders')
          .update({
            tracking_info: u.tracking_info,
            order_source: u.order_source,
            attribution_source_type: u.attribution_source_type,
            attribution_utm_source: u.attribution_utm_source,
            attribution_device_type: u.attribution_device_type,
            attribution_session_pages: u.attribution_session_pages,
            attribution_referrer: u.attribution_referrer,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', u.id);
        
        return !error;
      })
    );
    
    successCount += results.filter(Boolean).length;
    
    const progress = Math.min(i + UPDATE_CONCURRENCY, updates.length);
    process.stdout.write(`\r⏳ 写入数据库: ${progress}/${updates.length} (${Math.round(progress / updates.length * 100)}%)`);
  }
  
  console.log('');
  return successCount;
}

// 主函数
async function main() {
  const targetSite = process.argv[2] as SiteKey | undefined;
  const sites: SiteKey[] = targetSite ? [targetSite] : ['com', 'uk', 'de', 'fr'];
  
  console.log('🚀 开始同步已完成订单的物流信息和订单来源');
  console.log(`📍 目标站点: ${sites.join(', ')}`);
  console.log(`⚡ WooCommerce 批量获取: ${WOO_BATCH_SIZE} 条/请求`);
  console.log(`⚡ Supabase 批量写入: ${DB_BATCH_SIZE} 条/批`);
  console.log('');

  for (const site of sites) {
    console.log(`\n========== ${site.toUpperCase()} ==========`);
    
    // 1. 从 Supabase 分页获取所有已完成的订单
    const PAGE_SIZE = 1000;
    let orders: any[] = [];
    let page = 0;
    let hasMore = true;
    
    console.log('📥 正在获取订单列表...');
    
    while (hasMore) {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, woo_id, tracking_info, order_source, attribution_source_type, attribution_utm_source, attribution_device_type')
        .eq('site', site)
        .eq('status', 'completed')
        .order('date_created', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      
      if (error) {
        console.error(`❌ 获取订单失败: ${error.message}`);
        break;
      }
      
      if (data && data.length > 0) {
        orders = orders.concat(data);
        process.stdout.write(`\r📥 已获取 ${orders.length} 条订单...`);
        page++;
        hasMore = data.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }
    
    console.log('');
    console.log(`📦 找到 ${orders.length} 个已完成订单`);
    
    if (orders.length === 0) continue;
    
    // 2. 批量从 WooCommerce 获取订单数据
    const wooOrderIds = orders.map(o => o.woo_id);
    const wooOrdersMap = await fetchWooOrdersBatch(site, wooOrderIds);
    
    console.log(`✓ 从 WooCommerce 获取到 ${wooOrdersMap.size} 个订单`);
    
    // 3. 处理数据，找出需要更新的订单
    const updates: OrderUpdate[] = [];
    let skipped = 0;
    let errors = 0;
    
    for (const order of orders) {
      const wooOrder = wooOrdersMap.get(order.woo_id);
      if (!wooOrder) {
        errors++;
        continue;
      }
      
      const trackingInfo = extractTrackingInfo(wooOrder);
      const orderSource = extractOrderSource(wooOrder);
      const attribution = extractOrderAttribution(wooOrder);
      
      // 检查是否需要更新
      const currentTracking = order.tracking_info || [];
      const hasNewTracking = JSON.stringify(trackingInfo) !== JSON.stringify(currentTracking);
      const hasNewSource = orderSource !== order.order_source;
      const hasNewAttribution = attribution.source_type !== order.attribution_source_type;
      
      if (!hasNewTracking && !hasNewSource && !hasNewAttribution) {
        skipped++;
        continue;
      }
      
      updates.push({
        id: order.id,
        order_number: order.order_number,
        tracking_info: trackingInfo,
        order_source: orderSource,
        attribution_source_type: attribution.source_type,
        attribution_utm_source: attribution.utm_source,
        attribution_device_type: attribution.device_type,
        attribution_session_pages: attribution.session_pages,
        attribution_referrer: attribution.referrer,
      });
    }
    
    console.log(`📝 需要更新: ${updates.length}, 跳过: ${skipped}, 获取失败: ${errors}`);
    
    // 4. 批量写入 Supabase
    if (updates.length > 0) {
      const successCount = await batchUpdateOrders(updates);
      
      // 打印更新详情
      for (const u of updates) {
        const trackingStr = u.tracking_info.length > 0 
          ? u.tracking_info.map(t => t.tracking_number).join(', ')
          : '无物流';
        const attrStr = u.attribution_source_type 
          ? `${u.attribution_source_type}${u.attribution_utm_source ? `/${u.attribution_utm_source}` : ''} | ${u.attribution_device_type || '-'}`
          : u.order_source;
        console.log(`✅ #${u.order_number}: ${trackingStr} | ${attrStr}`);
      }
      
      console.log(`\n📊 ${site.toUpperCase()} 统计: 更新 ${successCount}, 跳过 ${skipped}, 错误 ${errors}`);
    } else {
      console.log(`\n📊 ${site.toUpperCase()} 统计: 无需更新, 跳过 ${skipped}`);
    }
  }
  
  console.log('\n✨ 同步完成!');
}

main().catch(console.error);

