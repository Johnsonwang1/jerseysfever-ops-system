-- Trending 系统定时任务配置
-- 使用 pg_cron 和 pg_net 扩展实现定时调用 Edge Functions

-- 注意：pg_cron 需要在 Supabase Dashboard 中启用
-- Settings > Database > Extensions > pg_cron

-- ============================================
-- 1. 启用必要的扩展（如果尚未启用）
-- ============================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- 2. 定时任务配置
-- ============================================

-- 注意：以下任务需要在 Supabase Dashboard 或使用 SQL Editor 手动执行
-- 因为 pg_cron 需要特殊权限

/*
-- 每6小时同步足球比赛数据
SELECT cron.schedule(
  'sync-football-matches',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/football-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{"action": "sync"}'::jsonb
  ) AS request_id;
  $$
);

-- 每天早上8点同步 Google Trends 数据
SELECT cron.schedule(
  'sync-trends-data',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/trends-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{"action": "sync"}'::jsonb
  ) AS request_id;
  $$
);

-- 每天早上9点生成 AI 推荐
SELECT cron.schedule(
  'generate-ai-recommendations',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/ai-trending-recommend',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{"action": "generate"}'::jsonb
  ) AS request_id;
  $$
);

-- 查看已配置的定时任务
SELECT * FROM cron.job;

-- 删除定时任务（如需）
-- SELECT cron.unschedule('sync-football-matches');
-- SELECT cron.unschedule('sync-trends-data');
-- SELECT cron.unschedule('generate-ai-recommendations');
*/

-- ============================================
-- 3. 创建同步日志表
-- ============================================
CREATE TABLE IF NOT EXISTS trending_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,                     -- 'football-sync', 'trends-sync', 'ai-recommend'
  status TEXT DEFAULT 'running',               -- 'running', 'completed', 'failed'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_type ON trending_sync_logs(task_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON trending_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON trending_sync_logs(started_at DESC);

ALTER TABLE trending_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to trending_sync_logs" ON trending_sync_logs FOR ALL USING (true);

-- ============================================
-- 4. 创建手动触发函数（用于测试）
-- ============================================
CREATE OR REPLACE FUNCTION trigger_trending_sync(task_type TEXT)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  -- 创建日志记录
  INSERT INTO trending_sync_logs (task_type, status, started_at)
  VALUES (task_type, 'pending', NOW())
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_trending_sync IS '手动触发同步任务（仅创建日志，实际同步需要调用 Edge Function）';

