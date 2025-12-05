/**
 * 全量订单同步脚本
 * 直接从 WooCommerce API 获取订单并写入 Supabase
 *
 * 使用方法:
 * 1. 首先设置环境变量（从 Supabase Dashboard > Settings > API 获取 service_role key）
 *    export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
 *
 * 2. 设置 WooCommerce API 密钥（从 WordPress > WooCommerce > Settings > Advanced > REST API）
 *    export WOO_COM_KEY=ck_xxx
 *    export WOO_COM_SECRET=cs_xxx
 *    export WOO_UK_KEY=ck_xxx
 *    export WOO_UK_SECRET=cs_xxx
 *    export WOO_DE_KEY=ck_xxx
 *    export WOO_DE_SECRET=cs_xxx
 *    export WOO_FR_KEY=ck_xxx
 *    export WOO_FR_SECRET=cs_xxx
 *
 * 3. 运行脚本
 *    npx tsx scripts/sync-orders-full.ts
 *
 * 可选参数:
 * --site=de           只同步指定站点
 * --after=2024-01-01  只同步指定日期之后的订单
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// 手动加载 .env 文件
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

// ==================== 配置 ====================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iwzohjbvuhwvfidyevpf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// WooCommerce 站点配置
// 优先使用环境变量，兼容 VITE_ 前缀和无前缀两种格式
const SITES = {
  com: {
    url: 'https://jerseysfever.com',
    key: process.env.WOO_COM_KEY || process.env.VITE_WOO_COM_KEY || '',
    secret: process.env.WOO_COM_SECRET || process.env.VITE_WOO_COM_SECRET || '',
  },
  uk: {
    url: 'https://jerseysfever.uk',
    key: process.env.WOO_UK_KEY || process.env.VITE_WOO_UK_KEY || '',
    secret: process.env.WOO_UK_SECRET || process.env.VITE_WOO_UK_SECRET || '',
  },
  de: {
    url: 'https://jerseysfever.de',
    key: process.env.WOO_DE_KEY || process.env.VITE_WOO_DE_KEY || '',
    secret: process.env.WOO_DE_SECRET || process.env.VITE_WOO_DE_SECRET || '',
  },
  fr: {
    url: 'https://jerseysfever.fr',
    key: process.env.WOO_FR_KEY || process.env.VITE_WOO_FR_KEY || '',
    secret: process.env.WOO_FR_SECRET || process.env.VITE_WOO_FR_SECRET || '',
  },
} as const;

type SiteKey = keyof typeof SITES;

// ==================== Supabase 客户端 ====================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ==================== WooCommerce API ====================

async function fetchWooOrders(
  site: SiteKey,
  options: { page?: number; per_page?: number; after?: string; before?: string } = {}
): Promise<any[]> {
  const config = SITES[site];
  const auth = Buffer.from(`${config.key}:${config.secret}`).toString('base64');

  const params = new URLSearchParams({
    page: String(options.page || 1),
    per_page: String(options.per_page || 100),
    order: 'desc',
    orderby: 'date',
  });

  if (options.after) {
    params.set('after', options.after);
  }
  if (options.before) {
    params.set('before', options.before);
  }

  const url = `${config.url}/wp-json/wc/v3/orders?${params}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`[${site}] API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// ==================== 订单转换 ====================

function transformOrder(order: any, site: SiteKey) {
  const billing = order.billing || {};
  const shipping = order.shipping || {};

  return {
    site,
    woo_id: order.id,
    order_number: order.number || String(order.id),
    status: order.status,
    currency: order.currency,
    total: parseFloat(order.total) || 0,
    subtotal: parseFloat(order.subtotal) || 0,
    shipping_total: parseFloat(order.shipping_total) || 0,
    discount_total: parseFloat(order.discount_total) || 0,
    tax_total: parseFloat(order.total_tax) || 0,
    customer_id: order.customer_id || null,
    customer_email: billing.email || '',
    customer_name: [billing.first_name, billing.last_name].filter(Boolean).join(' ') || '',
    billing_address: billing,
    shipping_address: shipping,
    line_items: order.line_items || [],
    shipping_lines: order.shipping_lines || [],
    payment_method: order.payment_method || '',
    payment_method_title: order.payment_method_title || '',
    transaction_id: order.transaction_id || null,
    customer_note: order.customer_note || '',
    date_created: order.date_created,
    date_modified: order.date_modified,
    date_completed: order.date_completed || null,
    date_paid: order.date_paid || null,
  };
}

// ==================== 同步逻辑 ====================

async function syncSite(site: SiteKey, options: { after?: string } = {}) {
  console.log(`\n📦 [${site.toUpperCase()}] 开始同步订单...`);
  const startTime = Date.now();

  let page = 1;
  let totalSynced = 0;
  let totalErrors = 0;
  const perPage = 100;
  const maxPages = 500; // 最多 50000 条

  while (page <= maxPages) {
    try {
      // 获取订单
      const orders = await fetchWooOrders(site, {
        page,
        per_page: perPage,
        after: options.after,
      });

      if (orders.length === 0) {
        console.log(`  ✓ 第 ${page} 页: 无更多订单`);
        break;
      }

      // 转换订单数据
      const ordersData = orders.map(order => transformOrder(order, site));

      // 批量 upsert 到 Supabase
      const { error } = await supabase
        .from('orders')
        .upsert(ordersData, {
          onConflict: 'site,woo_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`  ✗ 第 ${page} 页: 插入失败 -`, error.message);
        totalErrors += orders.length;
      } else {
        totalSynced += orders.length;
        console.log(`  ✓ 第 ${page} 页: ${orders.length} 条 (累计 ${totalSynced})`);
      }

      // 如果返回的数量少于每页数量，说明没有更多了
      if (orders.length < perPage) {
        break;
      }

      page++;

      // 每 10 页暂停 1 秒，避免请求过快
      if (page % 10 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(`  ✗ 第 ${page} 页: 请求失败 -`, err instanceof Error ? err.message : err);
      // 出错后等待 3 秒重试
      await new Promise(r => setTimeout(r, 3000));
      // 重试 3 次后跳过
      totalErrors++;
      if (totalErrors > 10) {
        console.error(`  ⚠ 错误过多，停止同步`);
        break;
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ [${site.toUpperCase()}] 同步完成: ${totalSynced} 条成功, ${totalErrors} 条失败 (${duration}s)`);

  return { site, synced: totalSynced, errors: totalErrors };
}

// ==================== 主函数 ====================

async function main() {
  console.log('🚀 全量订单同步脚本');
  console.log('==================');

  // 解析命令行参数
  const args = process.argv.slice(2);
  let targetSite: SiteKey | undefined;
  let afterDate: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--site=')) {
      targetSite = arg.split('=')[1] as SiteKey;
    }
    if (arg.startsWith('--after=')) {
      afterDate = arg.split('=')[1];
    }
  }

  // 检查环境变量
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY 环境变量');
    console.log('\n请设置以下环境变量:');
    console.log('  export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
    console.log('  export WOO_DE_KEY=your_woo_key');
    console.log('  export WOO_DE_SECRET=your_woo_secret');
    console.log('  (其他站点类似)');
    process.exit(1);
  }

  // 确定要同步的站点
  const sites: SiteKey[] = targetSite ? [targetSite] : ['com', 'uk', 'de', 'fr'];

  // 检查站点配置
  for (const site of sites) {
    if (!SITES[site].key || !SITES[site].secret) {
      console.error(`❌ 缺少 ${site.toUpperCase()} 站点的 WooCommerce API 密钥`);
      console.log(`  请设置: WOO_${site.toUpperCase()}_KEY 和 WOO_${site.toUpperCase()}_SECRET`);
      process.exit(1);
    }
  }

  console.log(`\n站点: ${sites.join(', ')}`);
  if (afterDate) {
    console.log(`日期范围: ${afterDate} 之后`);
  } else {
    console.log('日期范围: 全部');
  }

  const startTime = Date.now();
  const results = [];

  // 逐站点同步
  for (const site of sites) {
    const result = await syncSite(site, { after: afterDate });
    results.push(result);
  }

  // 汇总
  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  console.log('\n==================');
  console.log(`🏁 全部完成！`);
  console.log(`   总计: ${totalSynced} 条成功, ${totalErrors} 条失败`);
  console.log(`   耗时: ${totalDuration} 分钟`);

  // 显示各站点结果
  console.log('\n各站点统计:');
  for (const r of results) {
    console.log(`   ${r.site.toUpperCase()}: ${r.synced} 条`);
  }
}

main().catch(console.error);
