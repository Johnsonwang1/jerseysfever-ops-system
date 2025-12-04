-- 商品主数据表（PIM 核心表）
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SKU 作为跨站点唯一标识
  sku TEXT UNIQUE NOT NULL,

  -- 基础信息
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  price DECIMAL(10, 2),

  -- 图片（存储 Supabase Storage URL）
  images JSONB DEFAULT '[]'::jsonb,

  -- 分类（存储分类名称数组）
  categories JSONB DEFAULT '[]'::jsonb,

  -- 属性
  attributes JSONB DEFAULT '{}'::jsonb,
  -- attributes 结构: { season, type, version, gender, sleeve, events[] }

  -- 各站点的 WooCommerce 商品 ID
  woo_ids JSONB DEFAULT '{}'::jsonb,
  -- woo_ids 结构: { com: 123, uk: 456, de: 789, fr: 101 }

  -- 各站点的多语言内容
  localized_content JSONB DEFAULT '{}'::jsonb,
  -- localized_content 结构: { com: {name, description}, de: {name, description}, ... }

  -- 同步状态
  sync_status JSONB DEFAULT '{}'::jsonb,
  -- sync_status 结构: { com: 'synced', uk: 'pending', de: 'error', fr: 'synced' }

  -- 库存状态
  stock_status TEXT DEFAULT 'instock',
  stock_quantity INTEGER DEFAULT 100,

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin(to_tsvector('english', name));

-- 启用 RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读写（当前无登录系统）
CREATE POLICY "Allow all access to products" ON products FOR ALL USING (true);

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE products;

-- 自动更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
