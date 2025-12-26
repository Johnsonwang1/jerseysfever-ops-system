/**
 * Google Trends Sync Edge Function
 * 
 * 使用 SerpAPI 同步 Google Trends 数据
 * 
 * 环境变量:
 * - SERPAPI_API_KEY: SerpAPI API Key (https://serpapi.com/)
 * - SUPABASE_URL: Supabase URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key
 * 
 * 备选方案: 如果不使用 SerpAPI，可以考虑:
 * 1. PyTrends (Python) - 免费但不稳定，容易被封
 * 2. Google Trends API Alpha - 需要申请
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// SerpAPI 配置
const SERPAPI_BASE = 'https://serpapi.com/search.json'

// 目标国家配置
const COUNTRIES: Record<string, { geo: string; hl: string; name: string }> = {
  'DE': { geo: 'DE', hl: 'de', name: 'Germany' },
  'UK': { geo: 'GB', hl: 'en', name: 'United Kingdom' },
  'FR': { geo: 'FR', hl: 'fr', name: 'France' },
  'US': { geo: 'US', hl: 'en', name: 'United States' },
}

// 默认要追踪的球队关键词
const DEFAULT_KEYWORDS = [
  'Bayern Munich jersey',
  'Manchester United jersey',
  'Real Madrid jersey',
  'Liverpool jersey',
  'PSG jersey',
  'Barcelona jersey',
  'Manchester City jersey',
  'Borussia Dortmund jersey',
  'Arsenal jersey',
  'Chelsea jersey',
  'Juventus jersey',
  'AC Milan jersey',
  'Inter Milan jersey',
  'Atletico Madrid jersey',
  'Tottenham jersey',
]

interface TrendsResult {
  keyword: string
  country_code: string
  interest_score: number
  trend_direction: 'rising' | 'stable' | 'declining'
  change_percentage?: number
  related_queries: Array<{ query: string; value: number }>
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(supabaseUrl, supabaseKey)
}

/**
 * 使用 SerpAPI 获取 Google Trends 数据
 */
async function fetchTrendsFromSerpAPI(
  keyword: string,
  geo: string,
  hl: string
): Promise<TrendsResult | null> {
  const apiKey = Deno.env.get('SERPAPI_API_KEY')
  if (!apiKey) {
    console.warn('SERPAPI_API_KEY is not set, using mock data')
    return generateMockTrendsData(keyword, geo)
  }

  const params = new URLSearchParams({
    engine: 'google_trends',
    q: keyword,
    geo: geo,
    hl: hl,
    data_type: 'TIMESERIES',
    date: 'today 3-m', // 过去3个月
    api_key: apiKey,
  })

  try {
    const response = await fetch(`${SERPAPI_BASE}?${params}`)
    
    if (!response.ok) {
      console.error(`SerpAPI error: ${response.status}`)
      return null
    }

    const data = await response.json()
    
    // 解析 SerpAPI 响应
    const timelineData = data.interest_over_time?.timeline_data || []
    
    if (timelineData.length === 0) {
      return null
    }

    // 计算最新的热度分数
    const latestData = timelineData[timelineData.length - 1]
    const previousData = timelineData[timelineData.length - 8] || timelineData[0] // 7天前的数据
    
    const latestScore = latestData?.values?.[0]?.extracted_value || 0
    const previousScore = previousData?.values?.[0]?.extracted_value || latestScore
    
    // 计算变化
    const changePercentage = previousScore > 0 
      ? ((latestScore - previousScore) / previousScore) * 100 
      : 0

    let trendDirection: 'rising' | 'stable' | 'declining' = 'stable'
    if (changePercentage > 10) {
      trendDirection = 'rising'
    } else if (changePercentage < -10) {
      trendDirection = 'declining'
    }

    // 获取相关查询
    const relatedQueries = (data.related_queries?.rising || [])
      .slice(0, 5)
      .map((q: { query: string; extracted_value: number }) => ({
        query: q.query,
        value: q.extracted_value || 0,
      }))

    return {
      keyword,
      country_code: Object.keys(COUNTRIES).find(k => COUNTRIES[k].geo === geo) || 'US',
      interest_score: latestScore,
      trend_direction: trendDirection,
      change_percentage: Math.round(changePercentage * 10) / 10,
      related_queries: relatedQueries,
    }
  } catch (error) {
    console.error(`Error fetching trends for ${keyword}:`, error)
    return null
  }
}

/**
 * 生成模拟数据（当没有 API Key 时使用）
 */
function generateMockTrendsData(keyword: string, geo: string): TrendsResult {
  // 根据关键词生成合理的模拟数据
  const baseScore = Math.floor(Math.random() * 40) + 30 // 30-70
  const directions: Array<'rising' | 'stable' | 'declining'> = ['rising', 'stable', 'declining']
  const direction = directions[Math.floor(Math.random() * 3)]
  
  // 热门球队给更高分数
  const hotTeams = ['Manchester United', 'Real Madrid', 'Bayern Munich', 'Liverpool', 'PSG']
  const isHot = hotTeams.some(team => keyword.toLowerCase().includes(team.toLowerCase()))
  const score = isHot ? baseScore + 20 : baseScore

  return {
    keyword,
    country_code: Object.keys(COUNTRIES).find(k => COUNTRIES[k].geo === geo) || 'US',
    interest_score: Math.min(score, 100),
    trend_direction: direction,
    change_percentage: direction === 'rising' ? Math.random() * 30 + 5 : 
                       direction === 'declining' ? -(Math.random() * 20 + 5) : 
                       Math.random() * 10 - 5,
    related_queries: [],
  }
}

/**
 * 从比赛数据中提取要追踪的球队
 */
async function getTeamsFromMatches(supabase: ReturnType<typeof getSupabaseClient>): Promise<string[]> {
  const now = new Date()
  const twoWeeksLater = new Date()
  twoWeeksLater.setDate(now.getDate() + 14)

  const { data: matches, error } = await supabase
    .from('football_matches')
    .select('home_team, away_team')
    .gte('match_date', now.toISOString())
    .lte('match_date', twoWeeksLater.toISOString())

  if (error || !matches) {
    console.error('Error fetching matches for trends:', error)
    return []
  }

  const teams = new Set<string>()
  for (const match of matches) {
    teams.add(match.home_team)
    teams.add(match.away_team)
  }

  // 转换为关键词（添加 "jersey" 后缀）
  return Array.from(teams).map(team => `${team} jersey`)
}

/**
 * 同步单个国家的 Trends 数据
 */
async function syncCountryTrends(
  supabase: ReturnType<typeof getSupabaseClient>,
  countryCode: string,
  keywords: string[]
): Promise<{ synced: number; errors: number }> {
  const country = COUNTRIES[countryCode]
  if (!country) {
    console.error(`Unknown country: ${countryCode}`)
    return { synced: 0, errors: 0 }
  }

  let synced = 0
  let errors = 0
  const today = new Date().toISOString().split('T')[0]

  for (const keyword of keywords) {
    try {
      // SerpAPI 有速率限制，添加延迟
      await new Promise(resolve => setTimeout(resolve, 2000))

      const result = await fetchTrendsFromSerpAPI(keyword, country.geo, country.hl)
      
      if (result) {
        const trendsData = {
          keyword: result.keyword,
          keyword_normalized: result.keyword.toLowerCase().replace(/\s+/g, '-'),
          country_code: countryCode,
          interest_score: result.interest_score,
          trend_direction: result.trend_direction,
          change_percentage: result.change_percentage,
          related_queries: result.related_queries,
          data_date: today,
          synced_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('trends_data')
          .upsert(trendsData, { 
            onConflict: 'keyword_normalized,country_code,data_date' 
          })

        if (error) {
          console.error(`Error upserting trends for ${keyword}:`, error)
          errors++
        } else {
          synced++
        }
      } else {
        errors++
      }
    } catch (err) {
      console.error(`Error processing trends for ${keyword}:`, err)
      errors++
    }
  }

  return { synced, errors }
}

/**
 * 同步所有国家的 Trends 数据
 */
async function syncAllTrends(
  supabase: ReturnType<typeof getSupabaseClient>,
  options?: {
    countries?: string[]
    keywords?: string[]
    useMatchTeams?: boolean
  }
): Promise<{
  total_synced: number
  total_errors: number
  details: Record<string, { synced: number; errors: number }>
}> {
  const { 
    countries = Object.keys(COUNTRIES), 
    keywords,
    useMatchTeams = true 
  } = options || {}

  // 确定要追踪的关键词
  let keywordsToTrack = keywords || DEFAULT_KEYWORDS
  
  if (useMatchTeams && !keywords) {
    const matchTeams = await getTeamsFromMatches(supabase)
    if (matchTeams.length > 0) {
      // 合并比赛球队和默认关键词，去重
      keywordsToTrack = [...new Set([...matchTeams, ...DEFAULT_KEYWORDS])]
    }
  }

  console.log(`Syncing trends for ${keywordsToTrack.length} keywords across ${countries.length} countries`)

  let totalSynced = 0
  let totalErrors = 0
  const details: Record<string, { synced: number; errors: number }> = {}

  for (const countryCode of countries) {
    console.log(`Syncing trends for ${countryCode}...`)
    const result = await syncCountryTrends(supabase, countryCode, keywordsToTrack)
    details[countryCode] = result
    totalSynced += result.synced
    totalErrors += result.errors
  }

  return { total_synced: totalSynced, total_errors: totalErrors, details }
}

/**
 * 获取热门趋势
 */
async function getTopTrends(
  supabase: ReturnType<typeof getSupabaseClient>,
  countryCode?: string,
  limit: number = 10
) {
  let query = supabase
    .from('trends_data')
    .select('*')
    .order('interest_score', { ascending: false })
    .limit(limit)

  if (countryCode) {
    query = query.eq('country_code', countryCode)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching top trends:', error)
    return []
  }

  return data || []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = getSupabaseClient()
    const { action, ...params } = await req.json()

    switch (action) {
      case 'sync': {
        // 同步 Trends 数据
        const { countries, keywords, use_match_teams } = params

        const result = await syncAllTrends(supabase, {
          countries,
          keywords,
          useMatchTeams: use_match_teams !== false,
        })

        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'top': {
        // 获取热门趋势
        const { country, limit = 10 } = params
        const trends = await getTopTrends(supabase, country, limit)

        return new Response(
          JSON.stringify({ success: true, trends }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'rising': {
        // 获取上升趋势
        const { country, limit = 10 } = params
        
        let query = supabase
          .from('trends_data')
          .select('*')
          .eq('trend_direction', 'rising')
          .order('change_percentage', { ascending: false })
          .limit(limit)

        if (country) {
          query = query.eq('country_code', country)
        }

        const { data, error } = await query

        if (error) {
          throw error
        }

        return new Response(
          JSON.stringify({ success: true, trends: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'countries': {
        // 返回支持的国家列表
        return new Response(
          JSON.stringify({ success: true, countries: COUNTRIES }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (err) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

