-- AI Trending 推荐系统数据库表
-- 包含足球比赛、Google Trends 数据、AI 推荐结果

-- ============================================
-- 1. 足球比赛数据表
-- ============================================
CREATE TABLE IF NOT EXISTS football_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 比赛基本信息
  match_id INTEGER UNIQUE NOT NULL,           -- Football-Data.org 比赛 ID
  competition_code TEXT NOT NULL,              -- 联赛代码: PL, BL1, FL1, CL, EL, CLI
  competition_name TEXT NOT NULL,              -- 联赛名称: Premier League, Bundesliga...
  
  -- 球队信息
  home_team TEXT NOT NULL,                     -- 主队名称
  home_team_short TEXT,                        -- 主队简称
  home_team_crest TEXT,                        -- 主队队徽 URL
  away_team TEXT NOT NULL,                     -- 客队名称
  away_team_short TEXT,                        -- 客队简称
  away_team_crest TEXT,                        -- 客队队徽 URL
  
  -- 比赛时间和状态
  match_date TIMESTAMPTZ NOT NULL,             -- 比赛时间 (UTC)
  status TEXT DEFAULT 'SCHEDULED',             -- 状态: SCHEDULED, FINISHED, IN_PLAY, POSTPONED
  
  -- 比分
  home_score INTEGER,
  away_score INTEGER,
  
  -- AI 分析结果
  match_importance TEXT,                       -- 比赛重要性: derby, final, relegation, title, regular
  importance_score INTEGER DEFAULT 50,         -- 重要性分数 0-100
  ai_analysis JSONB,                           -- AI 分析详情
  
  -- 目标市场
  target_countries TEXT[] DEFAULT '{}',        -- 目标投放国家: ['DE', 'UK', 'FR', 'US']
  
  -- 关联产品
  matched_teams JSONB DEFAULT '[]',            -- 匹配到的球队 [{team_name, product_count, top_skus}]
  
  -- 时间戳
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_matches_date ON football_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_competition ON football_matches(competition_code);
CREATE INDEX IF NOT EXISTS idx_matches_status ON football_matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_importance ON football_matches(importance_score DESC);

-- ============================================
-- 2. Google Trends 数据表
-- ============================================
CREATE TABLE IF NOT EXISTS trends_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 搜索关键词信息
  keyword TEXT NOT NULL,                       -- 搜索关键词（球队名）
  keyword_normalized TEXT,                     -- 标准化关键词（小写去空格）
  country_code TEXT NOT NULL,                  -- 国家代码: DE, UK, FR, US
  
  -- 热度数据
  interest_score INTEGER DEFAULT 0,            -- 热度分数 0-100
  trend_direction TEXT DEFAULT 'stable',       -- 趋势方向: rising, stable, declining
  change_percentage NUMERIC,                   -- 变化百分比
  
  -- 相关数据
  related_queries JSONB DEFAULT '[]',          -- 相关搜索词 [{query, score}]
  related_topics JSONB DEFAULT '[]',           -- 相关主题 [{topic, score}]
  
  -- 时间维度
  data_date DATE NOT NULL,                     -- 数据日期
  time_range TEXT DEFAULT '7d',                -- 时间范围: 7d, 30d, 90d
  
  -- 时间戳
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 唯一约束：每个关键词每个国家每天只有一条记录
  UNIQUE(keyword_normalized, country_code, data_date)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_trends_keyword ON trends_data(keyword_normalized);
CREATE INDEX IF NOT EXISTS idx_trends_country ON trends_data(country_code);
CREATE INDEX IF NOT EXISTS idx_trends_date ON trends_data(data_date DESC);
CREATE INDEX IF NOT EXISTS idx_trends_score ON trends_data(interest_score DESC);

-- ============================================
-- 3. AI 推荐结果表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 推荐目标
  target_country TEXT NOT NULL,                -- 目标国家: DE, UK, FR, US
  recommendation_date DATE NOT NULL,           -- 推荐日期
  
  -- 推荐内容
  teams JSONB NOT NULL DEFAULT '[]',           -- 推荐球队列表
  -- 结构: [{
  --   team: string,
  --   score: number,
  --   reasons: string[],
  --   upcoming_matches: [{opponent, date, competition}],
  --   trends_data: {interest_score, direction},
  --   matched_skus: string[],
  --   ad_suggestion: string
  -- }]
  
  -- AI 生成的摘要
  ai_summary TEXT,                             -- AI 生成的投放建议摘要（自然语言）
  ai_highlights JSONB DEFAULT '[]',            -- 重点关注 [{title, description, type}]
  
  -- AI 模型信息
  ai_model TEXT DEFAULT 'gemini-2.5-flash',
  ai_prompt_version TEXT DEFAULT 'v1',
  raw_response JSONB,                          -- 原始 AI 响应（调试用）
  
  -- 推荐质量指标
  confidence_score NUMERIC DEFAULT 0.8,        -- 推荐置信度 0-1
  data_freshness TEXT DEFAULT 'fresh',         -- 数据新鲜度: fresh, stale
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 每个国家每天只有一条推荐
  UNIQUE(target_country, recommendation_date)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_recommendations_country ON ai_recommendations(target_country);
CREATE INDEX IF NOT EXISTS idx_recommendations_date ON ai_recommendations(recommendation_date DESC);

-- ============================================
-- 4. 球队名称映射表（用于匹配产品）
-- ============================================
CREATE TABLE IF NOT EXISTS team_name_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 标准球队名（用于产品匹配）
  canonical_name TEXT NOT NULL UNIQUE,         -- 标准名称: Bayern Munich
  
  -- 别名列表
  aliases TEXT[] DEFAULT '{}',                 -- 别名: ['FC Bayern', 'Bayern', 'Bayern München', 'FCB']
  
  -- 所属联赛和国家
  primary_competition TEXT,                    -- 主联赛代码: BL1
  country TEXT,                                -- 所属国家: Germany
  
  -- 目标市场（这个球队的球衣主要卖到哪些国家）
  target_markets TEXT[] DEFAULT '{}',          -- ['DE', 'US']
  
  -- 是否热门球队
  is_popular BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_team_mappings_name ON team_name_mappings(canonical_name);
CREATE INDEX IF NOT EXISTS idx_team_mappings_competition ON team_name_mappings(primary_competition);

-- ============================================
-- 5. RLS 策略
-- ============================================
ALTER TABLE football_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE trends_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_name_mappings ENABLE ROW LEVEL SECURITY;

-- 允许匿名读写（与现有表保持一致）
CREATE POLICY "Allow all access to football_matches" ON football_matches FOR ALL USING (true);
CREATE POLICY "Allow all access to trends_data" ON trends_data FOR ALL USING (true);
CREATE POLICY "Allow all access to ai_recommendations" ON ai_recommendations FOR ALL USING (true);
CREATE POLICY "Allow all access to team_name_mappings" ON team_name_mappings FOR ALL USING (true);

-- ============================================
-- 6. 自动更新 updated_at 触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_trending_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_football_matches_updated_at
  BEFORE UPDATE ON football_matches
  FOR EACH ROW EXECUTE FUNCTION update_trending_updated_at();

CREATE TRIGGER update_ai_recommendations_updated_at
  BEFORE UPDATE ON ai_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_trending_updated_at();

CREATE TRIGGER update_team_name_mappings_updated_at
  BEFORE UPDATE ON team_name_mappings
  FOR EACH ROW EXECUTE FUNCTION update_trending_updated_at();

-- ============================================
-- 7. 初始化热门球队映射数据
-- ============================================
INSERT INTO team_name_mappings (canonical_name, aliases, primary_competition, country, target_markets, is_popular) VALUES
-- 英超热门球队
('Manchester United', ARRAY['Man United', 'Man Utd', 'MUFC', 'United'], 'PL', 'England', ARRAY['UK', 'US', 'DE'], true),
('Manchester City', ARRAY['Man City', 'MCFC', 'City'], 'PL', 'England', ARRAY['UK', 'US', 'DE'], true),
('Liverpool', ARRAY['Liverpool FC', 'LFC', 'The Reds'], 'PL', 'England', ARRAY['UK', 'US', 'DE'], true),
('Arsenal', ARRAY['Arsenal FC', 'AFC', 'The Gunners'], 'PL', 'England', ARRAY['UK', 'US'], true),
('Chelsea', ARRAY['Chelsea FC', 'CFC', 'The Blues'], 'PL', 'England', ARRAY['UK', 'US'], true),
('Tottenham', ARRAY['Tottenham Hotspur', 'Spurs', 'THFC'], 'PL', 'England', ARRAY['UK', 'US'], true),

-- 德甲热门球队
('Bayern Munich', ARRAY['FC Bayern', 'Bayern', 'Bayern München', 'FCB'], 'BL1', 'Germany', ARRAY['DE', 'US'], true),
('Borussia Dortmund', ARRAY['Dortmund', 'BVB', 'Borussia'], 'BL1', 'Germany', ARRAY['DE', 'US'], true),
('RB Leipzig', ARRAY['Leipzig', 'RBL'], 'BL1', 'Germany', ARRAY['DE'], true),
('Bayer Leverkusen', ARRAY['Leverkusen', 'Bayer 04'], 'BL1', 'Germany', ARRAY['DE'], true),

-- 法甲热门球队
('Paris Saint-Germain', ARRAY['PSG', 'Paris SG', 'Paris'], 'FL1', 'France', ARRAY['FR', 'US', 'DE'], true),
('Olympique Marseille', ARRAY['Marseille', 'OM'], 'FL1', 'France', ARRAY['FR'], true),
('AS Monaco', ARRAY['Monaco'], 'FL1', 'France', ARRAY['FR'], false),

-- 西甲热门球队
('Real Madrid', ARRAY['Real', 'Madrid', 'Los Blancos'], 'PD', 'Spain', ARRAY['US', 'DE', 'FR'], true),
('Barcelona', ARRAY['FC Barcelona', 'Barca', 'FCB'], 'PD', 'Spain', ARRAY['US', 'DE', 'FR'], true),
('Atletico Madrid', ARRAY['Atletico', 'Atleti'], 'PD', 'Spain', ARRAY['US'], true),

-- 意甲热门球队
('Juventus', ARRAY['Juve', 'Juventus FC'], 'SA', 'Italy', ARRAY['US', 'DE'], true),
('AC Milan', ARRAY['Milan', 'Rossoneri'], 'SA', 'Italy', ARRAY['US', 'DE'], true),
('Inter Milan', ARRAY['Inter', 'Internazionale', 'Nerazzurri'], 'SA', 'Italy', ARRAY['US', 'DE'], true),

-- 国家队
('Germany', ARRAY['Deutschland', 'DFB', 'Die Mannschaft'], 'EC', 'Germany', ARRAY['DE', 'US'], true),
('France', ARRAY['Les Bleus', 'FFF'], 'EC', 'France', ARRAY['FR', 'US', 'DE'], true),
('England', ARRAY['Three Lions', 'England National Team'], 'EC', 'England', ARRAY['UK', 'US'], true),
('Brazil', ARRAY['Brasil', 'Seleção'], 'WC', 'Brazil', ARRAY['US', 'DE', 'FR', 'UK'], true),
('Argentina', ARRAY['Albiceleste'], 'WC', 'Argentina', ARRAY['US', 'DE', 'FR', 'UK'], true)

ON CONFLICT (canonical_name) DO NOTHING;

-- ============================================
-- 8. 启用 Realtime（可选）
-- ============================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE ai_recommendations;

