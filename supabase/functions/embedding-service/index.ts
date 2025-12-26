/**
 * Embedding Service Edge Function
 * 
 * 使用 Gemini text-embedding-004 生成向量嵌入
 * 支持产品和球队的 embedding 生成
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const EMBEDDING_MODEL = 'text-embedding-004'
const EMBEDDING_DIMENSION = 768

interface EmbeddingResponse {
  embedding: {
    values: number[]
  }
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(supabaseUrl, supabaseKey)
}

/**
 * 使用 Gemini 生成 embedding
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: {
        parts: [{ text }]
      }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Gemini embedding error:', error)
    throw new Error(`Embedding API error: ${response.status}`)
  }

  const data: EmbeddingResponse = await response.json()
  return data.embedding.values
}

/**
 * 批量生成 embedding（带速率限制）
 */
async function generateEmbeddingsBatch(
  texts: string[],
  delayMs: number = 100
): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = []
  
  for (const text of texts) {
    try {
      const embedding = await generateEmbedding(text)
      results.push(embedding)
      
      // 速率限制
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    } catch (error) {
      console.error(`Error generating embedding for "${text}":`, error)
      results.push(null)
    }
  }
  
  return results
}

/**
 * 为产品生成 embedding
 */
async function generateProductEmbeddings(
  supabase: ReturnType<typeof getSupabaseClient>,
  limit: number = 100,
  forceRegenerate: boolean = false
): Promise<{ processed: number; errors: number }> {
  // 获取需要生成 embedding 的产品
  let query = supabase
    .from('products')
    .select('sku, name')
    .limit(limit)

  if (!forceRegenerate) {
    query = query.is('name_embedding', null)
  }

  const { data: products, error } = await query

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`)
  }

  if (!products || products.length === 0) {
    return { processed: 0, errors: 0 }
  }

  console.log(`Processing ${products.length} products...`)

  let processed = 0
  let errors = 0

  // 批量处理
  const BATCH_SIZE = 10
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)
    
    for (const product of batch) {
      try {
        const embedding = await generateEmbedding(product.name)
        
        const { error: updateError } = await supabase
          .from('products')
          .update({ name_embedding: embedding })
          .eq('sku', product.sku)

        if (updateError) {
          console.error(`Error updating product ${product.sku}:`, updateError)
          errors++
        } else {
          processed++
          console.log(`✓ ${product.sku}: ${product.name.substring(0, 50)}...`)
        }
      } catch (err) {
        console.error(`Error processing product ${product.sku}:`, err)
        errors++
      }
      
      // 速率限制
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return { processed, errors }
}

/**
 * 为球队生成 embedding
 */
async function generateTeamEmbeddings(
  supabase: ReturnType<typeof getSupabaseClient>,
  forceRegenerate: boolean = false
): Promise<{ processed: number; errors: number }> {
  // 获取需要生成 embedding 的球队
  let query = supabase
    .from('team_knowledge')
    .select('id, canonical_name, short_name, aliases, league')

  if (!forceRegenerate) {
    query = query.is('embedding', null)
  }

  const { data: teams, error } = await query

  if (error) {
    throw new Error(`Failed to fetch teams: ${error.message}`)
  }

  if (!teams || teams.length === 0) {
    return { processed: 0, errors: 0 }
  }

  console.log(`Processing ${teams.length} teams...`)

  let processed = 0
  let errors = 0

  for (const team of teams) {
    try {
      // 构建丰富的文本表示
      const aliases = team.aliases || []
      const textParts = [
        team.canonical_name,
        team.short_name,
        ...aliases.slice(0, 5),  // 最多5个别名
        team.league
      ].filter(Boolean)
      
      const text = textParts.join(' ')
      const embedding = await generateEmbedding(text)
      
      const { error: updateError } = await supabase
        .from('team_knowledge')
        .update({ embedding })
        .eq('id', team.id)

      if (updateError) {
        console.error(`Error updating team ${team.canonical_name}:`, updateError)
        errors++
      } else {
        processed++
        console.log(`✓ ${team.canonical_name}`)
      }
    } catch (err) {
      console.error(`Error processing team ${team.canonical_name}:`, err)
      errors++
    }
    
    // 速率限制
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return { processed, errors }
}

/**
 * 向量搜索产品
 */
async function searchProducts(
  supabase: ReturnType<typeof getSupabaseClient>,
  query: string,
  limit: number = 10,
  threshold: number = 0.5
) {
  const embedding = await generateEmbedding(query)
  
  const { data, error } = await supabase.rpc('match_products', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit
  })

  if (error) {
    throw new Error(`Search failed: ${error.message}`)
  }

  return data || []
}

/**
 * 向量搜索球队
 */
async function searchTeams(
  supabase: ReturnType<typeof getSupabaseClient>,
  query: string,
  limit: number = 5,
  threshold: number = 0.5
) {
  const embedding = await generateEmbedding(query)
  
  const { data, error } = await supabase.rpc('match_teams', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit
  })

  if (error) {
    throw new Error(`Search failed: ${error.message}`)
  }

  return data || []
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
      case 'generate-product-embeddings': {
        const { limit = 100, force = false } = params
        const result = await generateProductEmbeddings(supabase, limit, force)
        
        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'generate-team-embeddings': {
        const { force = false } = params
        const result = await generateTeamEmbeddings(supabase, force)
        
        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'generate-all': {
        const { limit = 100, force = false } = params
        
        console.log('Generating team embeddings...')
        const teamsResult = await generateTeamEmbeddings(supabase, force)
        
        console.log('Generating product embeddings...')
        const productsResult = await generateProductEmbeddings(supabase, limit, force)
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            teams: teamsResult,
            products: productsResult
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'search-products': {
        const { query, limit = 10, threshold = 0.5 } = params
        
        if (!query) {
          return new Response(
            JSON.stringify({ error: 'Query is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        const results = await searchProducts(supabase, query, limit, threshold)
        
        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'search-teams': {
        const { query, limit = 5, threshold = 0.5 } = params
        
        if (!query) {
          return new Response(
            JSON.stringify({ error: 'Query is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        const results = await searchTeams(supabase, query, limit, threshold)
        
        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'embed-text': {
        // 直接生成单个文本的 embedding
        const { text } = params
        
        if (!text) {
          return new Response(
            JSON.stringify({ error: 'Text is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        const embedding = await generateEmbedding(text)
        
        return new Response(
          JSON.stringify({ success: true, embedding, dimension: embedding.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'stats': {
        // 获取 embedding 统计信息
        const { data: productsTotal } = await supabase
          .from('products')
          .select('sku', { count: 'exact', head: true })

        const { data: productsWithEmbedding } = await supabase
          .from('products')
          .select('sku', { count: 'exact', head: true })
          .not('name_embedding', 'is', null)

        const { data: teamsTotal } = await supabase
          .from('team_knowledge')
          .select('id', { count: 'exact', head: true })

        const { data: teamsWithEmbedding } = await supabase
          .from('team_knowledge')
          .select('id', { count: 'exact', head: true })
          .not('embedding', 'is', null)

        return new Response(
          JSON.stringify({
            success: true,
            stats: {
              products: {
                total: productsTotal,
                with_embedding: productsWithEmbedding
              },
              teams: {
                total: teamsTotal,
                with_embedding: teamsWithEmbedding
              }
            }
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

