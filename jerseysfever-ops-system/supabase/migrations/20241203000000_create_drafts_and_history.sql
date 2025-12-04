-- 草稿表
CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 发布历史表
CREATE TABLE IF NOT EXISTS publish_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  product_image TEXT,
  sites JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 策略
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_history ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读写
CREATE POLICY "Allow all access to drafts" ON drafts FOR ALL USING (true);
CREATE POLICY "Allow all access to publish_history" ON publish_history FOR ALL USING (true);
