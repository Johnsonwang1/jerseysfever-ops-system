// Facebook Ads Sync Edge Function
// 从 BigQuery 同步 Facebook Ads 数据到 Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// BigQuery 配置
const BQ_PROJECT_ID = 'jerseysfever-48104'

// 获取 Google Access Token (使用 Service Account)
async function getGoogleAccessToken(): Promise<string> {
  const credentialsJson = Deno.env.get('GCP_BQ_CREDENTIALS')
  if (!credentialsJson) {
    throw new Error('GCP_BQ_CREDENTIALS not set')
  }

  const credentials = JSON.parse(credentialsJson)
  const { client_email, private_key } = credentials

  // 创建 JWT
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/bigquery.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  // Base64url encode
  const encoder = new TextEncoder()
  const b64url = (data: Uint8Array) => btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const headerB64 = b64url(encoder.encode(JSON.stringify(header)))
  const payloadB64 = b64url(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  // 签名 (使用 Web Crypto API)
  const pemContents = private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  )

  const signatureB64 = b64url(new Uint8Array(signature))
  const jwt = `${signingInput}.${signatureB64}`

  // 交换 JWT 获取 Access Token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Failed to get access token: ${err}`)
  }

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

// 执行 BigQuery 查询
async function queryBigQuery(accessToken: string, query: string): Promise<any[]> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT_ID}/queries`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      useLegacySql: false,
      maxResults: 10000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`BigQuery query failed: ${err}`)
  }

  const data = await res.json()

  if (!data.rows) {
    return []
  }

  // 解析结果
  const fields = data.schema.fields.map((f: any) => f.name)
  return data.rows.map((row: any) => {
    const obj: any = {}
    row.f.forEach((cell: any, i: number) => {
      obj[fields[i]] = cell.v
    })
    return obj
  })
}

// 初始化 Supabase 客户端
function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

// 从 BigQuery 查询广告数据
async function queryFbAdsFromBQ(accessToken: string, dateFrom: string, dateTo: string) {
  const query = `
    SELECT
      date_start as date,
      account_id,
      campaign_id,
      campaign_name,
      adset_id,
      adset_name,
      ad_id,
      ad_name,
      country,
      CAST(spend AS FLOAT64) as spend,
      impressions,
      clicks,
      reach,
      CAST(cpc AS FLOAT64) as cpc,
      CAST(cpm AS FLOAT64) as cpm,
      CAST(ctr AS FLOAT64) as ctr,
      purchase_roas,
      action_values,
      actions
    FROM \`${BQ_PROJECT_ID}.facebook.ads_insights_country\`
    WHERE date_start >= '${dateFrom}'
      AND date_start <= '${dateTo}'
      AND spend > 0
    ORDER BY date_start DESC, spend DESC
  `

  return queryBigQuery(accessToken, query)
}

// 从 purchase_roas JSON 中提取 ROAS 值
function extractPurchaseRoas(roasJson: string | null): number | null {
  if (!roasJson) return null
  try {
    const arr = JSON.parse(roasJson)
    if (Array.isArray(arr) && arr.length > 0) {
      // 使用 value 字段 (包含所有归因窗口的总和)
      return arr[0].value || null
    }
  } catch (e) {
    console.error('Failed to parse purchase_roas:', e)
  }
  return null
}

// 从 action_values JSON 中提取购买价值
function extractPurchaseValue(actionValuesJson: string | null): number | null {
  if (!actionValuesJson) return null
  try {
    const arr = JSON.parse(actionValuesJson)
    if (Array.isArray(arr)) {
      // 查找 purchase 或 omni_purchase action
      const purchase = arr.find((a: any) =>
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )
      return purchase?.value || null
    }
  } catch (e) {
    console.error('Failed to parse action_values:', e)
  }
  return null
}

// 从 actions JSON 中提取转化指标
function extractConversionMetrics(actionsJson: string | null): {
  purchases: number
  add_to_cart: number
  initiate_checkout: number
  view_content: number
  landing_page_view: number
} {
  const result = { purchases: 0, add_to_cart: 0, initiate_checkout: 0, view_content: 0, landing_page_view: 0 }
  if (!actionsJson) return result
  try {
    const arr = JSON.parse(actionsJson)
    if (!Array.isArray(arr)) return result

    for (const action of arr) {
      const type = action.action_type
      const value = action.value || 0

      if (type === 'purchase' || type === 'omni_purchase') {
        result.purchases = Math.max(result.purchases, value)
      } else if (type === 'add_to_cart' || type === 'omni_add_to_cart') {
        result.add_to_cart = Math.max(result.add_to_cart, value)
      } else if (type === 'initiate_checkout' || type === 'omni_initiated_checkout') {
        result.initiate_checkout = Math.max(result.initiate_checkout, value)
      } else if (type === 'view_content' || type === 'omni_view_content') {
        result.view_content = Math.max(result.view_content, value)
      } else if (type === 'landing_page_view' || type === 'omni_landing_page_view') {
        result.landing_page_view = Math.max(result.landing_page_view, value)
      }
    }
  } catch (e) {
    console.error('Failed to parse actions:', e)
  }
  return result
}

// 同步数据到 Supabase
async function syncToSupabase(supabase: any, rows: any[], syncLogId: string) {
  let synced = 0
  const batchSize = 100

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)

    const records = batch.map((row: any) => {
      const conversions = extractConversionMetrics(row.actions)
      return {
        date: row.date,
        account_id: row.account_id,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        adset_id: row.adset_id,
        adset_name: row.adset_name,
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        country: row.country || 'unknown',
        spend: parseFloat(row.spend) || 0,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        reach: parseInt(row.reach) || 0,
        cpc: row.cpc ? parseFloat(row.cpc) : null,
        cpm: row.cpm ? parseFloat(row.cpm) : null,
        ctr: row.ctr ? parseFloat(row.ctr) : null,
        purchase_roas: extractPurchaseRoas(row.purchase_roas),
        fb_purchase_value: extractPurchaseValue(row.action_values),
        purchases: conversions.purchases,
        add_to_cart: conversions.add_to_cart,
        initiate_checkout: conversions.initiate_checkout,
        view_content: conversions.view_content,
        landing_page_view: conversions.landing_page_view,
        currency: 'USD',
        synced_at: new Date().toISOString(),
      }
    })

    const { error } = await supabase
      .from('fb_ads_daily')
      .upsert(records, {
        onConflict: 'date,account_id,ad_id,country',
        ignoreDuplicates: false,
      })

    if (error) {
      console.error('Batch upsert error:', error)
      throw error
    }

    synced += batch.length
    console.log(`Synced ${synced}/${rows.length} records`)
  }

  return synced
}

// 获取汇总数据 (直接从 Supabase)
async function getSummary(supabase: any, dateFrom: string, dateTo: string, accountIds?: string[]) {
  let query = supabase
    .from('fb_ads_daily')
    .select('spend, impressions, clicks, reach, country, purchase_roas, fb_purchase_value')
    .gte('date', dateFrom)
    .lte('date', dateTo)

  if (accountIds && accountIds.length > 0) {
    query = query.in('account_id', accountIds)
  }

  const { data, error } = await query

  if (error) throw error

  const summary = {
    total_spend: 0,
    total_impressions: 0,
    total_clicks: 0,
    total_reach: 0,
    total_purchase_value: 0,
    avg_cpc: 0,
    avg_cpm: 0,
    avg_ctr: 0,
    avg_roas: 0,
    by_country: {} as Record<string, { spend: number; impressions: number; clicks: number; purchase_value: number; roas: number }>,
  }

  for (const row of data || []) {
    summary.total_spend += Number(row.spend) || 0
    summary.total_impressions += row.impressions || 0
    summary.total_clicks += row.clicks || 0
    summary.total_reach += row.reach || 0
    summary.total_purchase_value += Number(row.fb_purchase_value) || 0

    const country = row.country || 'unknown'
    if (!summary.by_country[country]) {
      summary.by_country[country] = { spend: 0, impressions: 0, clicks: 0, purchase_value: 0, roas: 0 }
    }
    summary.by_country[country].spend += Number(row.spend) || 0
    summary.by_country[country].impressions += row.impressions || 0
    summary.by_country[country].clicks += row.clicks || 0
    summary.by_country[country].purchase_value += Number(row.fb_purchase_value) || 0
  }

  if (summary.total_clicks > 0) {
    summary.avg_cpc = summary.total_spend / summary.total_clicks
  }
  if (summary.total_impressions > 0) {
    summary.avg_cpm = (summary.total_spend / summary.total_impressions) * 1000
    summary.avg_ctr = (summary.total_clicks / summary.total_impressions) * 100
  }
  if (summary.total_spend > 0) {
    summary.avg_roas = summary.total_purchase_value / summary.total_spend
  }

  // 计算每个国家的 ROAS
  for (const country of Object.keys(summary.by_country)) {
    const c = summary.by_country[country]
    if (c.spend > 0) {
      c.roas = c.purchase_value / c.spend
    }
  }

  return summary
}

// 获取 Campaign 级别数据
async function getCampaignPerformance(supabase: any, dateFrom: string, dateTo: string, accountIds?: string[]) {
  let query = supabase
    .from('fb_ads_daily')
    .select('campaign_id, campaign_name, account_id, spend, impressions, clicks, reach')
    .gte('date', dateFrom)
    .lte('date', dateTo)

  if (accountIds && accountIds.length > 0) {
    query = query.in('account_id', accountIds)
  }

  const { data, error } = await query
  if (error) throw error

  const campaignMap = new Map<string, any>()

  for (const row of data || []) {
    const key = row.campaign_id
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        account_id: row.account_id,
        spend: 0, impressions: 0, clicks: 0, reach: 0,
      })
    }
    const c = campaignMap.get(key)!
    c.spend += Number(row.spend) || 0
    c.impressions += row.impressions || 0
    c.clicks += row.clicks || 0
    c.reach += row.reach || 0
  }

  return Array.from(campaignMap.values())
    .map(c => ({
      ...c,
      cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend)
}

// 获取每日趋势
async function getDailyTrend(supabase: any, dateFrom: string, dateTo: string, accountIds?: string[]) {
  let query = supabase
    .from('fb_ads_daily')
    .select('date, spend, impressions, clicks')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true })

  if (accountIds && accountIds.length > 0) {
    query = query.in('account_id', accountIds)
  }

  const { data, error } = await query
  if (error) throw error

  const dailyMap = new Map<string, any>()

  for (const row of data || []) {
    const date = row.date
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, spend: 0, impressions: 0, clicks: 0 })
    }
    const day = dailyMap.get(date)!
    day.spend += Number(row.spend) || 0
    day.impressions += row.impressions || 0
    day.clicks += row.clicks || 0
  }

  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
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
        let { date_from, date_to } = params

        // 支持 auto 模式：自动计算最近 2 天（增量同步）
        if (date_from === 'auto' || !date_from) {
          const now = new Date()
          const twoDaysAgo = new Date(now)
          twoDaysAgo.setDate(now.getDate() - 2)
          date_from = twoDaysAgo.toISOString().split('T')[0]
          date_to = now.toISOString().split('T')[0]
          console.log(`Auto mode: syncing ${date_from} to ${date_to}`)
        }

        if (!date_from || !date_to) {
          return new Response(
            JSON.stringify({ error: 'date_from and date_to are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // 创建同步日志
        const { data: logData, error: logError } = await supabase
          .from('fb_sync_logs')
          .insert({ sync_type: 'incremental', status: 'running', date_from, date_to })
          .select()
          .single()

        if (logError) throw logError
        const syncLogId = logData.id

        try {
          // 获取 Google Access Token
          console.log('Getting Google access token...')
          const accessToken = await getGoogleAccessToken()

          // 从 BigQuery 查询数据
          console.log(`Querying BigQuery for ${date_from} to ${date_to}...`)
          const rows = await queryFbAdsFromBQ(accessToken, date_from, date_to)
          console.log(`Found ${rows.length} rows`)

          // 同步到 Supabase
          const synced = await syncToSupabase(supabase, rows, syncLogId)

          // 更新同步日志
          await supabase
            .from('fb_sync_logs')
            .update({ status: 'completed', records_synced: synced, completed_at: new Date().toISOString() })
            .eq('id', syncLogId)

          return new Response(
            JSON.stringify({ success: true, records_synced: synced }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } catch (err) {
          await supabase
            .from('fb_sync_logs')
            .update({ status: 'failed', error_message: err.message, completed_at: new Date().toISOString() })
            .eq('id', syncLogId)
          throw err
        }
      }

      case 'summary': {
        const { date_from, date_to, account_ids } = params
        const data = await getSummary(supabase, date_from, date_to, account_ids)
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'campaigns': {
        const { date_from, date_to, account_ids } = params
        const data = await getCampaignPerformance(supabase, date_from, date_to, account_ids)
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'daily-trend': {
        const { date_from, date_to, account_ids } = params
        const data = await getDailyTrend(supabase, date_from, date_to, account_ids)
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'accounts': {
        const { data, error } = await supabase.from('fb_ad_accounts').select('*').eq('is_active', true)
        if (error) throw error
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'sync-logs': {
        const { data, error } = await supabase.from('fb_sync_logs').select('*').order('started_at', { ascending: false }).limit(10)
        if (error) throw error
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
