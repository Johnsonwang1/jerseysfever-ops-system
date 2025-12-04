/**
 * 执行数据库迁移：将 products 表从 woo_id 主键改为 SKU 主键
 *
 * 步骤：
 * 1. 备份现有数据
 * 2. 删除旧表
 * 3. 创建新表
 * 4. 恢复数据（转换格式）
 *
 * 运行: npx tsx scripts/execute-migration.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iwzohjbvuhwvfidyevpf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NjQ4OTAsImV4cCI6MjA4MDI0MDg5MH0.82F_hoRBAWLUAUzv-7-rM0-EhoaUNb4G5jhxbcH-MIo';

// Service Role Key 用于执行 DDL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface OldProduct {
  woo_id: number;
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
  content: Record<string, unknown>;
  sync_status: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface NewProduct {
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
}

async function main() {
  console.log('='.repeat(60));
  console.log('执行数据库迁移：woo_id 主键 -> SKU 主键');
  console.log('='.repeat(60));

  // 1. 读取现有数据
  console.log('\n[1/4] 备份现有数据...');

  let allOldProducts: OldProduct[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('读取失败:', error.message);
      return;
    }

    if (!data || data.length === 0) break;

    // 检查是否是旧表结构
    if (page === 0 && data[0]) {
      if ('woo_ids' in data[0] && !('woo_id' in data[0])) {
        console.log('✓ 已经是新表结构，无需迁移');
        return;
      }
    }

    allOldProducts.push(...(data as OldProduct[]));
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`备份了 ${allOldProducts.length} 条记录`);

  if (allOldProducts.length === 0) {
    console.log('表中没有数据');
  }

  // 2. 转换数据格式
  console.log('\n[2/4] 转换数据格式...');

  const newProducts: NewProduct[] = allOldProducts.map(old => {
    const wooIds: Record<string, number> = {
      com: old.woo_id,
      uk: old.woo_id,
      de: old.woo_id,
      fr: old.woo_id,
    };

    return {
      sku: old.sku,
      name: old.name,
      slug: old.slug,
      status: old.status,
      price: old.price,
      regular_price: old.regular_price,
      stock_status: old.stock_status,
      stock_quantity: old.stock_quantity,
      images: old.images,
      categories: old.categories,
      attributes: old.attributes,
      woo_ids: wooIds,
      content: old.content,
      sync_status: old.sync_status,
    };
  });

  console.log(`转换了 ${newProducts.length} 条记录`);

  // 3. 通过 Supabase Management API 执行 DDL
  console.log('\n[3/4] 重建表结构...');
  console.log('通过 Supabase Management API 执行 SQL...');

  const projectRef = 'iwzohjbvuhwvfidyevpf';
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN || 'sbp_1588bdbbe8585189d6ec9823c733b75944d9c966';

  const migrationSQL = `
-- 删除旧表
DROP TABLE IF EXISTS products;

-- 创建新表（SKU 为主键）
CREATE TABLE products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  status TEXT DEFAULT 'publish',
  price DECIMAL(10, 2),
  regular_price DECIMAL(10, 2),
  stock_status TEXT DEFAULT 'instock',
  stock_quantity INTEGER DEFAULT 100,
  images JSONB DEFAULT '[]'::jsonb,
  categories JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '{}'::jsonb,
  woo_ids JSONB DEFAULT '{}'::jsonb,
  content JSONB DEFAULT '{}'::jsonb,
  sync_status JSONB DEFAULT '{"com": "pending", "uk": "pending", "de": "pending", "fr": "pending"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

-- 索引
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_created_at ON products(created_at DESC);
CREATE INDEX idx_products_woo_id_com ON products((woo_ids->>'com'));
CREATE INDEX idx_products_woo_id_uk ON products((woo_ids->>'uk'));
CREATE INDEX idx_products_woo_id_de ON products((woo_ids->>'de'));
CREATE INDEX idx_products_woo_id_fr ON products((woo_ids->>'fr'));

-- 启用 RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读写
CREATE POLICY "Allow all access to products" ON products FOR ALL USING (true);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_products_updated_at ON products;
CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();
`;

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: migrationSQL }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Migration API 调用失败:', response.status, errorText);
      return;
    }

    const result = await response.json();
    console.log('✓ 表结构重建成功');
    console.log('API 响应:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Migration 执行失败:', err);
    return;
  }

  // 4. 插入转换后的数据
  console.log('\n[4/4] 恢复数据...');

  if (newProducts.length === 0) {
    console.log('没有数据需要恢复');
  } else {
    const batchSize = 100;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < newProducts.length; i += batchSize) {
      const batch = newProducts.slice(i, i + batchSize);

      const { error: insertError } = await supabase
        .from('products')
        .insert(batch);

      if (insertError) {
        console.error(`批次 ${Math.floor(i / batchSize) + 1} 插入失败:`, insertError.message);
        errorCount += batch.length;
      } else {
        successCount += batch.length;
        process.stdout.write(`\r已恢复: ${successCount}/${newProducts.length}`);
      }

      // 暂停避免速率限制
      await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n');
  }

  // 5. 验证
  console.log('\n[验证] 检查新表...');
  const { data: checkData, count } = await supabase
    .from('products')
    .select('sku, woo_ids', { count: 'exact' })
    .limit(3);

  console.log(`新表记录数: ${count}`);
  if (checkData && checkData.length > 0) {
    console.log('示例数据:');
    checkData.forEach(p => {
      console.log(`  SKU: ${p.sku}, woo_ids:`, p.woo_ids);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('迁移完成!');
  console.log('='.repeat(60));
}

main().catch(console.error);
