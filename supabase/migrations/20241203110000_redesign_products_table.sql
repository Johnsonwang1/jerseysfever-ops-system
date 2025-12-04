-- 删除旧表（如果存在）
DROP TABLE IF EXISTS products;

-- 重新设计 products 表
-- 以主站商品ID为主键，关联4个站点
CREATE TABLE products (
  -- 主键：使用主站(.com)的 WooCommerce 商品 ID
  woo_id INTEGER PRIMARY KEY,

  -- SKU（统一标识，后续自动生成）
  sku TEXT UNIQUE,

  -- === 基础信息（从主站获取）===
  name TEXT NOT NULL,
  slug TEXT,
  status TEXT DEFAULT 'publish',
  price DECIMAL(10, 2),
  regular_price DECIMAL(10, 2),

  -- 库存
  stock_status TEXT DEFAULT 'instock',
  stock_quantity INTEGER DEFAULT 100,

  -- 图片（存储主站图片URL数组）
  images JSONB DEFAULT '[]'::jsonb,

  -- 分类（存储分类名称数组）
  categories JSONB DEFAULT '[]'::jsonb,

  -- === 商品属性 ===
  attributes JSONB DEFAULT '{}'::jsonb,
  -- 结构: { team, season, type, version, gender, sleeve, events[] }

  -- === 多语言内容（各站点的名称和描述）===
  content JSONB DEFAULT '{}'::jsonb,
  -- 结构: {
  --   com: { name, description, short_description },
  --   uk: { name, description, short_description },
  --   de: { name, description, short_description },
  --   fr: { name, description, short_description }
  -- }

  -- === 各站点同步状态 ===
  sync_status JSONB DEFAULT '{"com": "synced", "uk": "synced", "de": "synced", "fr": "synced"}'::jsonb,
  -- 可选值: synced, pending, error, not_exists

  -- === 时间戳 ===
  date_created TIMESTAMPTZ,
  date_modified TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_synced_at ON products(synced_at DESC);

-- 启用 RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读写
CREATE POLICY "Allow all access to products" ON products FOR ALL USING (true);

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE products;

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
