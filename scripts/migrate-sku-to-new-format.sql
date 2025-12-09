-- ============================================
-- SKU格式统一迁移脚本
-- 目标：将所有订单和商品表中的SKU统一为新格式
-- ============================================

-- 第一步：更新订单表中的SKU
-- 将订单中旧格式的SKU更新为新格式（通过WooCommerce产品ID匹配）
-- 注意：订单的line_items是数组，需要更新所有商品项的SKU

-- 使用CTE和jsonb_array_elements来更新所有商品项
WITH updated_orders AS (
  SELECT 
    o.id,
    o.site,
    jsonb_agg(
      CASE 
        WHEN (
          -- 检查是否是旧格式SKU
          (item->>'sku' ~ '^[a-f0-9]{12}' OR 
           (item->>'sku' LIKE '%_%' AND item->>'sku' !~ '^[A-Z]{1,3}-[0-9]{4}-[A-Z]{3}-'))
          AND EXISTS (
            -- 查找对应的新格式SKU
            SELECT 1 FROM products p
            WHERE (
              (o.site = 'de' AND p.woo_ids->>'de' = item->>'product_id') OR
              (o.site = 'com' AND p.woo_ids->>'com' = item->>'product_id') OR
              (o.site = 'uk' AND p.woo_ids->>'uk' = item->>'product_id') OR
              (o.site = 'fr' AND p.woo_ids->>'fr' = item->>'product_id')
            )
            AND p.sku LIKE '%-%-%-%'
            AND p.sku !~ '^[a-f0-9]{12}'
            AND item->>'sku' != p.sku
          )
        ) THEN
          -- 更新为新格式SKU
          jsonb_set(
            item,
            '{sku}',
            to_jsonb((
              SELECT p.sku FROM products p
              WHERE (
                (o.site = 'de' AND p.woo_ids->>'de' = item->>'product_id') OR
                (o.site = 'com' AND p.woo_ids->>'com' = item->>'product_id') OR
                (o.site = 'uk' AND p.woo_ids->>'uk' = item->>'product_id') OR
                (o.site = 'fr' AND p.woo_ids->>'fr' = item->>'product_id')
              )
              AND p.sku LIKE '%-%-%-%'
              AND p.sku !~ '^[a-f0-9]{12}'
              LIMIT 1
            )::text)
          )
        ELSE
          -- 保持原样
          item
      END
      ORDER BY (item->>'id')::int
    ) as new_line_items
  FROM orders o,
  jsonb_array_elements(o.line_items) as item
  WHERE o.line_items IS NOT NULL
    AND jsonb_array_length(o.line_items) > 0
  GROUP BY o.id, o.site
  HAVING bool_or(
    -- 至少有一个商品项需要更新
    (item->>'sku' ~ '^[a-f0-9]{12}' OR 
     (item->>'sku' LIKE '%_%' AND item->>'sku' !~ '^[A-Z]{1,3}-[0-9]{4}-[A-Z]{3}-'))
    AND EXISTS (
      SELECT 1 FROM products p
      WHERE (
        (o.site = 'de' AND p.woo_ids->>'de' = item->>'product_id') OR
        (o.site = 'com' AND p.woo_ids->>'com' = item->>'product_id') OR
        (o.site = 'uk' AND p.woo_ids->>'uk' = item->>'product_id') OR
        (o.site = 'fr' AND p.woo_ids->>'fr' = item->>'product_id')
      )
      AND p.sku LIKE '%-%-%-%'
      AND p.sku !~ '^[a-f0-9]{12}'
      AND item->>'sku' != p.sku
    )
  )
)
UPDATE orders o
SET line_items = uo.new_line_items
FROM updated_orders uo
WHERE o.id = uo.id;

-- 第二步：删除商品表中重复的旧SKU记录
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

