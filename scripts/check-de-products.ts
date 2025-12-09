/**
 * 检查DE站点发布的商品SKU格式和variation情况
 * 运行: npx tsx scripts/check-de-products.ts
 */

const DE_SITE = {
  url: 'https://jerseysfever.de',
  key: 'ck_3f99da12ba804e5e19728453d38969909f876ffd',
  secret: 'cs_e43e59c8aeaa18b726d42d680cc201f4a34f1784',
};

interface WooProduct {
  id: number;
  name: string;
  sku: string;
  type: string; // 'simple' or 'variable'
  status: string;
  variations?: number[]; // variable products have variations
}

async function fetchProducts(page = 1, perPage = 100): Promise<WooProduct[]> {
  const { url, key, secret } = DE_SITE;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const response = await fetch(
    `${url}/wp-json/wc/v3/products?page=${page}&per_page=${perPage}&status=publish&orderby=id&order=asc`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  return response.json();
}

function isNewFormatSKU(sku: string): boolean {
  if (!sku) return false;
  // 新格式：包含下划线或包含多个连字符
  return sku.includes('_') || (sku.includes('-') && sku.split('-').length >= 4);
}

function isOldFormatSKU(sku: string): boolean {
  if (!sku) return false;
  // 旧格式：12位十六进制开头
  return /^[a-f0-9]{12}/.test(sku);
}

async function main() {
  console.log('='.repeat(60));
  console.log('检查DE站点发布的商品');
  console.log('='.repeat(60));

  // 获取所有发布的商品
  let allProducts: WooProduct[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      const products = await fetchProducts(page, perPage);
      if (products.length === 0) break;
      
      allProducts.push(...products);
      process.stdout.write(`\r已获取: ${allProducts.length} 个商品`);
      
      if (products.length < perPage) break;
      page++;
      await new Promise(r => setTimeout(r, 300)); // 避免速率限制
    } catch (error) {
      console.error(`\n获取第 ${page} 页失败:`, error);
      break;
    }
  }

  console.log(`\n\n总共获取 ${allProducts.length} 个发布的商品`);

  // 统计SKU格式
  const stats = {
    total: allProducts.length,
    withSku: 0,
    newFormat: 0,
    oldFormat: 0,
    otherFormat: 0,
    noSku: 0,
    variableProducts: 0,
    simpleProducts: 0,
    variableWithVariations: 0,
    variableWithoutVariations: 0,
  };

  const issues: Array<{
    id: number;
    name: string;
    sku: string;
    issue: string;
  }> = [];

  for (const product of allProducts) {
    // SKU统计
    if (!product.sku) {
      stats.noSku++;
      issues.push({
        id: product.id,
        name: product.name,
        sku: '',
        issue: '没有SKU',
      });
    } else {
      stats.withSku++;
      if (isNewFormatSKU(product.sku)) {
        stats.newFormat++;
      } else if (isOldFormatSKU(product.sku)) {
        stats.oldFormat++;
        issues.push({
          id: product.id,
          name: product.name,
          sku: product.sku,
          issue: '旧格式SKU',
        });
      } else {
        stats.otherFormat++;
        issues.push({
          id: product.id,
          name: product.name,
          sku: product.sku,
          issue: '其他格式SKU',
        });
      }
    }

    // Variation统计
    if (product.type === 'variable') {
      stats.variableProducts++;
      if (product.variations && product.variations.length > 0) {
        stats.variableWithVariations++;
      } else {
        stats.variableWithoutVariations++;
        issues.push({
          id: product.id,
          name: product.name,
          sku: product.sku || '',
          issue: 'Variable产品但没有variations',
        });
      }
    } else {
      stats.simpleProducts++;
    }
  }

  // 输出统计结果
  console.log('\n' + '='.repeat(60));
  console.log('SKU格式统计');
  console.log('='.repeat(60));
  console.log(`总商品数: ${stats.total}`);
  console.log(`有SKU: ${stats.withSku}`);
  console.log(`  新格式SKU: ${stats.newFormat} (${((stats.newFormat / stats.withSku) * 100).toFixed(1)}%)`);
  console.log(`  旧格式SKU: ${stats.oldFormat} (${((stats.oldFormat / stats.withSku) * 100).toFixed(1)}%)`);
  console.log(`  其他格式SKU: ${stats.otherFormat} (${((stats.otherFormat / stats.withSku) * 100).toFixed(1)}%)`);
  console.log(`无SKU: ${stats.noSku}`);

  console.log('\n' + '='.repeat(60));
  console.log('Variation统计');
  console.log('='.repeat(60));
  console.log(`Simple产品: ${stats.simpleProducts}`);
  console.log(`Variable产品: ${stats.variableProducts}`);
  console.log(`  有Variations: ${stats.variableWithVariations}`);
  console.log(`  无Variations: ${stats.variableWithoutVariations}`);

  // 输出问题商品
  if (issues.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log(`发现 ${issues.length} 个问题商品`);
    console.log('='.repeat(60));
    
    // 按问题类型分组
    const groupedIssues = issues.reduce((acc, issue) => {
      if (!acc[issue.issue]) {
        acc[issue.issue] = [];
      }
      acc[issue.issue].push(issue);
      return acc;
    }, {} as Record<string, typeof issues>);

    for (const [issueType, items] of Object.entries(groupedIssues)) {
      console.log(`\n${issueType} (${items.length}个):`);
      items.slice(0, 10).forEach(item => {
        console.log(`  - ID: ${item.id}, SKU: ${item.sku || '(无)'}, 名称: ${item.name.substring(0, 50)}...`);
      });
      if (items.length > 10) {
        console.log(`  ... 还有 ${items.length - 10} 个`);
      }
    }
  } else {
    console.log('\n✓ 所有商品都符合要求！');
  }

  // 输出一些示例商品
  console.log('\n' + '='.repeat(60));
  console.log('示例商品（前10个）');
  console.log('='.repeat(60));
  allProducts.slice(0, 10).forEach(product => {
    const skuFormat = !product.sku ? '无SKU' :
      isNewFormatSKU(product.sku) ? '新格式' :
      isOldFormatSKU(product.sku) ? '旧格式' : '其他格式';
    
    const variationInfo = product.type === 'variable' 
      ? `有 ${product.variations?.length || 0} 个variations`
      : 'Simple产品';
    
    console.log(`ID: ${product.id}, SKU: ${product.sku || '(无)'} [${skuFormat}], ${variationInfo}`);
    console.log(`  名称: ${product.name.substring(0, 60)}...`);
  });
}

main().catch(console.error);

