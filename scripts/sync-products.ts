/**
 * 商品同步脚本 v3 - 支持增删改
 *
 * 功能：
 * 1. 从主站拉取所有 publish 商品
 * 2. 与数据库对比，检测：新增、修改、删除
 * 3. 同步变更到 Supabase（SKU 为主键）
 * 4. 回填 SKU 到所有站点
 *
 * 运行: npx tsx scripts/sync-products.ts
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

interface WooProduct {
  id: number;
  name: string;
  slug: string;
  sku: string;
  status: string;
  price: string;
  regular_price: string;
  stock_status: string;
  stock_quantity: number | null;
  categories: { id: number; name: string; slug: string }[];
  images: { id: number; src: string }[];
  attributes: { id: number; name: string; options: string[] }[];
  description: string;
  short_description: string;
  date_created: string;
  date_modified: string;
}

interface LocalProduct {
  sku: string;
  name: string;
  slug: string | null;
  status: string;
  price: number | null;
  regular_price: number | null;
  stock_status: string;
  stock_quantity: number;
  images: string[];
  categories: string[];
  attributes: Record<string, unknown>;
  woo_ids: Record<string, number>;
  content: Record<string, unknown>;
  sync_status: Record<string, string>;
  updated_at?: string;
}

// 并发控制
const CONCURRENCY = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// 从商品名称解析属性
function parseProductName(name: string): {
  team: string;
  season: string;
  type: string;
  version: string;
  gender: string;
  sleeve: string;
} {
  const result = {
    team: '',
    season: '',
    type: 'Home',
    version: 'Standard',
    gender: "Men's",
    sleeve: 'Short Sleeve',
  };

  const seasonMatch = name.match(/(\d{4}\/\d{2})/);
  if (seasonMatch) {
    result.season = seasonMatch[1];
  }

  if (name.toLowerCase().includes('retro')) {
    result.season = 'Retro';
    result.version = 'Retro';
  }

  const types = ['Home', 'Away', 'Third', 'Fourth', 'Goalkeeper', 'Training', 'Pre-Match', 'Fan Tee', 'Anniversary'];
  for (const t of types) {
    if (name.toLowerCase().includes(t.toLowerCase())) {
      result.type = t;
      break;
    }
  }

  if (name.toLowerCase().includes('player version')) {
    result.version = 'Player Version';
  } else if (name.toLowerCase().includes('special')) {
    result.version = 'Special Edition';
  }

  if (name.toLowerCase().includes('kids') || name.toLowerCase().includes('kid')) {
    result.gender = 'Kids';
  } else if (name.toLowerCase().includes('women') || name.toLowerCase().includes("women's")) {
    result.gender = "Women's";
  }

  if (name.toLowerCase().includes('long sleeve')) {
    result.sleeve = 'Long Sleeve';
  } else if (name.toLowerCase().includes('kit')) {
    result.sleeve = 'Kit';
  }

  let teamName = name;
  teamName = teamName.replace(/\d{4}\/\d{2}/g, '');
  teamName = teamName.replace(/jersey|retro|player version|special edition|long sleeve|kit|home|away|third|fourth|goalkeeper|training|pre-match|kids|women's|men's|-/gi, '');
  teamName = teamName.replace(/\s+/g, ' ').trim();

  const words = teamName.split(' ').filter(w => w.length > 1);
  if (words.length >= 2) {
    result.team = words.slice(0, 2).join(' ');
  } else if (words.length === 1) {
    result.team = words[0];
  }

  return result;
}

// 生成SKU
function generateSKU(wooId: number, attrs: ReturnType<typeof parseProductName>): string {
  const teamCode = attrs.team.substring(0, 3).toUpperCase().replace(/\s/g, '') || 'XXX';

  let seasonCode = 'XXX';
  if (attrs.season === 'Retro') {
    seasonCode = 'RET';
  } else if (attrs.season) {
    seasonCode = attrs.season.replace('/', '').substring(2);
  }

  const typeMap: Record<string, string> = {
    Home: 'HOM', Away: 'AWY', Third: 'THD', Fourth: 'FTH',
    Goalkeeper: 'GKP', Training: 'TRN', 'Pre-Match': 'PRE',
    'Fan Tee': 'FAN', Anniversary: 'ANV',
  };
  const typeCode = typeMap[attrs.type] || 'OTH';

  const versionMap: Record<string, string> = {
    Standard: 'STD', 'Player Version': 'PLY',
    'Special Edition': 'SPE', Retro: 'RET',
  };
  const versionCode = versionMap[attrs.version] || 'STD';

  let suffix = '';
  if (attrs.gender === 'Kids') suffix += 'K';
  if (attrs.gender === "Women's") suffix += 'W';
  if (attrs.sleeve === 'Long Sleeve') suffix += 'L';
  if (attrs.sleeve === 'Kit') suffix += 'T';

  return `${teamCode}-${seasonCode}-${typeCode}-${versionCode}${suffix ? '-' + suffix : ''}-${wooId}`;
}

// 获取所有商品（分页）- 只获取 publish 状态
async function fetchAllProducts(site: SiteKey): Promise<WooProduct[]> {
  const { url, key, secret } = SITES[site];
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const allProducts: WooProduct[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `${url}/wp-json/wc/v3/products?page=${page}&per_page=${perPage}&status=publish&orderby=id&order=asc`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const products: WooProduct[] = await response.json();
    allProducts.push(...products);

    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');
    process.stdout.write(`\r  获取进度: ${page}/${totalPages} 页 (${allProducts.length} 个商品)`);

    if (page >= totalPages) break;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('');
  return allProducts;
}

// 获取数据库中所有商品
async function fetchLocalProducts(): Promise<Map<string, LocalProduct>> {
  const products = new Map<string, LocalProduct>();
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw new Error(`Failed to fetch local products: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const p of data) {
      products.set(p.sku, p as LocalProduct);
    }

    if (data.length < pageSize) break;
    page++;
  }

  return products;
}

// 带重试的更新WooCommerce商品SKU
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

      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
      }
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
      }
    }
  }
  return false;
}

// 转换 WooCommerce 商品为本地格式
function wooToLocal(product: WooProduct, existingSku?: string): Omit<LocalProduct, 'updated_at'> {
  const attrs = parseProductName(product.name);
  const sku = existingSku || generateSKU(product.id, attrs);

  return {
    sku,
    name: product.name,
    slug: product.slug,
    status: product.status,
    price: parseFloat(product.price) || null,
    regular_price: parseFloat(product.regular_price) || null,
    stock_status: product.stock_status,
    stock_quantity: product.stock_quantity || 100,
    images: product.images.map(img => img.src),
    categories: product.categories.map(cat => cat.name),
    attributes: attrs,
    woo_ids: {
      com: product.id,
      uk: product.id,
      de: product.id,
      fr: product.id,
    },
    content: {
      com: {
        name: product.name,
        description: product.description,
        short_description: product.short_description,
      },
    },
    sync_status: {
      com: 'synced',
      uk: 'synced',
      de: 'synced',
      fr: 'synced',
    },
  };
}

// 检测商品是否有变化
function hasChanges(local: LocalProduct, woo: WooProduct): boolean {
  // 比较关键字段
  if (local.name !== woo.name) return true;
  if (local.status !== woo.status) return true;
  if (local.price !== (parseFloat(woo.price) || null)) return true;
  if (local.regular_price !== (parseFloat(woo.regular_price) || null)) return true;
  if (local.stock_status !== woo.stock_status) return true;
  if (local.stock_quantity !== (woo.stock_quantity || 100)) return true;

  // 比较图片
  const wooImages = woo.images.map(img => img.src);
  if (JSON.stringify(local.images) !== JSON.stringify(wooImages)) return true;

  // 比较分类
  const wooCategories = woo.categories.map(cat => cat.name);
  if (JSON.stringify(local.categories) !== JSON.stringify(wooCategories)) return true;

  // 比较描述内容
  const localContent = local.content?.com as { description?: string; short_description?: string } | undefined;
  if (localContent?.description !== woo.description) return true;
  if (localContent?.short_description !== woo.short_description) return true;

  return false;
}

async function main() {
  console.log('='.repeat(60));
  console.log('商品同步 v3 - 支持增删改（SKU 为主键）');
  console.log('='.repeat(60));

  // 1. 获取数据库现有商品
  console.log('\n[1/5] 获取数据库现有商品...');
  const localProducts = await fetchLocalProducts();
  console.log(`  数据库现有: ${localProducts.size} 个商品`);

  // 2. 从主站获取所有 publish 商品
  console.log('\n[2/5] 从主站获取商品（仅 publish）...');
  const wooProducts = await fetchAllProducts('com');
  console.log(`  主站商品数: ${wooProducts.length}`);

  // 3. 对比差异
  console.log('\n[3/5] 对比差异...');

  // 建立 woo_id -> local product 的映射
  const localByWooId = new Map<number, LocalProduct>();
  for (const [_, product] of localProducts) {
    const comId = product.woo_ids?.com;
    if (comId) {
      localByWooId.set(comId, product);
    }
  }

  const toInsert: WooProduct[] = [];
  const toUpdate: { woo: WooProduct; local: LocalProduct }[] = [];
  const wooIds = new Set<number>();

  for (const woo of wooProducts) {
    wooIds.add(woo.id);
    const local = localByWooId.get(woo.id);

    if (!local) {
      // 新商品
      toInsert.push(woo);
    } else if (hasChanges(local, woo)) {
      // 已修改
      toUpdate.push({ woo, local });
    }
  }

  // 找出已删除（或已下架）的商品
  const toDelete: LocalProduct[] = [];
  for (const [_, local] of localProducts) {
    const comId = local.woo_ids?.com;
    if (comId && !wooIds.has(comId)) {
      toDelete.push(local);
    }
  }

  console.log(`  新增: ${toInsert.length} 个`);
  console.log(`  修改: ${toUpdate.length} 个`);
  console.log(`  删除: ${toDelete.length} 个`);

  // 4. 执行同步
  console.log('\n[4/5] 执行同步...');

  // 4.1 插入新商品
  if (toInsert.length > 0) {
    console.log(`\n  插入 ${toInsert.length} 个新商品...`);
    const insertData = toInsert.map(woo => wooToLocal(woo));

    for (let i = 0; i < insertData.length; i += 50) {
      const batch = insertData.slice(i, i + 50);
      const { error } = await supabase.from('products').insert(batch);
      if (error) {
        console.error(`    批次插入失败:`, error.message);
      } else {
        process.stdout.write(`\r    已插入: ${Math.min(i + 50, insertData.length)}/${insertData.length}`);
      }
    }
    console.log('');
  }

  // 4.2 更新已修改商品
  if (toUpdate.length > 0) {
    console.log(`\n  更新 ${toUpdate.length} 个已修改商品...`);

    for (let i = 0; i < toUpdate.length; i++) {
      const { woo, local } = toUpdate[i];
      const updateData = wooToLocal(woo, local.sku);

      const { error } = await supabase
        .from('products')
        .update({
          name: updateData.name,
          slug: updateData.slug,
          status: updateData.status,
          price: updateData.price,
          regular_price: updateData.regular_price,
          stock_status: updateData.stock_status,
          stock_quantity: updateData.stock_quantity,
          images: updateData.images,
          categories: updateData.categories,
          attributes: updateData.attributes,
          content: updateData.content,
        })
        .eq('sku', local.sku);

      if (error) {
        console.error(`    更新 ${local.sku} 失败:`, error.message);
      }

      process.stdout.write(`\r    已更新: ${i + 1}/${toUpdate.length}`);
    }
    console.log('');
  }

  // 4.3 删除已下架商品
  if (toDelete.length > 0) {
    console.log(`\n  删除 ${toDelete.length} 个已下架商品...`);

    const skusToDelete = toDelete.map(p => p.sku);
    for (let i = 0; i < skusToDelete.length; i += 50) {
      const batch = skusToDelete.slice(i, i + 50);
      const { error } = await supabase
        .from('products')
        .delete()
        .in('sku', batch);

      if (error) {
        console.error(`    批次删除失败:`, error.message);
      } else {
        process.stdout.write(`\r    已删除: ${Math.min(i + 50, skusToDelete.length)}/${skusToDelete.length}`);
      }
    }
    console.log('');
  }

  // 5. 回填新商品的 SKU 到 WooCommerce
  if (toInsert.length > 0) {
    console.log('\n[5/5] 回填新商品 SKU 到 WooCommerce...');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toInsert.length; i += CONCURRENCY) {
      const batch = toInsert.slice(i, i + CONCURRENCY);

      await Promise.all(batch.map(async (woo) => {
        const attrs = parseProductName(woo.name);
        const sku = generateSKU(woo.id, attrs);

        // 更新4个站点
        const results = await Promise.all(
          (['com', 'uk', 'de', 'fr'] as SiteKey[]).map(site =>
            updateProductSKUWithRetry(site, woo.id, sku)
          )
        );

        const allSuccess = results.every(r => r);
        if (allSuccess) {
          successCount++;
        } else {
          failCount++;
        }
      }));

      process.stdout.write(`\r    进度: ${Math.min(i + CONCURRENCY, toInsert.length)}/${toInsert.length} (成功: ${successCount}, 失败: ${failCount})`);
    }
    console.log('');
  } else {
    console.log('\n[5/5] 无新商品需要回填 SKU');
  }

  // 输出总结
  console.log('\n' + '='.repeat(60));
  console.log('同步完成!');
  console.log('='.repeat(60));
  console.log(`原有商品: ${localProducts.size}`);
  console.log(`主站商品: ${wooProducts.length}`);
  console.log(`新增: ${toInsert.length}, 修改: ${toUpdate.length}, 删除: ${toDelete.length}`);

  // 最终统计
  const { count } = await supabase.from('products').select('*', { count: 'exact', head: true });
  console.log(`当前数据库商品数: ${count}`);
}

main().catch(console.error);
