import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wc-webhook-signature, x-wc-webhook-topic, x-wc-webhook-source, x-wc-webhook-delivery-id',
}

// WooCommerce Webhook 事件类型
type WebhookTopic = 'product.created' | 'product.updated' | 'product.deleted'

// 有效站点
type Site = 'com' | 'uk' | 'de' | 'fr'

// 站点域名映射
const SITE_MAP: Record<string, Site> = {
  'jerseysfever.com': 'com',
  'www.jerseysfever.com': 'com',
  'jerseysfever.uk': 'uk',
  'www.jerseysfever.uk': 'uk',
  'jerseysfever.co.uk': 'uk',
  'www.jerseysfever.co.uk': 'uk',
  'jerseysfever.de': 'de',
  'www.jerseysfever.de': 'de',
  'jerseysfever.fr': 'fr',
  'www.jerseysfever.fr': 'fr',
}

// 所有站点列表
const ALL_SITES: Site[] = ['com', 'uk', 'de', 'fr']

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 获取原始请求体
    const rawBody = await req.text()
    
    // 获取 Webhook 信息
    const topic = req.headers.get('x-wc-webhook-topic') as WebhookTopic
    const source = req.headers.get('x-wc-webhook-source') || ''
    const deliveryId = req.headers.get('x-wc-webhook-delivery-id') || ''

    console.log(`[${deliveryId}] Received webhook: topic=${topic}, source=${source}, bodyLength=${rawBody.length}`)

    // 处理 ping 请求（WooCommerce 验证 webhook 时发送）
    // topic 可能是 null 或 "action.wc_webhook_ping"
    if (!topic || topic.includes('ping') || !rawBody || rawBody.trim() === '' || rawBody === '[]') {
      console.log(`[${deliveryId}] Ping request received (topic=${topic}), returning success`)
      return new Response(JSON.stringify({ success: true, message: 'Ping received' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 解析 JSON
    let product: any
    try {
      product = JSON.parse(rawBody)
    } catch (parseErr) {
      console.error(`[${deliveryId}] JSON parse error:`, parseErr, 'Raw body:', rawBody.substring(0, 500))
      // 即使解析失败也返回 200，避免 WooCommerce 禁用 webhook
      return new Response(JSON.stringify({ success: true, message: 'Received but failed to parse' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 检查是否是 ping 数据（包含 webhook_id 但没有商品数据）
    if (product && product.webhook_id && !product.id) {
      console.log(`[${deliveryId}] Webhook ping with webhook_id=${product.webhook_id}`)
      return new Response(JSON.stringify({ success: true, message: 'Webhook ping received' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 检查必要字段
    if (!product || typeof product !== 'object' || (!product.id && !product.sku)) {
      console.log(`[${deliveryId}] Invalid product data, returning success anyway`)
      return new Response(JSON.stringify({ success: true, message: 'Received but no valid product data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 也支持通过 query parameter 指定站点
    const url = new URL(req.url)
    const siteParam = url.searchParams.get('site') as Site | null

    // 解析来源站点
    let site: Site = 'com'
    if (siteParam && ALL_SITES.includes(siteParam)) {
      site = siteParam
    } else if (source) {
      try {
        const sourceUrl = new URL(source)
        site = SITE_MAP[sourceUrl.hostname] || 'com'
      } catch {
        console.warn('Invalid source URL:', source)
      }
    }

    console.log(`[${deliveryId}] Processing ${topic} from ${site}: id=${product.id}, type=${product.type}, sku=${product.sku}, name=${product.name}`)

    // 创建 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 🔴 重要：如果是变体，使用 parent_id；否则使用 id
    // WooCommerce 更新变体时会发送变体数据，此时 product.id 是变体 ID
    const isVariation = product.type === 'variation'
    const productId = isVariation ? product.parent_id : product.id

    if (isVariation) {
      console.log(`[${deliveryId}] Product is a variation, using parent_id=${product.parent_id} instead of variation_id=${product.id}`)
    }

    // 获取 SKU
    const sku = product.sku || `WOO-${productId}`

    // ==================== 处理商品删除 ====================
    if (topic === 'product.deleted') {
      // 如果删除的是变体，跳过处理（只有父商品删除才需要更新记录）
      if (isVariation) {
        console.log(`[${deliveryId}] Skipping variation delete for ${sku} (variation_id=${product.id})`)
        return new Response(JSON.stringify({ success: true, action: 'skipped', reason: 'variation_delete', sku }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: existing } = await supabase
        .from('products')
        .select('sku, woo_ids, sync_status')
        .eq('sku', sku)
        .single()

      if (existing) {
        const newWooIds = { ...existing.woo_ids }
        delete newWooIds[site]

        const newSyncStatus = { ...existing.sync_status, [site]: 'deleted' }

        // 如果所有站点都被删除，删除整个记录
        if (Object.keys(newWooIds).length === 0) {
          await supabase.from('products').delete().eq('sku', sku)
          console.log(`[${deliveryId}] Deleted product ${sku}`)
        } else {
          await supabase.from('products').update({
            woo_ids: newWooIds,
            sync_status: newSyncStatus,
          }).eq('sku', sku)
          console.log(`[${deliveryId}] Marked ${site} as deleted for ${sku}`)
        }
      }

      return new Response(JSON.stringify({ success: true, action: 'deleted', sku }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ==================== 处理商品创建/更新 ====================

    // 查找现有商品
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('sku', sku)
      .single()

    // 提取商品数据
    const salePrice = parseFloat(product.sale_price) || 0
    const regularPrice = parseFloat(product.regular_price) || 0
    const currentPrice = parseFloat(product.price) || 0
    const productPrice = salePrice || currentPrice || regularPrice // 优先促销价
    const productRegularPrice = regularPrice || currentPrice // 原价/划线价
    const productStockQty = product.stock_quantity ?? 100
    const productStockStatus = product.stock_status || 'instock'
    const productStatus = product.status || 'publish'
    const productDateModified = product.date_modified || null
    const productDateCreated = product.date_created || null

    // 提取图片 URL
    const images = (product.images || []).map((img: { src: string }) => img.src)

    // 提取分类名称
    const categories = (product.categories || []).map((c: { name: string }) => c.name)

    // 提取商品属性（处理 WooCommerce 的属性名格式）
    const attributes: Record<string, string | string[]> = {}
    for (const attr of product.attributes || []) {
      const attrName = (attr.name || '').toLowerCase().replace(/[^a-z]/g, '') // 移除非字母字符
      const value = attr.options?.[0] || ''
      
      // 映射属性名
      if (attrName === 'genderage' || attrName === 'gender') {
        attributes.gender = value
      } else if (attrName === 'season') {
        attributes.season = value
      } else if (attrName === 'jerseytype' || attrName === 'type') {
        attributes.type = value
      } else if (attrName === 'style' || attrName === 'version') {
        attributes.version = value
      } else if (attrName === 'sleevelength' || attrName === 'sleeve') {
        attributes.sleeve = value
      } else if (attrName === 'team') {
        attributes.team = value
      } else if (attrName === 'event' || attrName === 'events') {
        attributes.events = attr.options || []
      }
    }

    // 构建该站点的内容
    const siteContent = {
      name: product.name,
      description: product.description || '',
      short_description: product.short_description || '',
    }

    if (!existing) {
      // ==================== 新建商品 ====================
      // 初始化所有站点的 JSONB 字段
      const newProduct = {
        sku,
        name: product.name,
        slug: product.slug || null,
        images,
        categories,
        attributes: Object.keys(attributes).length > 0 ? attributes : {},
        
        // 各站点独立数据（使用父商品 ID，不是变体 ID）
        woo_ids: { [site]: productId },
        prices: { [site]: productPrice },
        regular_prices: { [site]: productRegularPrice },
        stock_quantities: { [site]: productStockQty },
        stock_statuses: { [site]: productStockStatus },
        statuses: { [site]: productStatus },
        content: { [site]: siteContent },
        sync_status: { [site]: 'synced' },
        date_modified: productDateModified ? { [site]: productDateModified } : {},
        published_at: productDateCreated, // 发布时间取 date_created
        
        last_synced_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('products').insert(newProduct)
      if (error) {
        console.error(`[${deliveryId}] Error inserting product:`, error)
        throw error
      }

      console.log(`[${deliveryId}] Created product ${sku} from ${site}`)

    } else {
      // ==================== 更新现有商品 ====================
      
      // 智能合并站点内容：如果 webhook 收到的是空的，保留现有非空数据
      const existingSiteContent = existing.content?.[site] || {}
      const mergedSiteContent = {
        name: siteContent.name || existingSiteContent.name || '',
        description: siteContent.description || existingSiteContent.description || '',
        short_description: siteContent.short_description || existingSiteContent.short_description || '',
      }
      
      const updateData: Record<string, unknown> = {
        // 更新该站点的独立数据（使用父商品 ID，不是变体 ID）
        woo_ids: { ...existing.woo_ids, [site]: productId },
        prices: { ...existing.prices, [site]: productPrice },
        regular_prices: { ...(existing.regular_prices || {}), [site]: productRegularPrice },
        stock_quantities: { ...existing.stock_quantities, [site]: productStockQty },
        stock_statuses: { ...existing.stock_statuses, [site]: productStockStatus },
        statuses: { ...existing.statuses, [site]: productStatus },
        content: { ...existing.content, [site]: mergedSiteContent },
        sync_status: { ...existing.sync_status, [site]: 'synced' },
        date_modified: { ...(existing.date_modified || {}), [site]: productDateModified },
        last_synced_at: new Date().toISOString(),
      }

      // 如果是主站 (.com)，也更新共享数据（但要智能合并，不覆盖已有数据）
      if (site === 'com') {
        // 名称：优先使用 webhook 数据
        if (product.name) {
          updateData.name = product.name
        }
        updateData.slug = product.slug || existing.slug || null
        
        // 图片：只有当 webhook 有图片时才更新（避免覆盖已有图片）
        if (images && images.length > 0) {
          updateData.images = images
        }
        
        // 分类：只有当 webhook 有分类时才更新（避免覆盖已有分类）
        if (categories && categories.length > 0) {
          updateData.categories = categories
        }
        
        // 属性：只有当 webhook 有属性时才更新
        if (Object.keys(attributes).length > 0) {
          updateData.attributes = attributes
        }
        
        // 更新发布时间（如果现有记录没有）
        if (!existing.published_at && productDateCreated) {
          updateData.published_at = productDateCreated
        }
      }

      const { error } = await supabase
        .from('products')
        .update(updateData)
        .eq('sku', sku)

      if (error) {
        console.error(`[${deliveryId}] Error updating product:`, error)
        throw error
      }

      console.log(`[${deliveryId}] Updated ${site} data for ${sku} (smart merge applied)`)
    }

    return new Response(JSON.stringify({
      success: true,
      action: topic === 'product.created' ? 'created' : 'updated',
      sku,
      site,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
