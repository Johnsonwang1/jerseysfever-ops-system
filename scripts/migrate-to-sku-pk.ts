/**
 * 数据迁移脚本：将旧表数据迁移到新的 SKU 为主键的表结构
 *
 * 步骤：
 * 1. 先在 Supabase Dashboard 执行 migration SQL 创建新表
 * 2. 运行此脚本将现有数据迁移到新表
 *
 * 运行: npx tsx scripts/migrate-to-sku-pk.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iwzohjbvuhwvfidyevnpf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NjQ4OTAsImV4cCI6MjA4MDI0MDg5MH0.82F_hoRBAWLUAUzv-7-rM0-EhoaUNb4G5jhxbcH-MIo';

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
  console.log('数据迁移：旧表 -> 新表（SKU 为主键）');
  console.log('='.repeat(60));

  // 1. 检查是否有旧数据（通过 woo_id 列存在来判断）
  console.log('\n[1/4] 检查旧表结构...');

  const { data: oldProducts, error: fetchError } = await supabase
    .from('products')
    .select('*')
    .limit(1);

  if (fetchError) {
    console.error('读取数据失败:', fetchError.message);
    return;
  }

  if (!oldProducts || oldProducts.length === 0) {
    console.log('表中没有数据，无需迁移');
    return;
  }

  const sample = oldProducts[0];

  // 检查是旧表还是新表
  if ('woo_ids' in sample && !('woo_id' in sample)) {
    console.log('✓ 已经是新表结构（SKU 为主键），无需迁移');
    return;
  }

  if (!('woo_id' in sample)) {
    console.log('表结构异常，请检查');
    return;
  }

  console.log('检测到旧表结构（woo_id 为主键），开始迁移...');

  // 2. 获取所有旧数据
  console.log('\n[2/4] 读取所有旧数据...');

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
    allOldProducts.push(...(data as OldProduct[]));

    if (data.length < pageSize) break;
    page++;
  }

  console.log(`读取到 ${allOldProducts.length} 条记录`);

  // 3. 转换数据格式
  console.log('\n[3/4] 转换数据格式...');

  const newProducts: NewProduct[] = allOldProducts.map(old => {
    // 由于4个站点商品ID相同，woo_ids 全部设为相同的 woo_id
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

  // 4. 备份并写入新数据
  console.log('\n[4/4] 写入新格式数据...');

  // 由于是相同的表名，需要：
  // 1. 先备份到临时表
  // 2. 删除旧表
  // 3. 创建新表（执行 migration）
  // 4. 插入新数据

  console.log('\n注意：需要先在 Supabase Dashboard 执行以下步骤：');
  console.log('1. 打开 Supabase Dashboard -> SQL Editor');
  console.log('2. 执行 supabase/migrations/20241203120000_sku_as_primary_key.sql');
  console.log('3. 再运行此脚本的插入部分');
  console.log('\n或者，这里直接尝试插入（如果新表已创建）...\n');

  // 尝试批量插入
  const batchSize = 100;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < newProducts.length; i += batchSize) {
    const batch = newProducts.slice(i, i + batchSize);

    const { error: insertError } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'sku' });

    if (insertError) {
      console.error(`批次 ${Math.floor(i / batchSize) + 1} 插入失败:`, insertError.message);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
      process.stdout.write(`\r已处理: ${successCount}/${newProducts.length}`);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('迁移完成!');
  console.log('='.repeat(60));
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${errorCount}`);
}

main().catch(console.error);
