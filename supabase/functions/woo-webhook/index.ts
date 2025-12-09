import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wc-webhook-signature, x-wc-webhook-topic, x-wc-webhook-source, x-wc-webhook-delivery-id',
}

// WooCommerce Webhook 事件类型
type WebhookTopic =
  | 'product.created' | 'product.updated' | 'product.deleted'
  | 'order.created' | 'order.updated' | 'order.deleted'

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

// ==================== WooCommerce API 配置 ====================

const SITE_URLS: Record<Site, string> = {
  com: 'https://jerseysfever.com',
  uk: 'https://jerseysfever.uk',
  de: 'https://jerseysfever.de',
  fr: 'https://jerseysfever.fr',
}

// WooCommerce API 凭证（从环境变量获取）
function getWooCredentials(site: Site): { key: string; secret: string } {
  const key = Deno.env.get(`WOO_${site.toUpperCase()}_KEY`) || ''
  const secret = Deno.env.get(`WOO_${site.toUpperCase()}_SECRET`) || ''
  return { key, secret }
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 直接调用 WooCommerce REST API 获取商品变体
 */
async function fetchVariationsFromWooCommerce(site: Site, productId: number): Promise<any[]> {
  const credentials = getWooCredentials(site)
  if (!credentials.key || !credentials.secret) {
    console.warn(`[${site}] Missing WooCommerce credentials, skipping variations`)
    return []
  }

  const apiUrl = `${SITE_URLS[site]}/wp-json/wc/v3/products/${productId}/variations?per_page=100`
  const auth = btoa(`${credentials.key}:${credentials.secret}`)

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'JerseysFever-Webhook/1.0',
      },
    })

    if (!response.ok) {
      console.warn(`[${site}] Failed to fetch variations: ${response.status}`)
      return []
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      console.warn(`[${site}] Variations API returned non-JSON`)
      return []
    }

    const variations = await response.json()
    return variations.map((v: any) => ({
      id: v.id,
      sku: v.sku || '',
      attributes: (v.attributes || []).map((a: any) => ({
        name: a.name,
        option: a.option,
      })),
      regular_price: v.regular_price || '',
      sale_price: v.sale_price || '',
      stock_quantity: v.stock_quantity,
      stock_status: v.stock_status || 'instock',
    }))
  } catch (err) {
    console.warn(`[${site}] Error fetching variations:`, err)
    return []
  }
}

/**
 * 直接调用 WooCommerce REST API 获取完整商品数据
 * 避免 Edge Function 之间调用的授权问题
 *
 * 包含重试机制，处理 Cloudflare/SiteGround 的间歇性错误：
 * - 速率限制返回 HTML 页面
 * - 502/503/504 网关错误
 */
async function fetchProductFromWooCommerce(site: Site, productId: number, maxRetries = 3): Promise<any> {
  const credentials = getWooCredentials(site)
  if (!credentials.key || !credentials.secret) {
    throw new Error(`Missing WooCommerce credentials for site: ${site}. Key exists: ${!!credentials.key}, Secret exists: ${!!credentials.secret}`)
  }

  const apiUrl = `${SITE_URLS[site]}/wp-json/wc/v3/products/${productId}`
  const auth = btoa(`${credentials.key}:${credentials.secret}`)

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${site}] Fetching product from: ${apiUrl} (attempt ${attempt}/${maxRetries})`)

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'JerseysFever-Webhook/1.0',
        },
      })

      const contentType = response.headers.get('content-type') || ''
      console.log(`[${site}] Response status: ${response.status}, content-type: ${contentType}`)

      // 检查是否是可重试的错误
      const isRetryableStatus = [502, 503, 504, 429, 520, 521, 522, 523, 524].includes(response.status)
      const isHtmlResponse = contentType.includes('text/html')

      // 如果收到 HTML 响应（通常是 Cloudflare/SiteGround 错误页面），这是可重试的
      if (isHtmlResponse && response.ok) {
        const text = await response.text()
        const errorPreview = text.substring(0, 200)
        console.warn(`[${site}] Received HTML instead of JSON (likely WAF/rate limit): ${errorPreview}`)

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000) // 指数退避: 1s, 2s, 4s (最大5s)
          console.log(`[${site}] Retrying in ${delay}ms...`)
          await sleep(delay)
          continue
        }
        throw new Error(`WooCommerce returned HTML response after ${maxRetries} attempts (${contentType}): ${errorPreview}`)
      }

      if (!response.ok) {
        const error = await response.text()

        // 可重试的状态码
        if (isRetryableStatus && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
          console.log(`[${site}] Got ${response.status}, retrying in ${delay}ms...`)
          await sleep(delay)
          continue
        }

        throw new Error(`WooCommerce API error: ${response.status} - ${error.substring(0, 200)}`)
      }

      // 最终检查 content-type
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`WooCommerce returned non-JSON response (${contentType}): ${text.substring(0, 200)}`)
      }

      return response.json()

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // 网络错误也可重试
      if (attempt < maxRetries && (
        lastError.message.includes('fetch failed') ||
        lastError.message.includes('network') ||
        lastError.message.includes('timeout')
      )) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`[${site}] Network error, retrying in ${delay}ms: ${lastError.message}`)
        await sleep(delay)
        continue
      }

      throw lastError
    }
  }

  throw lastError || new Error('Unknown error in fetchProductFromWooCommerce')
}

// ==================== 订单处理函数 ====================

// 转换 WooCommerce 订单数据为数据库格式
function transformWooOrder(wooOrder: any, site: Site): any {
  return {
    order_number: wooOrder.number || wooOrder.id.toString(),
    site,
    woo_id: wooOrder.id,
    status: wooOrder.status,
    currency: wooOrder.currency || 'USD',
    total: parseFloat(wooOrder.total) || 0,
    subtotal: parseFloat(wooOrder.subtotal) || 0,
    shipping_total: parseFloat(wooOrder.shipping_total) || 0,
    discount_total: parseFloat(wooOrder.discount_total) || 0,
    customer_email: wooOrder.billing?.email || null,
    customer_name: [wooOrder.billing?.first_name, wooOrder.billing?.last_name].filter(Boolean).join(' ') || null,
    billing_address: wooOrder.billing || {},
    shipping_address: wooOrder.shipping || {},
    line_items: (wooOrder.line_items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      product_id: item.product_id,
      variation_id: item.variation_id,
      quantity: item.quantity,
      price: parseFloat(item.price) || 0,
      sku: item.sku || '',
      image: item.image || null,
      meta_data: item.meta_data || [],
    })),
    shipping_lines: (wooOrder.shipping_lines || []).map((line: any) => ({
      method_title: line.method_title,
      total: parseFloat(line.total) || 0,
    })),
    payment_method: wooOrder.payment_method || null,
    payment_method_title: wooOrder.payment_method_title || null,
    date_created: wooOrder.date_created ? new Date(wooOrder.date_created).toISOString() : new Date().toISOString(),
    date_paid: wooOrder.date_paid ? new Date(wooOrder.date_paid).toISOString() : null,
    date_completed: wooOrder.date_completed ? new Date(wooOrder.date_completed).toISOString() : null,
    last_synced_at: new Date().toISOString(),
  }
}

// 处理订单 Webhook
async function handleOrderWebhook(
  supabase: any,
  topic: WebhookTopic,
  order: any,
  site: Site,
  deliveryId: string
): Promise<Response> {
  const orderId = order.id
  const orderNumber = order.number || orderId.toString()

  console.log(`[${deliveryId}] Processing order webhook: topic=${topic}, site=${site}, order_id=${orderId}, order_number=${orderNumber}`)

  // 处理订单删除
  if (topic === 'order.deleted') {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('site', site)
      .eq('woo_id', orderId)

    if (error) {
      console.error(`[${deliveryId}] Error deleting order:`, error)
    } else {
      console.log(`[${deliveryId}] Deleted order ${orderNumber} from ${site}`)
    }

    return new Response(JSON.stringify({ success: true, action: 'deleted', order_number: orderNumber, site }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 处理订单创建/更新
  const orderData = transformWooOrder(order, site)

  const { error } = await supabase
    .from('orders')
    .upsert(orderData, {
      onConflict: 'site,woo_id',
      ignoreDuplicates: false,
    })

  if (error) {
    console.error(`[${deliveryId}] Error upserting order:`, error)
    throw error
  }

  const action = topic === 'order.created' ? 'created' : 'updated'
  console.log(`[${deliveryId}] ${action} order ${orderNumber} from ${site}`)

  return new Response(JSON.stringify({ success: true, action, order_number: orderNumber, site }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ==================== 主入口 ====================

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
    let data: any
    try {
      data = JSON.parse(rawBody)
    } catch (parseErr) {
      console.error(`[${deliveryId}] JSON parse error:`, parseErr, 'Raw body:', rawBody.substring(0, 500))
      // 即使解析失败也返回 200，避免 WooCommerce 禁用 webhook
      return new Response(JSON.stringify({ success: true, message: 'Received but failed to parse' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 检查是否是 ping 数据（包含 webhook_id 但没有实际数据）
    if (data && data.webhook_id && !data.id) {
      console.log(`[${deliveryId}] Webhook ping with webhook_id=${data.webhook_id}`)
      return new Response(JSON.stringify({ success: true, message: 'Webhook ping received' }), {
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

    // 创建 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ==================== 处理订单 Webhook ====================
    if (topic.startsWith('order.')) {
      if (!data || !data.id) {
        console.log(`[${deliveryId}] Invalid order data, returning success anyway`)
        return new Response(JSON.stringify({ success: true, message: 'Received but no valid order data' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return await handleOrderWebhook(supabase, topic, data, site, deliveryId)
    }

    // ==================== 处理商品 Webhook ====================
    const product = data

    // 检查必要字段
    if (!product || typeof product !== 'object' || (!product.id && !product.sku)) {
      console.log(`[${deliveryId}] Invalid product data, returning success anyway`)
      return new Response(JSON.stringify({ success: true, message: 'Received but no valid product data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ==================== Webhook 只作为触发器，提取关键信息 ====================
    // 从 webhook 数据中提取：站点、商品 ID、是否是变体
    // 然后通过 API 获取完整的主商品数据

    const webhookProductId = product.id
    const webhookParentId = product.parent_id
    const isVariation = webhookParentId && webhookParentId > 0

    // 如果是变体，使用 parent_id 获取主商品；否则使用 product.id
    const mainProductId = isVariation ? webhookParentId : webhookProductId

    console.log(`[${deliveryId}] Processing ${topic} from ${site}: webhook_id=${webhookProductId}, parent_id=${webhookParentId}, isVariation=${isVariation}, mainProductId=${mainProductId}`)

    // ==================== 处理商品删除 ====================
    if (topic === 'product.deleted') {
      // 变体删除不处理，只处理主商品删除
      if (isVariation) {
        console.log(`[${deliveryId}] Skipping variation delete (variation_id=${webhookProductId})`)
        return new Response(JSON.stringify({ success: true, action: 'skipped', reason: 'variation_delete' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // 尝试用 webhook 的 SKU 或 ID 找到商品
      const sku = product.sku || `WOO-${mainProductId}`
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
    //
    // 策略：
    // - .com 站：通过 API 获取完整数据（图片、分类、属性），更新共享数据和站点数据
    // - 非 .com 站：直接使用 webhook 数据，只更新站点独立数据（价格、库存、状态）
    //   非 .com 站跳过变体（因为我们用 SKU 匹配，变体没有 SKU）

    let fullProduct: any
    let productId: number
    let sku: string

    if (site === 'com') {
      // ==================== .com 站：通过 API 获取完整数据 ====================
      try {
        console.log(`[${deliveryId}] [.com] 通过 API 获取主商品完整数据 (mainProductId=${mainProductId})...`)
        fullProduct = await fetchProductFromWooCommerce('com', mainProductId)

        // 验证获取的是主商品（type 应该是 variable 或 simple，不是 variation）
        if (fullProduct.type === 'variation') {
          console.error(`[${deliveryId}] [.com] API 返回的是变体数据，跳过处理`)
          return new Response(JSON.stringify({ success: true, action: 'skipped', reason: 'api_returned_variation' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.log(`[${deliveryId}] [.com] API 获取成功: type=${fullProduct.type}, name="${fullProduct.name}", images=${fullProduct.images?.length || 0}`)
        productId = fullProduct.id
        sku = fullProduct.sku || `WOO-${productId}`
      } catch (apiError) {
        // API 失败，无法处理
        console.error(`[${deliveryId}] [.com] API 获取失败，跳过处理:`, apiError instanceof Error ? apiError.message : apiError)
        return new Response(JSON.stringify({
          success: false,
          action: 'skipped',
          reason: 'api_fetch_failed',
          error: apiError instanceof Error ? apiError.message : 'Unknown error'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      // ==================== 非 .com 站：使用 webhook 数据 ====================
      // 跳过变体（变体没有 SKU，我们无法匹配）
      if (isVariation) {
        console.log(`[${deliveryId}] [${site}] 跳过变体 webhook (parent_id=${webhookParentId})`)
        return new Response(JSON.stringify({ success: true, action: 'skipped', reason: 'non_com_variation' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // 必须有 SKU 才能匹配
      if (!product.sku) {
        console.log(`[${deliveryId}] [${site}] 商品没有 SKU，跳过`)
        return new Response(JSON.stringify({ success: true, action: 'skipped', reason: 'no_sku' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      fullProduct = product // 使用 webhook 数据
      productId = product.id
      sku = product.sku
      console.log(`[${deliveryId}] [${site}] 使用 webhook 数据: sku=${sku}, name="${product.name}"`)
    }

    // 查找现有商品
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('sku', sku)
      .single()

    // 提取商品数据（使用完整数据）
    const salePrice = parseFloat(fullProduct.sale_price) || 0
    const regularPrice = parseFloat(fullProduct.regular_price) || 0
    const currentPrice = parseFloat(fullProduct.price) || 0
    const productPrice = salePrice || currentPrice || regularPrice // 优先促销价
    const productRegularPrice = regularPrice || currentPrice // 原价/划线价
    const productStockQty = fullProduct.stock_quantity ?? 100
    const productStockStatus = fullProduct.stock_status || 'instock'
    const productStatus = fullProduct.status || 'publish'
    const productDateModified = fullProduct.date_modified || null
    const productDateCreated = fullProduct.date_created || null

    // 提取图片 URL（使用完整数据，确保获取所有图片）
    const images = (fullProduct.images || []).map((img: { src: string }) => img.src)
    console.log(`[${deliveryId}] 提取到 ${images.length} 张图片`)

    // 提取分类名称
    const categories = (fullProduct.categories || []).map((c: { name: string }) => c.name)

    // 提取商品属性（处理 WooCommerce 的属性名格式）- 使用完整数据
    const attributes: Record<string, string | string[]> = {}
    for (const attr of fullProduct.attributes || []) {
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

    // 构建该站点的内容 - 使用完整数据
    const siteContent = {
      name: fullProduct.name,
      description: fullProduct.description || '',
      short_description: fullProduct.short_description || '',
    }

    // 获取该站点的变体信息
    let siteVariations: any[] = []
    if (fullProduct.type === 'variable') {
      console.log(`[${deliveryId}] [${site}] 获取变体信息...`)
      siteVariations = await fetchVariationsFromWooCommerce(site, productId)
      console.log(`[${deliveryId}] [${site}] 获取到 ${siteVariations.length} 个变体`)
    }

    if (!existing) {
      // ==================== 新建商品 ====================
      // 共享数据只从 .com 站设置，其他站留空
      const newProduct: Record<string, unknown> = {
        sku,
        // 各站点独立数据
        woo_ids: { [site]: productId },
        prices: { [site]: productPrice },
        regular_prices: { [site]: productRegularPrice },
        stock_quantities: { [site]: productStockQty },
        stock_statuses: { [site]: productStockStatus },
        statuses: { [site]: productStatus },
        content: { [site]: siteContent },
        sync_status: { [site]: 'synced' },
        date_modified: productDateModified ? { [site]: productDateModified } : {},
        // 变体信息（按站点存储）
        variations: siteVariations.length > 0 ? { [site]: siteVariations } : {},
        variation_counts: siteVariations.length > 0 ? { [site]: siteVariations.length } : {},
        last_synced_at: new Date().toISOString(),
      }

      // 共享数据只从 .com 站设置
      if (site === 'com') {
        newProduct.name = fullProduct.name
        newProduct.slug = fullProduct.slug || null
        newProduct.images = images
        newProduct.categories = categories
        newProduct.attributes = Object.keys(attributes).length > 0 ? attributes : {}
        newProduct.published_at = productDateCreated
        console.log(`[${deliveryId}] Creating product from .com with shared data: ${images.length} images, ${siteVariations.length} variations`)
      } else {
        // 非 .com 站：设置最小共享数据（name 是必填字段）
        newProduct.name = fullProduct.name || sku
        newProduct.slug = null
        newProduct.images = []
        newProduct.categories = []
        newProduct.attributes = {}
        console.log(`[${deliveryId}] Creating product from ${site} (shared data will come from .com later)`)
      }

      const { error } = await supabase.from('products').insert(newProduct)
      if (error) {
        console.error(`[${deliveryId}] Error inserting product:`, error)
        throw error
      }

      console.log(`[${deliveryId}] Created product ${sku} from ${site}`)

    } else {
      // ==================== 更新现有商品 ====================
      
      // 智能合并站点内容：如果获取的数据是空的，保留现有非空数据
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
        // 更新变体信息（按站点合并）
        variations: { ...(existing.variations || {}), [site]: siteVariations },
        variation_counts: { ...(existing.variation_counts || {}), [site]: siteVariations.length },
        last_synced_at: new Date().toISOString(),
      }

      // 如果是主站 (.com)，也更新共享数据（但要智能合并，不覆盖已有数据）
      if (site === 'com') {
        // 名称：优先使用完整数据
        if (fullProduct.name) {
          updateData.name = fullProduct.name
        }
        updateData.slug = fullProduct.slug || existing.slug || null
        
        // 图片：只有当有图片时才更新（避免覆盖已有图片）
        if (images && images.length > 0) {
          updateData.images = images
          console.log(`[${deliveryId}] 更新图片: ${images.length} 张`)
        }
        
        // 分类：只有当有分类时才更新（避免覆盖已有分类）
        if (categories && categories.length > 0) {
          updateData.categories = categories
        }
        
        // 属性：只有当有属性时才更新
        if (Object.keys(attributes).length > 0) {
          updateData.attributes = attributes
        }
        
        // 更新发布时间（如果现有记录没有）
        if (!existing.published_at && productDateCreated) {
          updateData.published_at = productDateCreated
        }
      } else {
        // 非 .com 站：不更新共享数据
        console.log(`[${deliveryId}] Skipping shared data update for ${site} (only from .com)`)
      }

      const { error } = await supabase
        .from('products')
        .update(updateData)
        .eq('sku', sku)

      if (error) {
        console.error(`[${deliveryId}] Error updating product:`, error)
        throw error
      }

      console.log(`[${deliveryId}] Updated ${site} site-specific data for ${sku}`)
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
