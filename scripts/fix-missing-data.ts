/**
 * 补全缺失数据：从 WooCommerce 重新获取商品并插入
 *
 * 运行: npx tsx scripts/fix-missing-data.ts
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
};

// SKU 生成函数
function generateSKU(product: any): string {
  const name = product.name || '';
  const categories = product.categories?.map((c: any) => c.name) || [];

  // 提取球队
  let team = 'XXX';
  const teamPatterns: Record<string, string> = {
    'Manchester United': 'MAN',
    'Manchester City': 'MCI',
    'Arsenal': 'ARS',
    'Chelsea': 'CHE',
    'Liverpool': 'LIV',
    'Tottenham': 'TOT',
    'Barcelona': 'BAR',
    'Real Madrid': 'RMA',
    'Bayern': 'BAY',
    'Juventus': 'JUV',
    'PSG': 'PSG',
    'Paris Saint': 'PSG',
    'Inter Milan': 'INT',
    'AC Milan': 'ACM',
    'Borussia Dortmund': 'BVB',
    'Dortmund': 'BVB',
    'Ajax': 'AJX',
    'Benfica': 'BEN',
    'Porto': 'POR',
    'Napoli': 'NAP',
    'Roma': 'ROM',
    'Lazio': 'LAZ',
    'Atletico': 'ATM',
    'Sevilla': 'SEV',
    'Valencia': 'VAL',
    'Athletic Bilbao': 'ATH',
    'Real Sociedad': 'RSO',
    'Villarreal': 'VIL',
    'Celtic': 'CEL',
    'Rangers': 'RAN',
    'Leipzig': 'RBL',
    'Leverkusen': 'LEV',
    'Wolfsburg': 'WOL',
    'Frankfurt': 'FRA',
    'Marseille': 'MAR',
    'Lyon': 'LYO',
    'Monaco': 'MON',
    'Lille': 'LIL',
    'Feyenoord': 'FEY',
    'PSV': 'PSV',
    'Club Brugge': 'BRU',
    'Sporting': 'SCP',
    'Galatasaray': 'GAL',
    'Fenerbahce': 'FEN',
    'Brazil': 'BRA',
    'Argentina': 'ARG',
    'France': 'FRA',
    'England': 'ENG',
    'Germany': 'GER',
    'Spain': 'ESP',
    'Italy': 'ITA',
    'Portugal': 'POR',
    'Netherlands': 'NED',
    'Belgium': 'BEL',
    'Croatia': 'CRO',
    'Japan': 'JPN',
    'South Korea': 'KOR',
    'Mexico': 'MEX',
    'USA': 'USA',
    'Newcastle': 'NEW',
    'West Ham': 'WHU',
    'Aston Villa': 'AVL',
    'Everton': 'EVE',
    'Brighton': 'BHA',
    'Crystal Palace': 'CRY',
    'Wolves': 'WOL',
    'Wolverhampton': 'WOL',
    'Leicester': 'LEI',
    'Leeds': 'LEE',
    'Nottingham': 'NFO',
    'Fulham': 'FUL',
    'Brentford': 'BRE',
    'Bournemouth': 'BOU',
  };

  for (const [pattern, code] of Object.entries(teamPatterns)) {
    if (name.toLowerCase().includes(pattern.toLowerCase()) ||
        categories.some((c: string) => c.toLowerCase().includes(pattern.toLowerCase()))) {
      team = code;
      break;
    }
  }

  // 提取赛季
  let season = 'XXX';
  const seasonMatch = name.match(/(\d{2})\/(\d{2})|(\d{4})\/(\d{2,4})|(\d{4})-(\d{2,4})/);
  if (seasonMatch) {
    if (seasonMatch[1] && seasonMatch[2]) {
      season = `${seasonMatch[1]}${seasonMatch[2]}`;
    } else if (seasonMatch[3] && seasonMatch[4]) {
      season = `${seasonMatch[3].slice(-2)}${seasonMatch[4].slice(-2)}`;
    } else if (seasonMatch[5] && seasonMatch[6]) {
      season = `${seasonMatch[5].slice(-2)}${seasonMatch[6].slice(-2)}`;
    }
  } else if (name.toLowerCase().includes('retro')) {
    const retroMatch = name.match(/(\d{4})/);
    if (retroMatch) {
      season = `RET`;
    }
  }

  // 提取类型
  let type = 'XXX';
  const lowerName = name.toLowerCase();
  if (lowerName.includes('home')) type = 'HOM';
  else if (lowerName.includes('away')) type = 'AWY';
  else if (lowerName.includes('third')) type = 'THD';
  else if (lowerName.includes('fourth')) type = 'FTH';
  else if (lowerName.includes('goalkeeper') || lowerName.includes('gk')) type = 'GK';
  else if (lowerName.includes('training')) type = 'TRN';
  else if (lowerName.includes('pre-match') || lowerName.includes('prematch')) type = 'PRE';
  else if (lowerName.includes('special')) type = 'SPC';
  else if (lowerName.includes('icon') || lowerName.includes('iconic')) type = 'ICN';
  else if (lowerName.includes('anniversary')) type = 'ANV';

  // 提取版本
  let version = 'STD';
  if (lowerName.includes('player version') || lowerName.includes('player issue')) version = 'PLY';
  else if (lowerName.includes('authentic')) version = 'AUT';

  // 特殊标识
  const suffixes: string[] = [];
  if (lowerName.includes('kid') || lowerName.includes('youth') || lowerName.includes('child')) suffixes.push('K');
  if (lowerName.includes('women') || lowerName.includes("woman's")) suffixes.push('W');
  if (lowerName.includes('long sleeve')) suffixes.push('L');
  if (lowerName.includes('full kit') || (lowerName.includes('kit') && lowerName.includes('sock'))) suffixes.push('T');

  const suffix = suffixes.length > 0 ? `-${suffixes.join('')}` : '';

  return `${team}-${season}-${type}-${version}${suffix}-${product.id}`;
}

async function main() {
  console.log('='.repeat(60));
  console.log('补全缺失数据');
  console.log('='.repeat(60));

  // 1. 获取当前数据库中的 SKU
  console.log('\n[1/4] 获取当前数据库中的商品...');

  let existingSkus = new Set<string>();
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('sku')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('读取失败:', error.message);
      return;
    }

    if (!data || data.length === 0) break;
    data.forEach(p => existingSkus.add(p.sku));
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`数据库中现有 ${existingSkus.size} 个商品`);

  // 2. 从 WooCommerce 获取所有商品
  console.log('\n[2/4] 从 WooCommerce 获取商品...');

  const { url, key, secret } = SITES.com;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  let allWooProducts: any[] = [];
  let wooPage = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `${url}/wp-json/wc/v3/products?per_page=${perPage}&page=${wooPage}`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    if (!response.ok) {
      console.error('WooCommerce API 失败:', response.status);
      break;
    }

    const products = await response.json();
    if (!products || products.length === 0) break;

    allWooProducts.push(...products);
    process.stdout.write(`\r已获取: ${allWooProducts.length} 个商品`);

    if (products.length < perPage) break;
    wooPage++;
  }

  console.log(`\n总共获取 ${allWooProducts.length} 个 WooCommerce 商品`);

  // 3. 找出缺失的商品
  console.log('\n[3/4] 查找缺失商品...');

  const missingProducts: any[] = [];

  for (const wooProduct of allWooProducts) {
    const sku = wooProduct.sku || generateSKU(wooProduct);
    if (!existingSkus.has(sku)) {
      missingProducts.push({
        sku,
        name: wooProduct.name,
        slug: wooProduct.slug,
        status: wooProduct.status,
        price: parseFloat(wooProduct.price) || null,
        regular_price: parseFloat(wooProduct.regular_price) || null,
        stock_status: wooProduct.stock_status,
        stock_quantity: wooProduct.stock_quantity || 100,
        images: wooProduct.images?.map((img: any) => img.src) || [],
        categories: wooProduct.categories?.map((c: any) => c.name) || [],
        attributes: {},
        woo_ids: {
          com: wooProduct.id,
          uk: wooProduct.id,
          de: wooProduct.id,
          fr: wooProduct.id,
        },
        content: {},
        sync_status: {
          com: 'synced',
          uk: 'synced',
          de: 'synced',
          fr: 'synced',
        },
      });
    }
  }

  console.log(`找到 ${missingProducts.length} 个缺失商品`);

  if (missingProducts.length === 0) {
    console.log('\n✓ 数据完整，无需补全');
    return;
  }

  // 4. 插入缺失商品
  console.log('\n[4/4] 插入缺失商品...');

  const batchSize = 50;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < missingProducts.length; i += batchSize) {
    const batch = missingProducts.slice(i, i + batchSize);

    const { error: insertError } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'sku' });

    if (insertError) {
      console.error(`批次失败:`, insertError.message);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
      process.stdout.write(`\r已插入: ${successCount}/${missingProducts.length}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('补全完成!');
  console.log('='.repeat(60));
  console.log(`成功: ${successCount}, 失败: ${errorCount}`);

  // 验证
  const { count } = await supabase.from('products').select('*', { count: 'exact', head: true });
  console.log(`数据库总记录数: ${count}`);
}

main().catch(console.error);
