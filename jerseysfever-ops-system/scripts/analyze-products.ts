/**
 * 分析4个站点的商品数据，验证ID是否一致
 * 运行: npx tsx scripts/analyze-products.ts
 */

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

interface WooProduct {
  id: number;
  name: string;
  sku: string;
  slug: string;
  permalink: string;
  status: string;
  price: string;
  regular_price: string;
  stock_status: string;
  stock_quantity: number | null;
  categories: { id: number; name: string; slug: string }[];
  images: { id: number; src: string }[];
  attributes: { id: number; name: string; options: string[] }[];
  date_created: string;
}

async function fetchProducts(site: keyof typeof SITES, page = 1, perPage = 100): Promise<WooProduct[]> {
  const { url, key, secret } = SITES[site];
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const response = await fetch(
    `${url}/wp-json/wc/v3/products?page=${page}&per_page=${perPage}&orderby=id&order=asc`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${site}: ${response.status}`);
  }

  return response.json();
}

async function main() {
  console.log('='.repeat(60));
  console.log('分析4个站点的商品数据');
  console.log('='.repeat(60));

  // 获取每个站点的前50个商品
  const allProducts: Record<string, WooProduct[]> = {};

  for (const site of Object.keys(SITES) as (keyof typeof SITES)[]) {
    console.log(`\n正在获取 ${site} 站点数据...`);
    try {
      allProducts[site] = await fetchProducts(site, 1, 50);
      console.log(`  ✓ 获取到 ${allProducts[site].length} 个商品`);
    } catch (err) {
      console.error(`  ✗ 获取失败:`, err);
      allProducts[site] = [];
    }
  }

  // 以主站 (.com) 为基准分析
  const comProducts = allProducts.com || [];

  console.log('\n' + '='.repeat(60));
  console.log('ID 关联分析');
  console.log('='.repeat(60));

  let matchCount = 0;
  let mismatchCount = 0;

  for (const comProduct of comProducts.slice(0, 20)) {
    console.log(`\n商品 ID ${comProduct.id}: ${comProduct.name.substring(0, 50)}...`);
    console.log(`  SKU: ${comProduct.sku || '(无)'}`);
    console.log(`  主站: ${comProduct.id}`);

    for (const site of ['uk', 'de', 'fr'] as const) {
      const siteProducts = allProducts[site] || [];
      const match = siteProducts.find(p => p.id === comProduct.id);

      if (match) {
        const nameMatch = match.name === comProduct.name ? '✓' : '≈';
        console.log(`  ${site}: ${match.id} ${nameMatch} ${match.name.substring(0, 30)}...`);
        matchCount++;
      } else {
        console.log(`  ${site}: ✗ 未找到`);
        mismatchCount++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('统计结果');
  console.log('='.repeat(60));
  console.log(`匹配: ${matchCount}, 不匹配: ${mismatchCount}`);
  console.log(`匹配率: ${((matchCount / (matchCount + mismatchCount)) * 100).toFixed(1)}%`);

  // 输出第一个商品的完整结构
  if (comProducts.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('商品数据结构示例（第一个商品）');
    console.log('='.repeat(60));
    console.log(JSON.stringify(comProducts[0], null, 2));
  }

  // 分析 SKU 情况
  console.log('\n' + '='.repeat(60));
  console.log('SKU 分析');
  console.log('='.repeat(60));
  const withSku = comProducts.filter(p => p.sku && p.sku.trim() !== '');
  const withoutSku = comProducts.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`有 SKU: ${withSku.length}`);
  console.log(`无 SKU: ${withoutSku.length}`);

  if (withSku.length > 0) {
    console.log('\nSKU 示例:');
    withSku.slice(0, 5).forEach(p => {
      console.log(`  - ${p.sku}: ${p.name.substring(0, 40)}...`);
    });
  }
}

main().catch(console.error);
