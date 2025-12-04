/**
 * 重试失败的站点同步
 * 查询 sync_status 中包含 error 的商品，重新同步到对应站点
 *
 * 运行: npx tsx scripts/retry-failed.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iwzohjbvuhwvfidyevpf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NjQ4OTAsImV4cCI6MjA4MDI0MDg5MH0.82F_hoRBAWLUAUzv-7-rM0-EhoaUNb4G5jhxbcH-MIo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SITES = {
  com: {
    url: 'https://jerseysfever.com',
    key: 'ck_ef971832c16308aa87fed8f6318d67b49ca189ee',
    secret: 'cs_81ac0091b0cc9bc4cffe4e422fcfb8e72b676dc5',
  },
  uk: {
    url: 'https://jerseysfever.uk',
    key: 'ck_f57b40ac92270cb5f8af10680cbc8a16b301f876',
    secret: 'cs_b3ccf99d853a04506b3e81c56a77d81a1fdd60de',
  },
  de: {
    url: 'https://jerseysfever.de',
    key: 'ck_3f99da12ba804e5e19728453d38969909f876ffd',
    secret: 'cs_e43e59c8aeaa18b726d42d680cc201f4a34f1784',
  },
  fr: {
    url: 'https://jerseysfever.fr',
    key: 'ck_0dbcc01d41b5b1780362ec7ffe5d17ed6a5fe317',
    secret: 'cs_928b2a043e7e60f50c3f4853fb4f25183ac5d211',
  },
};

type SiteKey = keyof typeof SITES;

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const CONCURRENCY = 5;

// 带重试的更新
async function updateProductSKUWithRetry(
  site: SiteKey,
  productId: number,
  sku: string,
  retries = MAX_RETRIES
): Promise<boolean> {
  const { url, key, secret } = SITES[site];
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${url}/wp-json/wc/v3/products/${productId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sku }),
      });

      if (response.ok) {
        return true;
      }

      const error = await response.text();
      if (attempt < retries) {
        console.log(`  ⚠ ${site} 重试 ${attempt}/${retries}...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
      } else {
        console.error(`  ✗ ${site} 失败: ${error.substring(0, 100)}`);
      }
    } catch (err) {
      if (attempt < retries) {
        console.log(`  ⚠ ${site} 网络错误，重试 ${attempt}/${retries}...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
      } else {
        console.error(`  ✗ ${site} 网络错误`);
      }
    }
  }
  return false;
}

async function main() {
  console.log('='.repeat(60));
  console.log('重试失败的站点同步');
  console.log('='.repeat(60));

  // 1. 查询所有有 error 状态的商品
  console.log('\n[1/3] 查询失败的商品...');

  const { data: products, error } = await supabase
    .from('products')
    .select('woo_id, sku, name, sync_status')
    .order('woo_id', { ascending: true });

  if (error) {
    console.error('查询失败:', error);
    return;
  }

  // 2. 筛选出需要重试的商品和站点
  const toRetry: { wooId: number; sku: string; name: string; sites: SiteKey[] }[] = [];

  for (const product of products || []) {
    const syncStatus = product.sync_status as Record<string, string> | null;
    if (!syncStatus) continue;

    const failedSites: SiteKey[] = [];
    for (const [site, status] of Object.entries(syncStatus)) {
      if (status === 'error') {
        failedSites.push(site as SiteKey);
      }
    }

    if (failedSites.length > 0) {
      toRetry.push({
        wooId: product.woo_id,
        sku: product.sku,
        name: product.name,
        sites: failedSites,
      });
    }
  }

  console.log(`找到 ${toRetry.length} 个需要重试的商品`);

  if (toRetry.length === 0) {
    console.log('\n✓ 所有商品都已同步成功，无需重试！');
    return;
  }

  // 按站点统计
  const siteStats: Record<SiteKey, number> = { com: 0, uk: 0, de: 0, fr: 0 };
  for (const item of toRetry) {
    for (const site of item.sites) {
      siteStats[site]++;
    }
  }
  console.log('\n失败站点统计:');
  for (const [site, count] of Object.entries(siteStats)) {
    if (count > 0) {
      console.log(`  ${site}: ${count} 个商品`);
    }
  }

  // 3. 重试同步
  console.log('\n[2/3] 开始重试...');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toRetry.length; i += CONCURRENCY) {
    const batch = toRetry.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async (item, idx) => {
      const results: Record<string, string> = {};

      for (const site of item.sites) {
        const success = await updateProductSKUWithRetry(site, item.wooId, item.sku);
        results[site] = success ? 'synced' : 'error';

        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      // 更新 Supabase 中的状态
      const { data: current } = await supabase
        .from('products')
        .select('sync_status')
        .eq('woo_id', item.wooId)
        .single();

      const updatedStatus = {
        ...(current?.sync_status || {}),
        ...results,
      };

      await supabase
        .from('products')
        .update({ sync_status: updatedStatus })
        .eq('woo_id', item.wooId);

      const statusStr = Object.values(results).every(s => s === 'synced') ? '✓' : '部分失败';
      console.log(`  [${i + idx + 1}/${toRetry.length}] ${item.wooId} ${statusStr}`);
    }));

    // 批次间暂停
    if (i + CONCURRENCY < toRetry.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 4. 输出结果
  console.log('\n' + '='.repeat(60));
  console.log('重试完成!');
  console.log('='.repeat(60));
  console.log(`重试商品数: ${toRetry.length}`);
  console.log(`成功: ${successCount}, 失败: ${failCount}`);
  console.log(`成功率: ${((successCount / (successCount + failCount)) * 100).toFixed(1)}%`);

  if (failCount > 0) {
    console.log('\n⚠ 仍有失败的商品，可以稍后再次运行此脚本重试');
  }
}

main().catch(console.error);
