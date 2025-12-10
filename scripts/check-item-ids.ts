import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// 获取目录路径 (ESM兼容)
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

// 读取.env文件
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {
    console.warn('无法读取.env文件:', e);
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://iwzohjbvuhwvfidyevpf.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseKey) {
  console.error('请设置 SUPABASE_ANON_KEY 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface CSVRow {
  item_id: string;
  product_id: string;
  item_name: string;
}

interface MatchResult {
  item_id: string;
  item_name: string;
  found_as: 'main_product' | 'variation' | 'not_found';
  site?: string;
  sku?: string;
  product_name?: string;
}

async function checkItemIds() {
  // 读取CSV文件
  const csvPath = path.join(__dirname, '../bquxjob_2eb42c55_19b065b14f5.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  // 手动解析CSV
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const records: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // 简单CSV解析（不处理引号内的逗号）
    const values = line.split(',');
    if (values.length >= 3) {
      records.push({
        item_id: values[0]?.trim() || '',
        product_id: values[1]?.trim() || '',
        item_name: values.slice(2).join(',').trim() || '',
      });
    }
  }

  console.log(`读取到 ${records.length} 条记录`);

  const itemIds = records.map(r => parseInt(r.item_id.trim())).filter(id => !isNaN(id));
  
  console.log(`提取到 ${itemIds.length} 个有效的 item_id`);

  // 批量查询：使用SQL查找主商品ID和变体ID
  console.log('\n正在查询数据库...');
  
  // 构建item_id列表用于SQL查询
  const itemIdsList = itemIds.join(',');
  
  // 查询主商品ID
  const mainProductQuery = `
    SELECT 
      ${itemIdsList.split(',').map(id => `
        CASE 
          WHEN (woo_ids->>'com')::int = ${id} THEN 'com'
          WHEN (woo_ids->>'uk')::int = ${id} THEN 'uk'
          WHEN (woo_ids->>'de')::int = ${id} THEN 'de'
          WHEN (woo_ids->>'fr')::int = ${id} THEN 'fr'
          ELSE NULL
        END as site_${id},
        sku as sku_${id},
        name as name_${id}
      `).join(',')}
    FROM products
    WHERE 
      ${itemIds.map(id => `
        (woo_ids->>'com')::int = ${id} OR
        (woo_ids->>'uk')::int = ${id} OR
        (woo_ids->>'de')::int = ${id} OR
        (woo_ids->>'fr')::int = ${id}
      `).join(' OR ')}
  `;

  // 改用更简单的方法：逐个查询
  const results: MatchResult[] = [];
  const processedIds = new Set<string>();

  // 先获取所有产品数据
  console.log('获取所有产品数据...');
  const { data: allProducts, error: fetchError } = await supabase
    .from('products')
    .select('sku, name, woo_ids, variations');

  if (fetchError) {
    console.error('获取产品数据失败:', fetchError);
    process.exit(1);
  }

  console.log(`获取到 ${allProducts?.length || 0} 个产品`);

  // 查询主商品ID
  console.log('\n查询主商品ID...');
  for (const itemId of itemIds) {
    if (processedIds.has(String(itemId))) continue;

    for (const product of allProducts || []) {
      const sites = ['com', 'uk', 'de', 'fr'] as const;
      for (const site of sites) {
        const wooId = product.woo_ids?.[site];
        // 处理数字和字符串类型
        if (wooId && (wooId === itemId || wooId === String(itemId) || parseInt(String(wooId)) === itemId)) {
          const csvRow = records.find(r => parseInt(r.item_id.trim()) === itemId);
          results.push({
            item_id: String(itemId),
            item_name: csvRow?.item_name || '',
            found_as: 'main_product',
            site,
            sku: product.sku,
            product_name: product.name,
          });
          processedIds.add(String(itemId));
          if (processedIds.size % 100 === 0) {
            console.log(`已处理 ${processedIds.size}/${itemIds.length} 个item_id...`);
          }
          break; // 找到一个匹配就跳出site循环
        }
      }
      if (processedIds.has(String(itemId))) break; // 找到匹配就跳出product循环
    }
  }

  // 查询变体ID
  console.log('\n查询变体ID...');
  for (const itemId of itemIds) {
    if (processedIds.has(String(itemId))) continue;

    for (const product of allProducts || []) {
      const sites = ['com', 'uk', 'de', 'fr'] as const;
      for (const site of sites) {
        const variations = product.variations?.[site] || [];
        if (Array.isArray(variations)) {
          const variation = variations.find((v: any) => {
            if (!v || !v.id) return false;
            const vId = typeof v.id === 'number' ? v.id : parseInt(String(v.id));
            return vId === itemId;
          });
          
          if (variation) {
            const csvRow = records.find(r => parseInt(r.item_id.trim()) === itemId);
            results.push({
              item_id: String(itemId),
              item_name: csvRow?.item_name || '',
              found_as: 'variation',
              site,
              sku: product.sku,
              product_name: product.name,
            });
            processedIds.add(String(itemId));
            if (processedIds.size % 100 === 0) {
              console.log(`已处理 ${processedIds.size}/${itemIds.length} 个item_id...`);
            }
            break;
          }
        }
      }
      if (processedIds.has(String(itemId))) break;
    }
  }

  // 标记未找到的item_id
  for (const record of records) {
    const itemId = record.item_id.trim();
    if (!processedIds.has(itemId)) {
      results.push({
        item_id: itemId,
        item_name: record.item_name || '',
        found_as: 'not_found',
      });
    }
  }

  // 统计结果
  const mainProductCount = results.filter(r => r.found_as === 'main_product').length;
  const variationCount = results.filter(r => r.found_as === 'variation').length;
  const notFoundCount = results.filter(r => r.found_as === 'not_found').length;

  console.log('\n=== 查询结果统计 ===');
  console.log(`主商品ID: ${mainProductCount}`);
  console.log(`变体ID: ${variationCount}`);
  console.log(`未找到: ${notFoundCount}`);
  console.log(`总计: ${results.length}`);

  // 保存结果到CSV
  const outputPath = path.join(__dirname, '../item-id-check-results.csv');
  const csvHeaders = 'item_id,item_name,found_as,site,sku,product_name\n';
  const csvRows = results.map(r => 
    `${r.item_id},"${r.item_name.replace(/"/g, '""')}","${r.found_as}","${r.site || ''}","${r.sku || ''}","${(r.product_name || '').replace(/"/g, '""')}"`
  ).join('\n');
  fs.writeFileSync(outputPath, csvHeaders + csvRows, 'utf-8');
  console.log(`\n结果已保存到: ${outputPath}`);

  // 显示一些示例
  console.log('\n=== 示例结果 ===');
  console.log('\n主商品ID示例:');
  results.filter(r => r.found_as === 'main_product').slice(0, 5).forEach(r => {
    console.log(`  ${r.item_id} -> ${r.sku} (${r.site})`);
  });

  console.log('\n变体ID示例:');
  results.filter(r => r.found_as === 'variation').slice(0, 5).forEach(r => {
    console.log(`  ${r.item_id} -> ${r.sku} (${r.site})`);
  });

  console.log('\n未找到的示例（前10个）:');
  results.filter(r => r.found_as === 'not_found').slice(0, 10).forEach(r => {
    console.log(`  ${r.item_id}`);
  });
}

checkItemIds().catch(console.error);

