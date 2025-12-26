/**
 * AI Recommend Agent - RAG + Grounding 版本
 * 
 * 架构：
 * 1. 预检索真实数据（销售、赛程、产品）
 * 2. Gemini + Google Search Grounding 分析
 * 3. 输出验证（确保 SKU 真实存在）
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const GEMINI_MODEL = 'gemini-2.0-flash'

// ==================== 类型定义 ====================

interface ProductInfo {
  sku: string
  name: string
  images: string[]
  price: Record<string, number>
  stock: Record<string, number>
  sales_7d: number
}

interface MatchInfo {
  home_team: string
  away_team: string
  match_date: string
  competition_name: string
  match_importance: string
}

interface RetrievedContext {
  sales_data: {
    period: string
    site: string
    total_orders: number
    top_products: Array<{
      sku: string
      name: string
      total_quantity: number
      order_count: number
    }>
  }
  matches: MatchInfo[]
  product_details: Map<string, ProductInfo>
  valid_skus: Set<string>
}

interface Recommendation {
  sku: string
  product_name: string
  reason: string
  related_match?: string
  timing: string
  hot_news?: string
  sales_7d: number
  images: string[]
  price: Record<string, number>
}

interface StructuredResult {
  summary: string
  grounding_sources?: string[]
  recommendations: Recommendation[]
  generated_at: string
  country: string
  execution_time_ms: number
}

// ==================== 数据检索层 (RAG) ====================

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(supabaseUrl, supabaseKey)
}

function getSiteByCountry(country: string): string {
  const map: Record<string, string> = {
    'DE': 'de',
    'UK': 'uk',
    'FR': 'fr',
    'US': 'com'
  }
  return map[country] || 'com'
}

/**
 * 获取真实销售数据
 */
async function getSalesData(
  supabase: SupabaseClient,
  site: string,
  days: number = 7,
  limit: number = 30
): Promise<RetrievedContext['sales_data']> {
  const dateFrom = new Date()
  dateFrom.setDate(dateFrom.getDate() - days)

  const { data: orders, error } = await supabase
    .from('orders')
    .select('site, line_items, date_created')
    .eq('site', site)
    .gte('date_created', dateFrom.toISOString())
    .in('status', ['completed', 'processing'])
    .order('date_created', { ascending: false })
    .limit(500)

  if (error) {
    console.error('getSalesData error:', error)
    return { period: `${days}天`, site, total_orders: 0, top_products: [] }
  }

  // 统计产品销量
  const productStats = new Map<string, { 
    sku: string
    name: string
    quantity: number
    orders: number
  }>()

  for (const order of orders || []) {
    const items = order.line_items || []
    for (const item of items) {
      if (!item.sku) continue
      
      // 去掉尺码后缀
      const baseSku = item.sku.replace(/-(?:XS|S|M|L|XL|2XL|3XL|4XL|XXL|XXXL)$/i, '')
      const existing = productStats.get(baseSku) || {
        sku: baseSku,
        name: item.name?.replace(/\s*-\s*(XS|S|M|L|XL|2XL|3XL|4XL|XXL|XXXL)$/i, '') || baseSku,
        quantity: 0,
        orders: 0
      }
      
      existing.quantity += item.quantity || 1
      existing.orders += 1
      productStats.set(baseSku, existing)
    }
  }

  // 排序并返回
  const results = Array.from(productStats.values())
    .map(p => ({
      sku: p.sku,
      name: p.name,
      total_quantity: p.quantity,
      order_count: p.orders
    }))
    .sort((a, b) => b.total_quantity - a.total_quantity)
    .slice(0, limit)

  return {
    period: `${days}天`,
    site,
    total_orders: orders?.length || 0,
    top_products: results
  }
}

/**
 * 获取未来赛程
 */
async function getUpcomingMatches(
  supabase: SupabaseClient,
  country: string,
  days: number = 14
): Promise<MatchInfo[]> {
  const now = new Date()
  const future = new Date()
  future.setDate(now.getDate() + days)

  const { data, error } = await supabase
    .from('football_matches')
    .select('home_team, away_team, match_date, competition_name, match_importance, target_countries')
    .gte('match_date', now.toISOString())
    .lte('match_date', future.toISOString())
    .in('status', ['SCHEDULED', 'TIMED'])
    .order('match_date', { ascending: true })
    .limit(50)

  if (error) {
    console.error('getUpcomingMatches error:', error)
    return []
  }

  // 过滤目标国家
  return (data || [])
    .filter(m => (m.target_countries || []).includes(country))
    .map(m => ({
      home_team: m.home_team,
      away_team: m.away_team,
      match_date: m.match_date,
      competition_name: m.competition_name,
      match_importance: m.match_importance || 'regular'
    }))
}

/**
 * 获取产品详情
 */
async function getProductDetails(
  supabase: SupabaseClient,
  skus: string[]
): Promise<Map<string, ProductInfo>> {
  if (skus.length === 0) return new Map()

  const { data } = await supabase
    .from('products')
    .select('sku, name, images, prices, stock_quantities')
    .in('sku', skus)

  const result = new Map<string, ProductInfo>()
  for (const p of data || []) {
    result.set(p.sku, {
      sku: p.sku,
      name: p.name,
      images: p.images || [],
      price: p.prices || {},
      stock: p.stock_quantities || {},
      sales_7d: 0
    })
  }
  return result
}

/**
 * 预检索所有上下文数据
 */
async function retrieveContextData(
  supabase: SupabaseClient,
  country: string
): Promise<RetrievedContext> {
  console.log(`=== Retrieving context for ${country} ===`)
  
  const site = getSiteByCountry(country)
  
  // 并行获取数据
  const [salesData, matches] = await Promise.all([
    getSalesData(supabase, site, 7, 30),
    getUpcomingMatches(supabase, country, 14)
  ])

  // 获取热销产品的详细信息
  const skus = salesData.top_products.map(p => p.sku)
  const productDetails = await getProductDetails(supabase, skus)

  // 合并销量数据
  for (const sale of salesData.top_products) {
    const detail = productDetails.get(sale.sku)
    if (detail) {
      detail.sales_7d = sale.total_quantity
    }
  }

  console.log(`Retrieved: ${salesData.top_products.length} products, ${matches.length} matches`)

  return {
    sales_data: salesData,
    matches,
    product_details: productDetails,
    valid_skus: new Set(skus)
  }
}

// ==================== Gemini + Grounding ====================

/**
 * 调用 Gemini API（带 Google Search Grounding）
 */
async function callGeminiWithGrounding(prompt: string): Promise<{
  text: string
  grounding_sources?: string[]
}> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{
        google_search_retrieval: {
          dynamic_retrieval_config: {
            mode: "MODE_DYNAMIC",
            dynamic_threshold: 0.5
          }
        }
      }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 8192
      }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Gemini API error:', error)
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text || ''
  
  // 提取 Grounding 来源
  const groundingMetadata = candidate?.groundingMetadata
  const sources = groundingMetadata?.groundingChunks?.map((c: any) => 
    c.web?.uri || c.web?.title
  ).filter(Boolean) || []

  return { text, grounding_sources: sources }
}

/**
 * 构建分析 Prompt
 */
function buildAnalysisPrompt(context: RetrievedContext, country: string): string {
  const site = getSiteByCountry(country)
  
  // 格式化销售数据
  const salesList = context.sales_data.top_products.slice(0, 20).map((p, i) => 
    `${i + 1}. SKU: ${p.sku} | 名称: ${p.name} | 近7天销量: ${p.total_quantity}`
  ).join('\n')

  // 格式化赛程
  const matchList = context.matches.slice(0, 15).map(m => {
    const date = new Date(m.match_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    const importance = m.match_importance === 'derby' ? '[德比]' : 
                       m.match_importance === 'final' ? '[决赛]' : ''
    return `- ${date}: ${m.home_team} vs ${m.away_team} (${m.competition_name}) ${importance}`
  }).join('\n')

  return `你是足球球衣销售顾问。基于以下**真实数据**生成投放建议。

## 真实销售数据（${context.sales_data.site}站，近${context.sales_data.period}，共${context.sales_data.total_orders}单）

${salesList}

## 未来14天赛程（${country}市场相关）

${matchList || '暂无相关赛程'}

## 任务

1. 从上面的销售数据中，选出 5-8 个最值得投放的产品
2. 结合赛程，给出投放时机建议
3. 你可以搜索互联网获取球队最新新闻/热度信息

## 输出格式（必须是 JSON）

{
  "summary": "一句话总结投放建议（中文）",
  "recommendations": [
    {
      "sku": "必须是上面列表中的SKU，不要编造",
      "product_name": "产品名称",
      "reason": "推荐理由（中文，30字以内）",
      "related_match": "关联的比赛（如有）",
      "timing": "建议投放时间",
      "hot_news": "相关热点新闻（如有，来自搜索）"
    }
  ]
}

重要规则：
- SKU 必须来自上面的真实销售数据列表
- 不要编造任何 SKU
- 只输出 JSON，不要其他文字
- 使用简体中文`
}

/**
 * 解析 AI 响应
 */
function parseAIResponse(response: string): {
  summary: string
  recommendations: Array<{
    sku: string
    product_name: string
    reason: string
    related_match?: string
    timing: string
    hot_news?: string
  }>
} | null {
  try {
    // 直接解析
    const parsed = JSON.parse(response)
    if (parsed.summary && Array.isArray(parsed.recommendations)) {
      return parsed
    }
  } catch {
    // 从代码块提取
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        if (parsed.summary && Array.isArray(parsed.recommendations)) {
          return parsed
        }
      } catch {}
    }
    
    // 查找 JSON 对象
    const objectMatch = response.match(/\{[\s\S]*"summary"[\s\S]*"recommendations"[\s\S]*\}/)
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0])
        if (parsed.summary && Array.isArray(parsed.recommendations)) {
          return parsed
        }
      } catch {}
    }
  }
  return null
}

/**
 * 验证并填充推荐数据
 */
function validateAndEnrichRecommendations(
  aiOutput: NonNullable<ReturnType<typeof parseAIResponse>>,
  context: RetrievedContext
): Recommendation[] {
  const validated: Recommendation[] = []

  for (const rec of aiOutput.recommendations) {
    // 验证 SKU 存在
    if (!context.valid_skus.has(rec.sku)) {
      console.warn(`Invalid SKU: ${rec.sku}, skipping`)
      continue
    }

    // 获取产品详情
    const product = context.product_details.get(rec.sku)
    if (!product) {
      console.warn(`Product not found: ${rec.sku}, skipping`)
      continue
    }

    validated.push({
      sku: rec.sku,
      product_name: rec.product_name || product.name,
      reason: rec.reason,
      related_match: rec.related_match,
      timing: rec.timing,
      hot_news: rec.hot_news,
      sales_7d: product.sales_7d,
      images: product.images,
      price: product.price
    })
  }

  return validated
}

// ==================== 主逻辑 ====================

/**
 * 生成推荐（RAG + Grounding）
 */
async function generateRecommendation(
  supabase: SupabaseClient,
  country: string
): Promise<StructuredResult> {
  const startTime = Date.now()

  // 1. 预检索数据 (RAG)
  console.log('Step 1: Retrieving context data...')
  const context = await retrieveContextData(supabase, country)

  if (context.sales_data.top_products.length === 0) {
    return {
      summary: '暂无销售数据',
      recommendations: [],
      generated_at: new Date().toISOString(),
      country,
      execution_time_ms: Date.now() - startTime
    }
  }

  // 2. 构建 Prompt
  console.log('Step 2: Building analysis prompt...')
  const prompt = buildAnalysisPrompt(context, country)

  // 3. 调用 Gemini + Grounding
  console.log('Step 3: Calling Gemini with Grounding...')
  const { text, grounding_sources } = await callGeminiWithGrounding(prompt)

  // 4. 解析响应
  console.log('Step 4: Parsing AI response...')
  const parsed = parseAIResponse(text)

  if (!parsed) {
    console.error('Failed to parse AI response:', text)
    return {
      summary: '解析失败',
      recommendations: [],
      generated_at: new Date().toISOString(),
      country,
      execution_time_ms: Date.now() - startTime
    }
  }

  // 5. 验证并填充数据
  console.log('Step 5: Validating recommendations...')
  const recommendations = validateAndEnrichRecommendations(parsed, context)

  console.log(`Generated ${recommendations.length} valid recommendations`)

  return {
    summary: parsed.summary,
    grounding_sources,
    recommendations,
    generated_at: new Date().toISOString(),
    country,
    execution_time_ms: Date.now() - startTime
  }
}

/**
 * 保存推荐历史
 */
async function saveRecommendationHistory(
  supabase: SupabaseClient,
  result: StructuredResult
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  
  await supabase
    .from('recommendation_history')
    .upsert({
      target_country: result.country,
      recommendation_date: today,
      agent_version: 'v4-rag-grounding',
      input_factors: {
        date: today,
        model: GEMINI_MODEL,
        grounding: true
      },
      agent_reasoning: `RAG + Grounding: ${result.recommendations.length} products`,
      tool_calls: [],
      recommendations: {
        summary: result.summary,
        grounding_sources: result.grounding_sources,
        products: result.recommendations.map(r => ({
          sku: r.sku,
          name: r.product_name,
          reason: r.reason,
          sales_7d: r.sales_7d
        }))
      },
      execution_time_ms: result.execution_time_ms
    }, {
      onConflict: 'target_country,recommendation_date'
    })
}

// ==================== HTTP Handler ====================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = getSupabaseClient()
    const { action, country, ...params } = await req.json()

    switch (action) {
      case 'generate': {
        if (!country) {
          return new Response(
            JSON.stringify({ error: 'Country is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`=== Starting RAG + Grounding for ${country} ===`)
        const result = await generateRecommendation(supabase, country)
        
        // 保存历史
        await saveRecommendationHistory(supabase, result)

        return new Response(
          JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'history': {
        const { limit = 10 } = params
        
        const { data } = await supabase
          .from('recommendation_history')
          .select('*')
          .order('recommendation_date', { ascending: false })
          .limit(limit)

        return new Response(
          JSON.stringify({ success: true, history: data }),
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
