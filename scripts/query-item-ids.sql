-- 查询CSV中所有item_id对应的product_id和variation_id
-- item_id是订单项ID（line_item ID），不是商品ID或变体ID
-- 通过orders表的line_items可以找到对应的product_id和variation_id

-- 注意：由于item_id数量很多（1817个），这个查询可能需要一些时间
-- 建议分批执行，或直接在应用中处理

-- 1. 从orders表的line_items中提取所有item_id对应的product_id和variation_id
WITH order_items AS (
  SELECT DISTINCT
    (li->>'id')::text AS item_id,
    li->>'name' as item_name,
    li->>'product_id' as product_id,
    li->>'variation_id' as variation_id,
    o.site,
    o.order_number
  FROM orders o,
    jsonb_array_elements(o.line_items) li
),
-- 2. 匹配products表，找到对应的SKU
matched_products AS (
  SELECT 
    oi.item_id,
    oi.item_name,
    oi.product_id,
    oi.variation_id,
    oi.site,
    oi.order_number,
    CASE 
      WHEN p.sku IS NOT NULL THEN 'found'
      ELSE 'not_found'
    END as match_status,
    p.sku,
    p.name as product_name
  FROM order_items oi
  LEFT JOIN products p ON (
    -- 通过product_id匹配（主商品ID）
    (p.woo_ids->>oi.site)::text = oi.product_id
    OR
    -- 通过variation_id匹配（变体ID）
    EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(COALESCE(p.variations->(oi.site), '[]'::jsonb)) v 
      WHERE (v->>'id')::text = oi.variation_id
    )
  )
)
SELECT * FROM matched_products
ORDER BY item_id;

