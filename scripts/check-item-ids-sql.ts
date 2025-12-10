import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// 获取目录路径
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

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
  const records: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = line.split(',');
    if (values.length >= 1 && values[0].trim()) {
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

  // 使用MCP工具查询数据库
  // 由于无法直接调用MCP工具，我们创建一个SQL文件，然后提示用户使用MCP工具执行
  
  // 构建SQL查询
  const itemIdsList = itemIds.map(id => id.toString()).join(',');
  
  // 生成SQL查询文件
  const sqlContent = `
-- 查询CSV中的item_id是否为主商品ID或变体ID
-- 生成时间: ${new Date().toISOString()}

-- 1. 查询主商品ID匹配
WITH item_ids AS (
  SELECT unnest(ARRAY[${itemIdsList}])::int AS item_id
),
matched_main AS (
  SELECT 
    i.item_id,
    p.sku,
    p.name as product_name,
    CASE 
      WHEN (p.woo_ids->>'com')::int = i.item_id THEN 'com'
      WHEN (p.woo_ids->>'uk')::int = i.item_id THEN 'uk'
      WHEN (p.woo_ids->>'de')::int = i.item_id THEN 'de'
      WHEN (p.woo_ids->>'fr')::int = i.item_id THEN 'fr'
      ELSE NULL
    END as site,
    'main_product' as found_as
  FROM item_ids i
  JOIN products p ON 
    (p.woo_ids->>'com')::int = i.item_id OR
    (p.woo_ids->>'uk')::int = i.item_id OR
    (p.woo_ids->>'de')::int = i.item_id OR
    (p.woo_ids->>'fr')::int = i.item_id
),
matched_variations AS (
  SELECT DISTINCT
    i.item_id,
    p.sku,
    p.name as product_name,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.variations->'com') v 
        WHERE (v->>'id')::int = i.item_id
      ) THEN 'com'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.variations->'uk') v 
        WHERE (v->>'id')::int = i.item_id
      ) THEN 'uk'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.variations->'de') v 
        WHERE (v->>'id')::int = i.item_id
      ) THEN 'de'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.variations->'fr') v 
        WHERE (v->>'id')::int = i.item_id
      ) THEN 'fr'
      ELSE NULL
    END as site,
    'variation' as found_as
  FROM item_ids i
  CROSS JOIN products p
  WHERE 
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.variations->'com') v 
      WHERE (v->>'id')::int = i.item_id
    ) OR
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.variations->'uk') v 
      WHERE (v->>'id')::int = i.item_id
    ) OR
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.variations->'de') v 
      WHERE (v->>'id')::int = i.item_id
    ) OR
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.variations->'fr') v 
      WHERE (v->>'id')::int = i.item_id
    )
)
SELECT 
  m.item_id::text as item_id,
  COALESCE(m.sku, v.sku) as sku,
  COALESCE(m.product_name, v.product_name) as product_name,
  COALESCE(m.site, v.site) as site,
  COALESCE(m.found_as, v.found_as, 'not_found') as found_as
FROM item_ids i
LEFT JOIN matched_main m ON i.item_id = m.item_id
LEFT JOIN matched_variations v ON i.item_id = v.item_id
ORDER BY i.item_id;
`;

  const sqlPath = path.join(__dirname, '../check-item-ids-query.sql');
  fs.writeFileSync(sqlPath, sqlContent, 'utf-8');
  console.log(`\n已生成SQL查询文件: ${sqlPath}`);
  console.log('\n请使用MCP工具执行此SQL查询，或使用以下命令:');
  console.log(`npx supabase db execute --project-ref iwzohjbvuhwvfidyevpf -f ${sqlPath}`);
  
  // 或者直接使用简化的查询方法
  console.log('\n开始使用简化查询方法...');
  
  // 由于item_ids太多，分批处理
  const BATCH_SIZE = 100;
  const results: MatchResult[] = [];
  
  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    const batch = itemIds.slice(i, i + BATCH_SIZE);
    console.log(`处理批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(itemIds.length / BATCH_SIZE)} (${batch.length} 个item_id)...`);
    
    // 这里需要实际执行SQL查询，但我们现在只是生成SQL文件
    // 实际执行需要使用MCP工具
  }
  
  console.log('\n请使用生成的SQL文件在Supabase中执行查询。');
}

checkItemIds().catch(console.error);

