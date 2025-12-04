-- 添加各站点独立价格字段
-- 结构: { com: "29.99", uk: "24.99", de: "27.99", fr: "27.99" }

ALTER TABLE products ADD COLUMN IF NOT EXISTS prices JSONB DEFAULT '{}'::jsonb;

-- 为现有数据初始化 prices 字段（使用现有的 price 作为所有站点的默认价格）
UPDATE products 
SET prices = jsonb_build_object(
  'com', COALESCE(price::text, '0'),
  'uk', COALESCE(price::text, '0'),
  'de', COALESCE(price::text, '0'),
  'fr', COALESCE(price::text, '0')
)
WHERE prices = '{}'::jsonb OR prices IS NULL;

-- 创建索引以支持按站点价格查询
CREATE INDEX IF NOT EXISTS idx_products_prices ON products USING gin(prices);

COMMENT ON COLUMN products.prices IS '各站点独立价格，格式: { com: "29.99", uk: "24.99", de: "27.99", fr: "27.99" }';

