/**
 * Supabase Edge Function: 图片清理
 * 安全地调用各 WordPress 站点的清理接口
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 站点配置（密钥存储在 Edge Function 环境变量中）
type Site = 'com' | 'uk' | 'de' | 'fr'

const SITE_URLS: Record<Site, string> = {
  com: 'https://jerseysfever.com',
  uk: 'https://jerseysfever.uk',
  de: 'https://jerseysfever.de',
  fr: 'https://jerseysfever.fr',
}

// PIM 清理接口的密钥（通过环境变量配置）
const PIM_CLEANUP_SECRET = Deno.env.get('PIM_CLEANUP_SECRET') || 'pim-cleanup-secret-2024'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { site, productId } = await req.json()

    // 验证参数
    if (!site || !productId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing site or productId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 验证站点
    if (!['com', 'uk', 'de', 'fr'].includes(site)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid site' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const siteUrl = SITE_URLS[site as Site]
    const cleanupUrl = `${siteUrl}/wp-json/pim/v1/cleanup-images`

    console.log(`Calling cleanup API: ${cleanupUrl} for product ${productId}`)

    // 调用 WordPress 清理接口
    const response = await fetch(cleanupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PIM-Secret': PIM_CLEANUP_SECRET,
      },
      body: JSON.stringify({ product_id: productId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Cleanup API error: ${response.status} - ${errorText}`)
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `WordPress API error: ${response.status}`,
          details: errorText,
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()
    console.log(`Cleanup result for ${site}:`, result)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Cleanup function error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

