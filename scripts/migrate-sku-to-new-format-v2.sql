-- ============================================
-- SKU格式统一迁移脚本（简化版）
-- 目标：将所有订单和商品表中的SKU统一为新格式
-- ============================================

-- 第一步：更新订单表中第一个商品项的SKU（大部分订单只有一个商品项）
UPDATE orders o
SET line_items = jsonb_set(
  line_items,
  '{0,sku}',
  to_jsonb(p.sku::text)
)
FROM products p
WHERE o.line_items->0->>'sku' IS NOT NULL
  AND o.line_items->0->>'sku' != ''
  AND (
    -- 旧格式：12位十六进制开头
    o.line_items->0->>'sku' ~ '^[a-f0-9]{12}' OR
    -- 旧格式：包含下划线但不是新格式
    (o.line_items->0->>'sku' LIKE '%_%' AND o.line_items->0->>'sku' !~ '^[A-Z]{1,3}-[0-9]{4}-[A-Z]{3}-')
  )
  -- 匹配新格式的SKU
  AND p.sku LIKE '%-%-%-%'
  AND p.sku !~ '^[a-f0-9]{12}'
  -- 通过站点和产品ID匹配
  AND (
    (o.site = 'de' AND p.woo_ids->>'de' = o.line_items->0->>'product_id') OR
    (o.site = 'com' AND p.woo_ids->>'com' = o.line_items->0->>'product_id') OR
    (o.site = 'uk' AND p.woo_ids->>'uk' = o.line_items->0->>'product_id') OR
    (o.site = 'fr' AND p.woo_ids->>'fr' = o.line_items->0->>'product_id')
  )
  -- 确保SKU确实不同
  AND o.line_items->0->>'sku' != p.sku;

-- 第二步：更新订单表中第二个商品项的SKU（如果有）
UPDATE orders o
SET line_items = jsonb_set(
  line_items,
  '{1,sku}',
  to_jsonb(p.sku::text)
)
FROM products p
WHERE jsonb_array_length(o.line_items) > 1
  AND o.line_items->1->>'sku' IS NOT NULL
  AND o.line_items->1->>'sku' != ''
  AND (
    o.line_items->1->>'sku' ~ '^[a-f0-9]{12}' OR
    (o.line_items->1->>'sku' LIKE '%_%' AND o.line_items->1->>'sku' !~ '^[A-Z]{1,3}-[0-9]{4}-[A-Z]{3}-')
  )
  AND p.sku LIKE '%-%-%-%'
  AND p.sku !~ '^[a-f0-9]{12}'
  AND (
    (o.site = 'de' AND p.woo_ids->>'de' = o.line_items->1->>'product_id') OR
    (o.site = 'com' AND p.woo_ids->>'com' = o.line_items->1->>'product_id') OR
    (o.site = 'uk' AND p.woo_ids->>'uk' = o.line_items->1->>'product_id') OR
    (o.site = 'fr' AND p.woo_ids->>'fr' = o.line_items->1->>'product_id')
  )
  AND o.line_items->1->>'sku' != p.sku;

-- 第三步：更新订单表中第三个商品项的SKU（如果有）
UPDATE orders o
SET line_items = jsonb_set(
  line_items,
  '{2,sku}',
  to_jsonb(p.sku::text)
)
FROM products p
WHERE jsonb_array_length(o.line_items) > 2
  AND o.line_items->2->>'sku' IS NOT NULL
  AND o.line_items->2->>'sku' != ''
  AND (
    o.line_items->2->>'sku' ~ '^[a-f0-9]{12}' OR
    (o.line_items->2->>'sku' LIKE '%_%' AND o.line_items->2->>'sku' !~ '^[A-Z]{1,3}-[0-9]{4}-[A-Z]{3}-')
  )
  AND p.sku LIKE '%-%-%-%'
  AND p.sku !~ '^[a-f0-9]{12}'
  AND (
    (o.site = 'de' AND p.woo_ids->>'de' = o.line_items->2->>'product_id') OR
    (o.site = 'com' AND p.woo_ids->>'com' = o.line_items->2->>'product_id') OR
    (o.site = 'uk' AND p.woo_ids->>'uk' = o.line_items->2->>'product_id') OR
    (o.site = 'fr' AND p.woo_ids->>'fr' = o.line_items->2->>'product_id')
  )
  AND o.line_items->2->>'sku' != p.sku;

-- 第四步：删除商品表中重复的旧SKU记录
-- 保留新格式的SKU，删除旧格式的SKU（如果同一产品有多个SKU）

DELETE FROM products p1
WHERE (
  -- 旧格式SKU
  p1.sku ~ '^[a-f0-9]{12}' OR
  (p1.sku LIKE '%_%' AND p1.sku !~ '^[A-Z]{1,3}-[0-9]{4}-[A-Z]{3}-')
)
AND EXISTS (
  -- 存在同一产品的新格式SKU
  SELECT 1 FROM products p2
  WHERE (
    -- 通过任意站点的WooCommerce ID匹配
    (p1.woo_ids->>'de' IS NOT NULL AND p1.woo_ids->>'de' = p2.woo_ids->>'de') OR
    (p1.woo_ids->>'com' IS NOT NULL AND p1.woo_ids->>'com' = p2.woo_ids->>'com') OR
    (p1.woo_ids->>'uk' IS NOT NULL AND p1.woo_ids->>'uk' = p2.woo_ids->>'uk') OR
    (p1.woo_ids->>'fr' IS NOT NULL AND p1.woo_ids->>'fr' = p2.woo_ids->>'fr')
  )
  AND p2.sku LIKE '%-%-%-%'  -- 新格式
  AND p2.sku !~ '^[a-f0-9]{12}'  -- 不是旧格式
  AND p1.sku != p2.sku  -- SKU不同
);

