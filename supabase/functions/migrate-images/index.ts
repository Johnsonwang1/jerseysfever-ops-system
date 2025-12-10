/**
 * Supabase Edge Function: migrate-images
 * 
 * 将产品图片从 WooCommerce (.com) 迁移到 Supabase Storage
 * 支持单个产品迁移和批量迁移，使用 MD5 哈希去重
 * 
 * Actions:
 * - migrate-single: 迁移单个产品的图片
 * - migrate-batch: 批量迁移多个产品
 * - get-stats: 获取迁移统计信息
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==================== 类型定义 ====================

interface MigrateSingleRequest {
  action: 'migrate-single'
  sku: string
}

interface MigrateBatchRequest {
  action: 'migrate-batch'
  limit?: number  // 默认 50
  offset?: number // 从第几个开始
}

interface GetStatsRequest {
  action: 'get-stats'
}

type RequestBody = MigrateSingleRequest | MigrateBatchRequest | GetStatsRequest

interface MigrateResult {
  sku: string
  success: boolean
  migrated: number   // 迁移的图片数
  skipped: number    // 跳过的图片数（已在 Storage）
  failed: number     // 失败的图片数
  error?: string
}

// ==================== 工具函数 ====================

/**
 * 生成 MD5 哈希（用于图片去重）
 */
async function md5Hash(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('MD5', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 生成唯一的 Storage 文件名（基于原 URL 哈希）
 */
async function getStorageFilename(url: string, sku: string): Promise<string> {
  const hash = (await md5Hash(url)).slice(0, 12)
  const urlPath = url.split('?')[0]
  const ext = urlPath.split('.').pop()?.toLowerCase() || 'jpg'
  const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg'
  const cleanSku = sku.replace(/[^a-zA-Z0-9-]/g, '_')
  return `products/${cleanSku}/${hash}.${validExt}`
}

/**
 * 检查图片是否已存在于 Storage
 */
async function checkImageExists(supabase: any, filename: string): Promise<boolean> {
  const parts = filename.split('/')
  const dir = parts.slice(0, -1).join('/')
  const name = parts[parts.length - 1]
  
  const { data } = await supabase.storage
    .from('product-images')
    .list(dir)
  
  return data?.some((f: any) => f.name === name) ?? false
}

/**
 * 判断 URL 是否是 .com 图片（需要迁移）
 */
function needsMigration(url: string): boolean {
  return url.includes('jerseysfever.com') && !url.includes('supabase')
}

/**
 * 判断 URL 是否已在 Storage
 */
function isStorageUrl(url: string): boolean {
  return url.includes('supabase.co') || url.includes('supabase.in')
}

/**
 * 转存单张图片到 Supabase Storage
 */
async function transferImage(
  supabase: any,
  imageUrl: string,
  sku: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const filename = await getStorageFilename(imageUrl, sku)
    
    // 检查是否已存在（哈希去重）
    const exists = await checkImageExists(supabase, filename)
    if (exists) {
      const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
      return { success: true, url: data.publicUrl }
    }
    
    // 下载图片
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'JerseysFever-Migration/1.0',
      },
    })
    
    if (!response.ok) {
      return { success: false, error: `下载失败: ${response.status}` }
    }
    
    const imageData = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    
    // 上传到 Storage
    const { error } = await supabase.storage
      .from('product-images')
      .upload(filename, imageData, {
        contentType,
        upsert: false,
      })
    
    if (error) {
      if (error.message?.includes('already exists') || error.message?.includes('Duplicate')) {
        const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
        return { success: true, url: data.publicUrl }
      }
      return { success: false, error: `上传失败: ${error.message}` }
    }
    
    const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
    return { success: true, url: data.publicUrl }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ==================== 迁移函数 ====================

/**
 * 迁移单个产品的图片
 */
async function migrateSingleProduct(
  supabase: any,
  sku: string
): Promise<MigrateResult> {
  console.log(`🖼️ 开始迁移 ${sku} 的图片...`)
  const startTime = Date.now()
  
  // 获取产品数据
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('images')
    .eq('sku', sku)
    .single()
  
  if (fetchError || !product) {
    return { sku, success: false, migrated: 0, skipped: 0, failed: 0, error: '产品不存在' }
  }
  
  const images = product.images || []
  if (images.length === 0) {
    return { sku, success: true, migrated: 0, skipped: 0, failed: 0 }
  }
  
  const newUrls: string[] = []
  let migrated = 0
  let skipped = 0
  let failed = 0
  
  for (const url of images) {
    // 已在 Storage，跳过
    if (isStorageUrl(url)) {
      newUrls.push(url)
      skipped++
      continue
    }
    
    // 不是 .com 图片，保留原 URL
    if (!needsMigration(url)) {
      newUrls.push(url)
      skipped++
      continue
    }
    
    // 迁移到 Storage
    const result = await transferImage(supabase, url, sku)
    if (result.success && result.url) {
      newUrls.push(result.url)
      migrated++
    } else {
      console.warn(`[${sku}] 迁移失败: ${url} - ${result.error}`)
      newUrls.push(url) // 保留原 URL
      failed++
    }
  }
  
  // 更新数据库中的图片 URL
  if (migrated > 0) {
    const { error: updateError } = await supabase
      .from('products')
      .update({ images: newUrls })
      .eq('sku', sku)
    
    if (updateError) {
      console.error(`[${sku}] 更新数据库失败:`, updateError)
      return { sku, success: false, migrated, skipped, failed, error: '更新数据库失败' }
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`✅ [${sku}] 完成: ${migrated} 迁移, ${skipped} 跳过, ${failed} 失败 (${duration}s)`)
  
  return { sku, success: true, migrated, skipped, failed }
}

/**
 * 批量迁移产品图片
 */
async function migrateBatch(
  supabase: any,
  limit: number = 50,
  offset: number = 0
): Promise<{ results: MigrateResult[]; total: number; hasMore: boolean }> {
  console.log(`🚀 批量迁移: limit=${limit}, offset=${offset}`)
  const startTime = Date.now()
  
  // 获取需要迁移的产品（图片 URL 包含 jerseysfever.com）
  // 先获取所有有图片的产品，然后在代码中过滤
  const { data: products, error: fetchError, count } = await supabase
    .from('products')
    .select('sku, images', { count: 'exact' })
    .not('images', 'is', null)
    .order('sku')
    .range(offset, offset + limit - 1)
  
  if (fetchError) {
    console.error('获取产品列表失败:', fetchError)
    return { results: [], total: 0, hasMore: false }
  }
  
  // 过滤出需要迁移的产品（至少有一张 .com 图片）
  const productsToMigrate = (products || []).filter((p: any) => 
    (p.images || []).some((url: string) => needsMigration(url))
  )
  
  console.log(`📦 找到 ${productsToMigrate.length} 个产品需要迁移`)
  
  const results: MigrateResult[] = []
  
  for (const product of productsToMigrate) {
    const result = await migrateSingleProduct(supabase, product.sku)
    results.push(result)
    
    // 每处理 10 个产品暂停一下，避免过载
    if (results.length % 10 === 0) {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  const successCount = results.filter(r => r.success).length
  const totalMigrated = results.reduce((sum, r) => sum + r.migrated, 0)
  
  console.log(`🏁 批量迁移完成: ${successCount}/${results.length} 成功, ${totalMigrated} 张图片 (${totalDuration}s)`)
  
  return {
    results,
    total: count || 0,
    hasMore: (offset + limit) < (count || 0),
  }
}

/**
 * 获取迁移统计信息
 */
async function getMigrationStats(supabase: any): Promise<{
  totalProducts: number
  productsWithImages: number
  productsNeedMigration: number
  totalImages: number
  imagesOnCom: number
  imagesOnStorage: number
}> {
  // 获取所有有图片的产品
  const { data: products, error } = await supabase
    .from('products')
    .select('sku, images')
    .not('images', 'is', null)
  
  if (error) {
    console.error('获取统计信息失败:', error)
    return {
      totalProducts: 0,
      productsWithImages: 0,
      productsNeedMigration: 0,
      totalImages: 0,
      imagesOnCom: 0,
      imagesOnStorage: 0,
    }
  }
  
  let productsNeedMigration = 0
  let totalImages = 0
  let imagesOnCom = 0
  let imagesOnStorage = 0
  
  for (const product of products || []) {
    const images = product.images || []
    totalImages += images.length
    
    let hasComImage = false
    for (const url of images) {
      if (needsMigration(url)) {
        imagesOnCom++
        hasComImage = true
      } else if (isStorageUrl(url)) {
        imagesOnStorage++
      }
    }
    
    if (hasComImage) {
      productsNeedMigration++
    }
  }
  
  // 获取总产品数
  const { count: totalCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
  
  return {
    totalProducts: totalCount || 0,
    productsWithImages: products?.length || 0,
    productsNeedMigration,
    totalImages,
    imagesOnCom,
    imagesOnStorage,
  }
}

// ==================== 主入口 ====================

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()

    // 创建 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    switch (body.action) {
      case 'migrate-single': {
        const result = await migrateSingleProduct(supabase, body.sku)
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'migrate-batch': {
        const result = await migrateBatch(supabase, body.limit || 50, body.offset || 0)
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get-stats': {
        const stats = await getMigrationStats(supabase)
        return new Response(JSON.stringify({ success: true, stats }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})



