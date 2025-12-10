-- 添加 video_url 字段到 products 表
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 添加注释
COMMENT ON COLUMN products.video_url IS '商品视频URL，用于商品详情页展示';
