/**
 * AI Trending Recommend Edge Function
 * 
 * 使用 Gemini 2.5 Flash 分析足球赛事和 Google Trends 数据
 * 为不同国家生成智能投放建议
 * 
 * 环境变量:
 * - GEMINI_API_KEY: Google Gemini API Key
 * - SUPABASE_URL: Supabase URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Gemini API 配置
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODEL = 'gemini-3-flash-preview'

// 目标国家配置
const TARGET_COUNTRIES = ['DE', 'UK', 'FR', 'US']

const COUNTRY_NAMES: Record<string, string> = {
  'DE': 'Germany',
  'UK': 'United Kingdom',
  'FR': 'France',
  'US': 'United States',
}

const COUNTRY_LANGUAGES: Record<string, string> = {
  'DE': 'German',
  'UK': 'English',
  'FR': 'French',
  'US': 'English',
}

interface FootballMatch {
  match_id: number
  competition_code: string
  competition_name: string
  home_team: string
  away_team: string
  match_date: string
  match_importance: string
  importance_score: number
  target_countries: string[]
}

interface TrendsData {
  keyword: string
  country_code: string
  interest_score: number
  trend_direction: string
  change_percentage: number
}

interface ProductInfo {
  team: string
  product_count: number
  top_skus: string[]
  has_stock: boolean
}

interface TeamRecommendation {
  team: string
  score: number
  reasons: string[]
  upcoming_matches: Array<{
    opponent: string
    date: string
    competition: string
    importance: string
  }>
  trends_data?: {
    interest_score: number
    direction: string
    change_percentage: number
  }
  matched_skus: string[]
  ad_suggestion: string
}

interface AIRecommendation {
  target_country: string
  recommendation_date: string
  teams: TeamRecommendation[]
  ai_summary: string
  ai_highlights: Array<{
    title: string
    description: string
    type: 'derby' | 'rising' | 'final' | 'hot' | 'opportunity'
  }>
  ai_model: string
  confidence_score: number
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(supabaseUrl, supabaseKey)
}

// ==================== Gemini API 调用 ====================

const SYSTEM_PROMPT = `你是一个专业的足球球衣销售智能投放顾问。你需要分析足球赛事数据和搜索趋势，为不同国家的市场生成精准的广告投放建议。

你的分析应该考虑以下因素：
1. 赛事重要性：德比战 > 决赛 > 联赛关键场次 > 普通比赛
2. 搜索热度趋势：上升 > 稳定 > 下降
3. 库存匹配：有货优先推荐
4. 地域相关性：本地球队在本地市场更有优势
5. 时间因素：比赛前3-5天是投放黄金期

请用专业但易懂的语言给出建议，包括具体的投放策略。`

async function callGeminiAPI(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Gemini API error:', error)
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  
  return text
}

// ==================== 数据获取 ====================

async function getUpcomingMatches(
  supabase: ReturnType<typeof getSupabaseClient>,
  country: string,
  days: number = 21  // 扩大到21天，覆盖德甲冬歇期后的比赛
): Promise<FootballMatch[]> {
  const now = new Date()
  const future = new Date()
  future.setDate(now.getDate() + days)

  const { data, error } = await supabase
    .from('football_matches')
    .select('*')
    .contains('target_countries', [country])
    .gte('match_date', now.toISOString())
    .lte('match_date', future.toISOString())
    .order('importance_score', { ascending: false })
    .limit(30)

  if (error) {
    console.error('Error fetching matches:', error)
    return []
  }

  return data || []
}

async function getTrendsData(
  supabase: ReturnType<typeof getSupabaseClient>,
  country: string
): Promise<TrendsData[]> {
  const { data, error } = await supabase
    .from('trends_data')
    .select('*')
    .eq('country_code', country)
    .order('interest_score', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching trends:', error)
    return []
  }

  return data || []
}

// 球队名称映射（API全名 -> 搜索关键词）
const TEAM_NAME_MAPPINGS: Record<string, string[]> = {
  'Juventus FC': ['Juventus', 'Juve'],
  'AC Milan': ['AC Milan', 'Milan'],
  'FC Internazionale Milano': ['Inter Milan', 'Inter'],
  'AS Roma': ['Roma'],
  'SSC Napoli': ['Napoli'],
  'Atalanta BC': ['Atalanta'],
  'ACF Fiorentina': ['Fiorentina'],
  'SS Lazio': ['Lazio'],
  'FC Bayern München': ['Bayern Munich', 'Bayern'],
  'Borussia Dortmund': ['Dortmund', 'BVB'],
  'RB Leipzig': ['Leipzig', 'RB Leipzig'],
  'Bayer 04 Leverkusen': ['Leverkusen', 'Bayer'],
  'VfB Stuttgart': ['Stuttgart'],
  'Eintracht Frankfurt': ['Frankfurt', 'Eintracht'],
  'Manchester United FC': ['Manchester United', 'Man United'],
  'Manchester City FC': ['Manchester City', 'Man City'],
  'Liverpool FC': ['Liverpool'],
  'Chelsea FC': ['Chelsea'],
  'Arsenal FC': ['Arsenal'],
  'Tottenham Hotspur FC': ['Tottenham', 'Spurs'],
  'Paris Saint-Germain FC': ['PSG', 'Paris Saint-Germain'],
  'Real Madrid CF': ['Real Madrid'],
  'FC Barcelona': ['Barcelona', 'Barca'],
  'Club Atlético de Madrid': ['Atletico Madrid', 'Atletico'],
}

function getSearchKeywords(teamName: string): string[] {
  // 优先使用映射表
  if (TEAM_NAME_MAPPINGS[teamName]) {
    return TEAM_NAME_MAPPINGS[teamName]
  }
  
  // 清理球队名称：移除常见后缀
  const cleaned = teamName
    .replace(/\s+(FC|CF|AFC|SC|BC|SV|1\.\s*FC|VfB|VfL|RB|SS|SSC|AC|AS|ACF)$/i, '')
    .replace(/^(FC|CF|AFC|SC|BC)\s+/i, '')
    .trim()
  
  return [cleaned, teamName]
}

async function getProductsByTeams(
  supabase: ReturnType<typeof getSupabaseClient>,
  teams: string[]
): Promise<Map<string, ProductInfo>> {
  const result = new Map<string, ProductInfo>()

  for (const team of teams) {
    // 获取搜索关键词
    const keywords = getSearchKeywords(team)
    let allProducts: any[] = []
    
    // 尝试每个关键词搜索
    for (const keyword of keywords) {
      // 只用 name 字段搜索，更简单可靠
      const { data, error } = await supabase
        .from('products')
        .select('sku, name, stock_quantities, statuses')
        .ilike('name', `%${keyword}%`)
        .limit(10)

      if (error) {
        console.error(`Error fetching products for ${keyword}:`, error)
        continue
      }
      
      if (data && data.length > 0) {
        allProducts = data
        console.log(`Found ${data.length} products for ${team} using keyword "${keyword}"`)
        break  // 找到就停止
      }
    }
    
    if (allProducts.length === 0) {
      console.log(`No products found for ${team}, tried keywords: ${keywords.join(', ')}`)
    }

    const hasStock = allProducts.some(p => {
      const quantities = p.stock_quantities || {}
      return Object.values(quantities).some((q: any) => q > 0)
    })

    result.set(team, {
      team,
      product_count: allProducts.length,
      top_skus: allProducts.slice(0, 5).map(p => p.sku),
      has_stock: hasStock,
    })
  }

  return result
}

// ==================== AI 推荐生成 ====================

function buildAnalysisPrompt(
  country: string,
  matches: FootballMatch[],
  trends: TrendsData[],
  products: Map<string, ProductInfo>
): string {
  const countryName = COUNTRY_NAMES[country] || country
  const language = COUNTRY_LANGUAGES[country] || 'English'
  
  // 构建比赛数据
  const matchesInfo = matches.slice(0, 15).map(m => ({
    home_team: m.home_team,
    away_team: m.away_team,
    date: new Date(m.match_date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      weekday: 'short' 
    }),
    competition: m.competition_name,
    importance: m.match_importance || 'regular',
    importance_score: m.importance_score,
  }))

  // 构建趋势数据
  const trendsInfo = trends.slice(0, 10).map(t => ({
    keyword: t.keyword,
    interest_score: t.interest_score,
    direction: t.trend_direction,
    change: t.change_percentage ? `${t.change_percentage > 0 ? '+' : ''}${t.change_percentage}%` : 'N/A',
  }))

  // 构建产品库存数据
  const productsInfo = Array.from(products.entries()).map(([team, info]) => ({
    team,
    products_available: info.product_count,
    has_stock: info.has_stock,
  }))

  const prompt = `分析以下数据，为${countryName}市场生成足球球衣投放建议。

## 即将到来的比赛 (未来14天)
${JSON.stringify(matchesInfo, null, 2)}

## Google Trends 搜索热度 (${countryName})
${JSON.stringify(trendsInfo, null, 2)}

## 产品库存情况
${JSON.stringify(productsInfo, null, 2)}

请生成投放建议，返回以下 JSON 格式：
{
  "top_teams": [
    {
      "team": "球队名称",
      "score": 85,
      "reasons": ["原因1", "原因2", "原因3"],
      "upcoming_matches": [
        {
          "opponent": "对手",
          "date": "日期",
          "competition": "联赛",
          "importance": "derby/final/regular"
        }
      ],
      "ad_suggestion": "具体的投放建议，包括时间、受众、创意方向"
    }
  ],
  "summary": "一段简洁的市场分析摘要（50-100字）",
  "highlights": [
    {
      "title": "重点标题",
      "description": "描述",
      "type": "derby/rising/final/hot/opportunity"
    }
  ]
}

注意：
1. 推荐 5-8 个球队，按优先级排序
2. score 范围 0-100，综合考虑赛事重要性、搜索热度、库存情况
3. reasons 列出 2-4 个推荐理由
4. ad_suggestion 要具体可执行
5. 输出语言：所有内容（summary、reasons、ad_suggestion、highlights）都用中文
6. 只返回 JSON，不要其他内容`

  return prompt
}

async function generateRecommendation(
  supabase: ReturnType<typeof getSupabaseClient>,
  country: string
): Promise<AIRecommendation | null> {
  console.log(`Generating recommendation for ${country}...`)

  // 获取数据
  const matches = await getUpcomingMatches(supabase, country)
  const trends = await getTrendsData(supabase, country)

  if (matches.length === 0) {
    console.log(`No matches found for ${country}, using trends only`)
  }

  // 收集所有球队
  const teams = new Set<string>()
  for (const match of matches) {
    teams.add(match.home_team)
    teams.add(match.away_team)
  }
  for (const trend of trends) {
    // 从关键词提取球队名
    const teamName = trend.keyword.replace(/ jersey$/i, '').trim()
    if (teamName) {
      teams.add(teamName)
    }
  }

  // 获取产品库存
  const products = await getProductsByTeams(supabase, Array.from(teams))

  // 构建并调用 AI
  const prompt = buildAnalysisPrompt(country, matches, trends, products)
  
  try {
    const aiResponse = await callGeminiAPI(prompt)
    
    // 解析 AI 响应
    let parsed: any
    try {
      // 尝试提取 JSON（可能被 markdown 包裹）
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        parsed = JSON.parse(aiResponse)
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse)
      throw new Error('Failed to parse AI response')
    }

    // 构建推荐结果
    const recommendation: AIRecommendation = {
      target_country: country,
      recommendation_date: new Date().toISOString().split('T')[0],
      teams: (parsed.top_teams || []).map((team: any) => {
        const productInfo = products.get(team.team)
        return {
          team: team.team,
          score: team.score || 50,
          reasons: team.reasons || [],
          upcoming_matches: team.upcoming_matches || [],
          trends_data: trends.find(t => 
            t.keyword.toLowerCase().includes(team.team.toLowerCase())
          ) ? {
            interest_score: trends.find(t => 
              t.keyword.toLowerCase().includes(team.team.toLowerCase())
            )!.interest_score,
            direction: trends.find(t => 
              t.keyword.toLowerCase().includes(team.team.toLowerCase())
            )!.trend_direction,
            change_percentage: trends.find(t => 
              t.keyword.toLowerCase().includes(team.team.toLowerCase())
            )!.change_percentage || 0,
          } : undefined,
          matched_skus: productInfo?.top_skus || [],
          ad_suggestion: team.ad_suggestion || '',
        }
      }),
      ai_summary: parsed.summary || '',
      ai_highlights: parsed.highlights || [],
      ai_model: GEMINI_MODEL,
      confidence_score: 0.85,
    }

    return recommendation
  } catch (error) {
    console.error(`Error generating recommendation for ${country}:`, error)
    return null
  }
}

async function saveRecommendation(
  supabase: ReturnType<typeof getSupabaseClient>,
  recommendation: AIRecommendation
): Promise<boolean> {
  const { error } = await supabase
    .from('ai_recommendations')
    .upsert({
      target_country: recommendation.target_country,
      recommendation_date: recommendation.recommendation_date,
      teams: recommendation.teams,
      ai_summary: recommendation.ai_summary,
      ai_highlights: recommendation.ai_highlights,
      ai_model: recommendation.ai_model,
      confidence_score: recommendation.confidence_score,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'target_country,recommendation_date',
    })

  if (error) {
    console.error('Error saving recommendation:', error)
    return false
  }

  return true
}

// ==================== 主处理逻辑 ====================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = getSupabaseClient()
    const { action, ...params } = await req.json()

    switch (action) {
      case 'generate': {
        // 生成 AI 推荐
        const { country, countries } = params
        const targetCountries = country 
          ? [country] 
          : (countries || TARGET_COUNTRIES)

        const results: Record<string, { success: boolean; error?: string }> = {}

        for (const c of targetCountries) {
          try {
            const recommendation = await generateRecommendation(supabase, c)
            
            if (recommendation) {
              const saved = await saveRecommendation(supabase, recommendation)
              results[c] = { success: saved }
            } else {
              results[c] = { success: false, error: 'Failed to generate recommendation' }
            }
          } catch (err) {
            results[c] = { success: false, error: err.message }
          }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get': {
        // 获取推荐
        const { country, date } = params
        
        let query = supabase
          .from('ai_recommendations')
          .select('*')
          .order('recommendation_date', { ascending: false })

        if (country) {
          query = query.eq('target_country', country)
        }

        if (date) {
          query = query.eq('recommendation_date', date)
        } else {
          query = query.limit(country ? 1 : 4)
        }

        const { data, error } = await query

        if (error) {
          throw error
        }

        return new Response(
          JSON.stringify({ success: true, recommendations: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'analyze-match': {
        // 分析单场比赛
        const { match_id } = params

        const { data: match, error } = await supabase
          .from('football_matches')
          .select('*')
          .eq('match_id', match_id)
          .single()

        if (error || !match) {
          return new Response(
            JSON.stringify({ error: 'Match not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // 获取两支球队的产品
        const products = await getProductsByTeams(supabase, [match.home_team, match.away_team])

        const analysisPrompt = `分析这场比赛的投放机会：

比赛：${match.home_team} vs ${match.away_team}
联赛：${match.competition_name}
时间：${new Date(match.match_date).toLocaleDateString()}
重要性：${match.match_importance} (${match.importance_score}/100)

${match.home_team} 产品数：${products.get(match.home_team)?.product_count || 0}
${match.away_team} 产品数：${products.get(match.away_team)?.product_count || 0}

请返回 JSON 格式的分析结果：
{
  "match_analysis": "比赛分析",
  "ad_timing": "最佳投放时间建议",
  "target_audiences": ["目标受众1", "目标受众2"],
  "creative_ideas": ["创意方向1", "创意方向2"],
  "budget_allocation": {
    "home_team_percentage": 50,
    "away_team_percentage": 50
  }
}`

        const aiResponse = await callGeminiAPI(analysisPrompt)
        let analysis
        try {
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
          analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiResponse)
        } catch {
          analysis = { raw_response: aiResponse }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            match,
            products: Object.fromEntries(products),
            analysis 
          }),
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

