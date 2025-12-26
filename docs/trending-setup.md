# AI Trending 推荐系统配置指南

## 概述

AI Trending 推荐系统整合三大数据源，为球衣广告投放提供智能建议：
- **Football-Data.org**: 足球赛事数据
- **SerpAPI** (可选): Google Trends 搜索热度
- **Gemini 2.5 Flash**: AI 分析与推荐生成

## 1. 环境变量配置

### Supabase Edge Functions 环境变量

在 Supabase Dashboard 中配置以下环境变量：

**Settings > Edge Functions > Secrets**

```
# Football-Data.org API Key (必需)
FOOTBALL_DATA_API_KEY=b8c2cb91073b40fd8edf39f741bbbd85

# SerpAPI API Key (可选，用于 Google Trends)
SERPAPI_API_KEY=your_serpapi_key

# Gemini API Key (必需，用于 AI 推荐)
GEMINI_API_KEY=your_gemini_api_key
```

### 获取 API Key

1. **Football-Data.org** (已获取)
   - 注册: https://www.football-data.org/client/register
   - 免费版: 10次/分钟，支持主要联赛

2. **SerpAPI** (可选)
   - 注册: https://serpapi.com/
   - 费用: $50/月起
   - 如不配置，系统会使用模拟数据

3. **Gemini API**
   - 控制台: https://aistudio.google.com/
   - 创建 API Key

## 2. 部署 Edge Functions

```bash
# 部署足球同步函数
npx supabase functions deploy football-sync --no-verify-jwt --project-ref iwzohjbvuhwvfidyevpf

# 部署趋势同步函数
npx supabase functions deploy trends-sync --no-verify-jwt --project-ref iwzohjbvuhwvfidyevpf

# 部署 AI 推荐函数
npx supabase functions deploy ai-trending-recommend --no-verify-jwt --project-ref iwzohjbvuhwvfidyevpf
```

## 3. 测试 API 连接

```bash
# 测试 Football-Data.org API
export FOOTBALL_DATA_API_KEY=b8c2cb91073b40fd8edf39f741bbbd85
npx tsx scripts/test-football-api.ts
```

## 4. 配置定时任务

### 方式一：Supabase Dashboard (推荐)

1. 进入 **SQL Editor**
2. 启用 pg_cron 扩展:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS pg_net;
   ```

3. 配置定时任务:
   ```sql
   -- 每6小时同步比赛数据
   SELECT cron.schedule(
     'sync-football-matches',
     '0 */6 * * *',
     $$
     SELECT net.http_post(
       url := 'https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/football-sync',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{"action": "sync"}'::jsonb
     );
     $$
   );

   -- 每天9点生成 AI 推荐
   SELECT cron.schedule(
     'generate-ai-recommendations',
     '0 9 * * *',
     $$
     SELECT net.http_post(
       url := 'https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/ai-trending-recommend',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{"action": "generate"}'::jsonb
     );
     $$
   );
   ```

### 方式二：手动触发

在前端页面点击 "Sync Data" 和 "Generate AI Insights" 按钮。

## 5. 数据库表

已创建的表：
- `football_matches`: 足球比赛数据
- `trends_data`: Google Trends 数据
- `ai_recommendations`: AI 推荐结果
- `team_name_mappings`: 球队名称映射（用于产品匹配）
- `trending_sync_logs`: 同步日志

## 6. 前端使用

访问 `/trending` 页面：
1. 选择目标国家（DE/UK/FR/US）
2. 查看 AI 投放建议
3. 浏览赛事日历
4. 点击球队查看对应产品

## 7. 费用估算

| 服务 | 费用/月 |
|------|---------|
| Football-Data.org | 免费（或 $12） |
| SerpAPI (可选) | $50 起 |
| Gemini 2.5 Flash | ~$5-10 |
| **总计** | $5-72/月 |

## 8. 支持的联赛

- PL: Premier League (英超)
- BL1: Bundesliga (德甲)
- FL1: Ligue 1 (法甲)
- SA: Serie A (意甲)
- PD: La Liga (西甲)
- CL: Champions League (欧冠)
- EL: Europa League (欧联)
- CLI: Africa Cup of Nations (非洲杯)
- WC: World Cup (世界杯)
- EC: European Championship (欧洲杯)

