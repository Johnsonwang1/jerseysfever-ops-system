/**
 * Football Sync Edge Function
 * 
 * 从 Football-Data.org API 同步足球比赛数据
 * 
 * 环境变量:
 * - FOOTBALL_DATA_API_KEY: Football-Data.org API Key
 * - SUPABASE_URL: Supabase URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Football-Data.org API 配置
const FOOTBALL_API_BASE = 'https://api.football-data.org/v4'

// 支持的联赛代码和名称
const COMPETITIONS: Record<string, { name: string; targetCountries: string[] }> = {
  'PL': { name: 'Premier League', targetCountries: ['UK', 'US'] },
  'BL1': { name: 'Bundesliga', targetCountries: ['DE', 'US'] },
  'FL1': { name: 'Ligue 1', targetCountries: ['FR'] },
  'SA': { name: 'Serie A', targetCountries: ['US', 'DE'] },
  'PD': { name: 'La Liga', targetCountries: ['US', 'DE', 'FR'] },
  'CL': { name: 'Champions League', targetCountries: ['DE', 'UK', 'FR', 'US'] },
  'EL': { name: 'Europa League', targetCountries: ['DE', 'UK', 'FR', 'US'] },
  'CLI': { name: 'Copa Libertadores', targetCountries: ['US'] },  // 南美解放者杯（需付费订阅）
  // 注意：非洲杯 (AFCON) 不在 Football-Data.org 免费版支持列表中
  'WC': { name: 'World Cup', targetCountries: ['DE', 'UK', 'FR', 'US'] },
  'EC': { name: 'European Championship', targetCountries: ['DE', 'UK', 'FR', 'US'] },
}

// 德比战列表（用于判断比赛重要性）
const DERBIES: Array<{ teams: string[]; name: string }> = [
  { teams: ['Manchester United', 'Manchester City'], name: 'Manchester Derby' },
  { teams: ['Liverpool', 'Everton'], name: 'Merseyside Derby' },
  { teams: ['Arsenal', 'Tottenham'], name: 'North London Derby' },
  { teams: ['Real Madrid', 'Barcelona'], name: 'El Clásico' },
  { teams: ['Real Madrid', 'Atlético Madrid'], name: 'Madrid Derby' },
  { teams: ['Bayern Munich', 'Borussia Dortmund'], name: 'Der Klassiker' },
  { teams: ['AC Milan', 'Inter Milan'], name: 'Derby della Madonnina' },
  { teams: ['Juventus', 'Inter Milan'], name: "Derby d'Italia" },
  { teams: ['Paris Saint-Germain', 'Olympique Marseille'], name: 'Le Classique' },
  { teams: ['Liverpool', 'Manchester United'], name: 'North West Derby' },
  { teams: ['Chelsea', 'Arsenal'], name: 'London Derby' },
]

interface FootballMatch {
  id: number
  utcDate: string
  status: string
  matchday?: number
  stage?: string
  competition: {
    id: number
    name: string
    code: string
  }
  homeTeam: {
    id: number
    name: string
    shortName?: string
    crest?: string
  }
  awayTeam: {
    id: number
    name: string
    shortName?: string
    crest?: string
  }
  score: {
    fullTime: {
      home: number | null
      away: number | null
    }
  }
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(supabaseUrl, supabaseKey)
}

async function fetchMatches(
  competitionCode: string,
  dateFrom: string,
  dateTo: string
): Promise<FootballMatch[]> {
  const apiKey = Deno.env.get('FOOTBALL_DATA_API_KEY')
  if (!apiKey) {
    throw new Error('FOOTBALL_DATA_API_KEY is not set')
  }

  const url = `${FOOTBALL_API_BASE}/competitions/${competitionCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`
  
  console.log(`Fetching ${competitionCode}: ${url}`)
  
  const response = await fetch(url, {
    headers: {
      'X-Auth-Token': apiKey,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Error fetching ${competitionCode}: ${response.status} - ${error}`)
    return []
  }

  const data = await response.json()
  return data.matches || []
}

function isDerby(homeTeam: string, awayTeam: string): { isDerby: boolean; derbyName?: string } {
  for (const derby of DERBIES) {
    const [team1, team2] = derby.teams
    if (
      (homeTeam.includes(team1) && awayTeam.includes(team2)) ||
      (homeTeam.includes(team2) && awayTeam.includes(team1))
    ) {
      return { isDerby: true, derbyName: derby.name }
    }
  }
  return { isDerby: false }
}

function calculateImportance(
  match: FootballMatch,
  competitionCode: string
): { importance: string; score: number } {
  let score = 50 // 基础分
  let importance = 'regular'

  // 检查是否是德比
  const derbyCheck = isDerby(match.homeTeam.name, match.awayTeam.name)
  if (derbyCheck.isDerby) {
    importance = 'derby'
    score += 40
  }

  // 欧冠/欧联加分
  if (competitionCode === 'CL') {
    score += 30
    if (match.stage === 'FINAL') {
      importance = 'final'
      score = 100
    } else if (match.stage === 'SEMI_FINALS') {
      importance = 'semi_final'
      score += 20
    } else if (match.stage === 'QUARTER_FINALS') {
      importance = 'quarter_final'
      score += 10
    }
  } else if (competitionCode === 'EL') {
    score += 15
    if (match.stage === 'FINAL') {
      importance = 'final'
      score = 95
    }
  }

  // 世界杯/欧洲杯加分
  if (competitionCode === 'WC' || competitionCode === 'EC') {
    score += 25
    if (match.stage === 'FINAL') {
      importance = 'final'
      score = 100
    }
  }

  // 非洲杯
  if (competitionCode === 'CLI') {
    score += 10
  }

  return { importance, score: Math.min(score, 100) }
}

async function syncCompetition(
  supabase: ReturnType<typeof getSupabaseClient>,
  competitionCode: string,
  dateFrom: string,
  dateTo: string
): Promise<{ synced: number; errors: number }> {
  const competition = COMPETITIONS[competitionCode]
  if (!competition) {
    console.error(`Unknown competition: ${competitionCode}`)
    return { synced: 0, errors: 0 }
  }

  const matches = await fetchMatches(competitionCode, dateFrom, dateTo)
  console.log(`Found ${matches.length} matches for ${competitionCode}`)

  let synced = 0
  let errors = 0

  for (const match of matches) {
    try {
      const { importance, score } = calculateImportance(match, competitionCode)
      
      const matchData = {
        match_id: match.id,
        competition_code: competitionCode,
        competition_name: competition.name,
        home_team: match.homeTeam.name,
        home_team_short: match.homeTeam.shortName || null,
        home_team_crest: match.homeTeam.crest || null,
        away_team: match.awayTeam.name,
        away_team_short: match.awayTeam.shortName || null,
        away_team_crest: match.awayTeam.crest || null,
        match_date: match.utcDate,
        status: match.status,
        home_score: match.score?.fullTime?.home ?? null,
        away_score: match.score?.fullTime?.away ?? null,
        match_importance: importance,
        importance_score: score,
        target_countries: competition.targetCountries,
        synced_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('football_matches')
        .upsert(matchData, { onConflict: 'match_id' })

      if (error) {
        console.error(`Error upserting match ${match.id}:`, error)
        errors++
      } else {
        synced++
      }
    } catch (err) {
      console.error(`Error processing match ${match.id}:`, err)
      errors++
    }
  }

  return { synced, errors }
}

async function syncAllCompetitions(
  supabase: ReturnType<typeof getSupabaseClient>,
  dateFrom: string,
  dateTo: string,
  competitions?: string[]
): Promise<{ total_synced: number; total_errors: number; details: Record<string, { synced: number; errors: number }> }> {
  const competitionsToSync = competitions || Object.keys(COMPETITIONS)
  
  let totalSynced = 0
  let totalErrors = 0
  const details: Record<string, { synced: number; errors: number }> = {}

  for (const code of competitionsToSync) {
    // 免费层有速率限制（10次/分钟），稍微等待
    await new Promise(resolve => setTimeout(resolve, 6000))
    
    const result = await syncCompetition(supabase, code, dateFrom, dateTo)
    details[code] = result
    totalSynced += result.synced
    totalErrors += result.errors
  }

  return { total_synced: totalSynced, total_errors: totalErrors, details }
}

async function getUpcomingMatches(
  supabase: ReturnType<typeof getSupabaseClient>,
  days: number = 14,
  country?: string
): Promise<FootballMatch[]> {
  const now = new Date()
  const future = new Date()
  future.setDate(now.getDate() + days)

  let query = supabase
    .from('football_matches')
    .select('*')
    .gte('match_date', now.toISOString())
    .lte('match_date', future.toISOString())
    .order('match_date', { ascending: true })

  if (country) {
    query = query.contains('target_countries', [country])
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching upcoming matches:', error)
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
        // 同步比赛数据
        const { date_from, date_to, competitions } = params

        // 默认同步未来14天
        const today = new Date()
        const twoWeeksLater = new Date()
        twoWeeksLater.setDate(today.getDate() + 21)  // 扩大到21天，覆盖更多赛事

        const dateFrom = date_from || today.toISOString().split('T')[0]
        const dateTo = date_to || twoWeeksLater.toISOString().split('T')[0]

        console.log(`Syncing matches from ${dateFrom} to ${dateTo}`)

        const result = await syncAllCompetitions(supabase, dateFrom, dateTo, competitions)

        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'upcoming': {
        // 获取即将到来的比赛
        const { days = 14, country } = params
        const matches = await getUpcomingMatches(supabase, days, country)

        return new Response(
          JSON.stringify({ success: true, matches }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'competitions': {
        // 返回支持的联赛列表
        return new Response(
          JSON.stringify({ success: true, competitions: COMPETITIONS }),
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

