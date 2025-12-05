/**
 * Supabase Edge Function: woo-sync
 * 统一的 WooCommerce 同步服务
 *
 * 支持的 actions:
 * - get-product: 从 WooCommerce 获取单个商品完整数据
 * - publish-product: 创建新商品到指定站点
 * - sync-product: 同步单个商品到指定站点
 * - sync-products-batch: 批量同步多个商品
 * - sync-all: 全量同步所有站点
 * - cleanup-images: 清理商品图片
 * - register-webhooks: 注册 Webhook 到所有站点
 *
 * 订单相关:
 * - sync-orders: 全量同步订单
 * - update-order-status: 更新订单状态
 * - add-order-note: 添加订单备注
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==================== 类型定义 ====================

type SiteKey = 'com' | 'uk' | 'de' | 'fr'

// 可选择同步的字段
type SyncField = 'name' | 'description' | 'categories' | 'prices' | 'stock' | 'status' | 'images'

interface SyncProductRequest {
  action: 'sync-product'
  sku: string
  sites: SiteKey[]
  options?: {
    fields?: SyncField[]  // 指定要同步的字段，不传则同步所有（除 images）
    syncImages?: boolean  // 兼容旧参数
  }
}

// 批量同步多个商品（共享分类缓存，更快）
interface SyncProductsBatchRequest {
  action: 'sync-products-batch'
  skus: string[]
  sites: SiteKey[]
  options?: {
    fields?: SyncField[]
    syncImages?: boolean
  }
}

interface SyncAllRequest {
  action: 'sync-all'
}

interface CleanupImagesRequest {
  action: 'cleanup-images'
  site: SiteKey
  productId: number
}

// 发布新商品请求
interface PublishProductRequest {
  action: 'publish-product'
  sites: SiteKey[]
  product: {
    sku?: string  // 可选，不传则自动生成
    name: string
    images: string[]  // 图片 URL 列表
    categories: string[]
    attributes: {
      team?: string
      season: string
      type: string
      version: string
      gender: string
      sleeve: string
      events: string[]
    }
    price: string
    content: Partial<Record<SiteKey, {
      name: string
      description: string
      short_description: string
    }>>
  }
}

// 注册 Webhook 请求
interface RegisterWebhooksRequest {
  action: 'register-webhooks'
  webhookUrl: string
}

// 获取单个商品完整数据（供 woo-webhook 调用）
interface GetProductRequest {
  action: 'get-product'
  site: SiteKey
  productId: number
}

// 删除商品请求
interface DeleteProductRequest {
  action: 'delete-product'
  sku: string
  sites: SiteKey[]
  deleteLocal?: boolean  // 是否同时删除本地数据库记录，默认 true
}

// 从站点拉取商品数据到 PIM（批量）
interface PullProductsRequest {
  action: 'pull-products'
  skus: string[]
  site: SiteKey  // 从哪个站点拉取数据（通常是 com）
}

// ==================== 订单相关请求类型 ====================

// 同步订单请求
interface SyncOrdersRequest {
  action: 'sync-orders'
  site?: SiteKey  // 可选，不传则同步所有站点
  status?: string  // 可选，筛选订单状态
  after?: string   // 可选，同步此日期之后的订单（ISO 格式）
  per_page?: number  // 每页数量，默认 100
}

// 更新订单状态请求
interface UpdateOrderStatusRequest {
  action: 'update-order-status'
  site: SiteKey
  woo_id: number
  status: string
}

// 添加订单备注请求
interface AddOrderNoteRequest {
  action: 'add-order-note'
  site: SiteKey
  woo_id: number
  note: string
  customer_note?: boolean  // 是否发送给客户，默认 false
}

// 获取单个订单请求
interface GetOrderRequest {
  action: 'get-order'
  site: SiteKey
  woo_id: number
}

type RequestBody = SyncProductRequest | SyncProductsBatchRequest | SyncAllRequest | CleanupImagesRequest | PublishProductRequest | RegisterWebhooksRequest | GetProductRequest | DeleteProductRequest | PullProductsRequest | SyncOrdersRequest | UpdateOrderStatusRequest | AddOrderNoteRequest | GetOrderRequest

interface SyncResult {
  site: SiteKey
  success: boolean
  error?: string
}

// ==================== 配置 ====================

const SITE_URLS: Record<SiteKey, string> = {
  com: 'https://jerseysfever.com',
  uk: 'https://jerseysfever.uk',
  de: 'https://jerseysfever.de',
  fr: 'https://jerseysfever.fr',
}

// WooCommerce API 凭证（从环境变量获取）
function getWooCredentials(site: SiteKey): { key: string; secret: string } {
  const key = Deno.env.get(`WOO_${site.toUpperCase()}_KEY`) || ''
  const secret = Deno.env.get(`WOO_${site.toUpperCase()}_SECRET`) || ''
  return { key, secret }
}

// 属性 ID 映射
const ATTRIBUTE_IDS = {
  size: 3,
  jersey_type: 5,
  season: 6,
  style: 7,
  gender: 8,
  event: 9,
  sleeve: 10,
}

// 尺码选项
const SIZE_OPTIONS = {
  adult: ['S', 'M', 'L', 'XL', '2XL'],
  kids: ['16', '18', '20', '22', '24', '26', '28'],
}

function getSizesForGender(gender: string): string[] {
  return gender === 'Kids' ? SIZE_OPTIONS.kids : SIZE_OPTIONS.adult
}

// PIM 清理接口密钥
const PIM_CLEANUP_SECRET = Deno.env.get('PIM_CLEANUP_SECRET') || 'pim-cleanup-secret-2024'

// ==================== WooCommerce API 客户端 ====================

class WooCommerceClient {
  private baseUrl: string
  private auth: string
  public site: SiteKey
  private categoryCache: Map<string, number> = new Map()  // 分类名 -> ID 缓存
  private allCategoriesLoaded = false

  constructor(site: SiteKey) {
    const credentials = getWooCredentials(site)
    if (!credentials.key || !credentials.secret) {
      throw new Error(`Missing WooCommerce credentials for site: ${site}`)
    }
    
    this.site = site
    this.baseUrl = `${SITE_URLS[site]}/wp-json/wc/v3`
    this.auth = btoa(`${credentials.key}:${credentials.secret}`)
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, retries = 3): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      // 创建 AbortController 用于超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60秒超时

      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          signal: controller.signal,
          headers: {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const error = await response.text()
          // 502/503/504 可重试
          if ([502, 503, 504].includes(response.status) && attempt < retries) {
            console.warn(`[${this.site}] API ${response.status}，重试 ${attempt}/${retries}...`)
            await new Promise(r => setTimeout(r, 2000 * attempt)) // 递增延迟
            continue
          }
          throw new Error(`WooCommerce API error: ${response.status} - ${error}`)
        }

        return response.json()
      } catch (err) {
        clearTimeout(timeoutId)
        lastError = err instanceof Error ? err : new Error(String(err))

        // 处理超时错误
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error(`请求超时 (60s)`)
        }

        if (attempt < retries && !lastError.message.includes('401') && !lastError.message.includes('404')) {
          console.warn(`[${this.site}] 请求失败，重试 ${attempt}/${retries}:`, lastError.message)
          await new Promise(r => setTimeout(r, 2000 * attempt))
          continue
        }
        throw lastError
      }
    }
    
    throw lastError || new Error('Request failed after retries')
  }

  async getProduct(id: number): Promise<any> {
    return this.request(`/products/${id}`)
  }

  async updateProduct(id: number, data: any): Promise<any> {
    return this.request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getProductVariations(productId: number): Promise<{ id: number; regular_price: string }[]> {
    try {
      const variations = await this.request<any[]>(`/products/${productId}/variations?per_page=100`)
      return variations.map(v => ({ id: v.id, regular_price: v.regular_price }))
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return []
      }
      throw error
    }
  }

  async batchUpdateVariations(productId: number, updates: any[]): Promise<void> {
    await this.request(`/products/${productId}/variations/batch`, {
      method: 'POST',
      body: JSON.stringify({ update: updates }),
    })
  }

  async batchCreateVariations(productId: number, variations: any[]): Promise<any[]> {
    const result = await this.request<{ create: any[] }>(`/products/${productId}/variations/batch`, {
      method: 'POST',
      body: JSON.stringify({ create: variations }),
    })
    return result.create || []
  }

  async convertToVariableProduct(productId: number, sizes: string[]): Promise<void> {
    await this.request(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({
        type: 'variable',
        attributes: [{
          id: ATTRIBUTE_IDS.size,
          visible: true,
          variation: true,
          options: sizes,
        }],
      }),
    })
  }

  async getAllCategories(): Promise<{ id: number; name: string; slug: string }[]> {
    const allCategories: any[] = []
    let page = 1
    const perPage = 100

    while (true) {
      const cats = await this.request<any[]>(
        `/products/categories?page=${page}&per_page=${perPage}`
      )
      allCategories.push(...cats)
      if (cats.length < perPage) break
      page++
    }

    return allCategories
  }

  async findOrCreateCategory(name: string): Promise<number> {
    const nameLower = name.toLowerCase()
    
    // 检查缓存
    if (this.categoryCache.has(nameLower)) {
      return this.categoryCache.get(nameLower)!
    }
    
    // 首次调用时加载所有分类到缓存
    if (!this.allCategoriesLoaded) {
      const categories = await this.getAllCategories()
      categories.forEach(c => {
        this.categoryCache.set(c.name.toLowerCase(), c.id)
      })
      this.allCategoriesLoaded = true
      
      // 再次检查缓存
      if (this.categoryCache.has(nameLower)) {
        return this.categoryCache.get(nameLower)!
      }
    }

    // 创建新分类
    const result = await this.request<{ id: number }>('/products/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    
    // 添加到缓存
    this.categoryCache.set(nameLower, result.id)
    return result.id
  }

  async getAllProducts(status = 'publish'): Promise<any[]> {
    const allProducts: any[] = []
    let page = 1
    const perPage = 100

    while (true) {
      const products = await this.request<any[]>(
        `/products?page=${page}&per_page=${perPage}&status=${status}`
      )
      allProducts.push(...products)
      if (products.length < perPage) break
      page++
    }

    return allProducts
  }

  // 创建可变商品（修复库存问题）
  async createVariableProduct(data: {
    name: string
    description: string
    short_description: string
    sku: string
    categories: number[]
    imageUrls: string[]
    attributes: {
      gender: string
      season: string
      type: string
      version: string
      sleeve: string
      events: string[]
      team?: string
    }
    price: string
  }): Promise<{ id: number; permalink: string }> {
    const sizes = getSizesForGender(data.attributes.gender)

    // 构建属性
    const productAttributes = [
      { id: ATTRIBUTE_IDS.size, visible: true, variation: true, options: sizes },
      { id: ATTRIBUTE_IDS.gender, visible: false, variation: false, options: [data.attributes.gender] },
      { id: ATTRIBUTE_IDS.season, visible: false, variation: false, options: [data.attributes.season] },
      { id: ATTRIBUTE_IDS.jersey_type, visible: false, variation: false, options: [data.attributes.type] },
      { id: ATTRIBUTE_IDS.style, visible: false, variation: false, options: [data.attributes.version] },
      { id: ATTRIBUTE_IDS.sleeve, visible: false, variation: false, options: [data.attributes.sleeve] },
      { id: ATTRIBUTE_IDS.event, visible: false, variation: false, options: data.attributes.events },
    ]

    // 创建主商品（主商品统一管理库存，变体继承）
    const product = await this.request<any>('/products', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        type: 'variable',
        description: data.description,
        short_description: data.short_description,
        sku: data.sku,
        categories: data.categories.map(id => ({ id })),
        images: data.imageUrls.map(src => ({ src })),
        attributes: productAttributes,
        status: 'publish',
        // ✅ 主商品统一管理库存
        manage_stock: true,
        stock_quantity: 100,
        stock_status: 'instock',
      }),
    })

    // 创建变体（设置划线价为售价的2倍，变体不管理库存，继承主商品）
    const salePrice = parseFloat(data.price)
    const regularPrice = (salePrice * 2).toFixed(2)

    const variationsData = sizes.map(size => ({
      regular_price: regularPrice,  // 划线价（原价）
      sale_price: data.price,       // 实际售价
      attributes: [{ id: ATTRIBUTE_IDS.size, option: size }],
      // ✅ 变体不管理库存，继承主商品的库存设置
      manage_stock: false,
    }))

    await this.request(`/products/${product.id}/variations/batch`, {
      method: 'POST',
      body: JSON.stringify({ create: variationsData }),
    })

    return {
      id: product.id,
      permalink: product.permalink,
    }
  }

  // ==================== Webhook 管理 ====================

  // 列出所有 Webhooks
  async listWebhooks(): Promise<{
    id: number
    name: string
    topic: string
    delivery_url: string
    status: string
  }[]> {
    return this.request('/webhooks?per_page=100')
  }

  // 注册 Webhook
  async registerWebhook(
    topic: 'product.created' | 'product.updated' | 'product.deleted' | 'order.created' | 'order.updated' | 'order.deleted',
    deliveryUrl: string,
    secret?: string
  ): Promise<{ id: number; name: string }> {
    const name = `Sync ${topic} to PIM`
    
    // 先检查是否已存在
    const existing = await this.listWebhooks()
    const found = existing.find(w => w.topic === topic && w.delivery_url.includes(deliveryUrl))
    if (found) {
      return { id: found.id, name: found.name }
    }

    // 创建新 Webhook
    const webhook = await this.request<any>('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name,
        topic,
        delivery_url: `${deliveryUrl}?site=${this.site}`,
        secret: secret || 'webhook-secret',
        status: 'active',
      }),
    })

    return { id: webhook.id, name: webhook.name }
  }

  // 删除 Webhook
  async deleteWebhook(id: number): Promise<void> {
    await this.request(`/webhooks/${id}?force=true`, {
      method: 'DELETE',
    })
  }

  // 删除商品（永久删除，跳过回收站）
  async deleteProduct(id: number): Promise<void> {
    await this.request(`/products/${id}?force=true`, {
      method: 'DELETE',
    })
  }

  // ==================== 订单 API ====================

  // 获取订单列表
  async getOrders(params: {
    page?: number
    per_page?: number
    status?: string
    after?: string
    before?: string
    order?: 'asc' | 'desc'
    orderby?: string
  } = {}): Promise<any[]> {
    const queryParams = new URLSearchParams()
    if (params.page) queryParams.set('page', params.page.toString())
    if (params.per_page) queryParams.set('per_page', params.per_page.toString())
    if (params.status) queryParams.set('status', params.status)
    if (params.after) queryParams.set('after', params.after)
    if (params.before) queryParams.set('before', params.before)
    if (params.order) queryParams.set('order', params.order)
    if (params.orderby) queryParams.set('orderby', params.orderby)

    const query = queryParams.toString()
    return this.request(`/orders${query ? `?${query}` : ''}`)
  }

  // 获取所有订单（分页遍历）
  async getAllOrders(params: {
    status?: string
    after?: string
    per_page?: number
    max_pages?: number  // 最大页数限制
  } = {}): Promise<any[]> {
    const allOrders: any[] = []
    let page = 1
    const perPage = params.per_page || 100  // 每页数量
    const maxPages = params.max_pages || 500  // 最多获取 500 页 = 50000 条订单

    while (page <= maxPages) {
      const orders = await this.getOrders({
        page,
        per_page: perPage,
        status: params.status,
        after: params.after,
        order: 'desc',
        orderby: 'date',
      })
      allOrders.push(...orders)
      console.log(`[${this.site}] 获取订单第 ${page} 页: ${orders.length} 条 (累计 ${allOrders.length})`)
      if (orders.length < perPage) break
      page++

      // 每 10 页暂停 1 秒，避免请求过快
      if (page % 10 === 0) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    if (page > maxPages) {
      console.warn(`[${this.site}] 达到最大页数限制 (${maxPages})，可能有更多订单未同步`)
    }

    return allOrders
  }

  // 获取单个订单
  async getOrder(id: number): Promise<any> {
    return this.request(`/orders/${id}`)
  }

  // 更新订单状态
  async updateOrderStatus(id: number, status: string): Promise<any> {
    return this.request(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
  }

  // 添加订单备注
  async addOrderNote(orderId: number, note: string, customerNote = false): Promise<any> {
    return this.request(`/orders/${orderId}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        note,
        customer_note: customerNote,
      }),
    })
  }

  // 获取订单备注
  async getOrderNotes(orderId: number): Promise<any[]> {
    return this.request(`/orders/${orderId}/notes`)
  }
}

// ==================== 图片清理 ====================

async function cleanupProductImages(site: SiteKey, productId: number): Promise<{
  success: boolean
  error?: string
  details?: any
}> {
  const cleanupUrl = `${SITE_URLS[site]}/wp-json/pim/v1/cleanup-images`
  
  try {
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
      return { success: false, error: `WordPress API error: ${response.status} - ${errorText}` }
    }

    const result = await response.json()
    return { success: true, details: result.results }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// ==================== 分类缓存 ====================

// 分类缓存类型：站点 -> 分类名称(小写) -> WooCommerce ID
type CategoryCache = Map<SiteKey, Map<string, number>>

// 从 Supabase 数据库加载分类缓存
// 4 个站点分类相同，只加载 .com 的数据，所有站点共用
async function preloadCategoryCacheFromDb(supabase: any, sites: SiteKey[]): Promise<CategoryCache> {
  const cache: CategoryCache = new Map()
  
  console.log(`📂 从数据库加载分类缓存...`)
  const startTime = Date.now()
  
  // 只查询 .com 的分类（4 站点分类相同）
  const { data: categories, error } = await supabase
    .from('woo_categories')
    .select('name, woo_id')
    .eq('site', 'com')
  
  if (error) {
    console.warn('从数据库加载分类失败:', error)
    sites.forEach(site => cache.set(site, new Map()))
    return cache
  }
  
  // 构建分类映射（所有站点共用）
  const categoryMap = new Map<string, number>()
  for (const cat of categories || []) {
    categoryMap.set(cat.name.toLowerCase(), cat.woo_id)
  }
  
  // 所有站点使用相同的分类映射
  sites.forEach(site => cache.set(site, categoryMap))
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`📂 分类缓存加载完成 (${duration}s) [${categoryMap.size} 个分类]`)
  
  return cache
}

// 从缓存获取分类 ID，不存在则返回 null
function getCategoryIdFromCache(cache: CategoryCache, site: SiteKey, name: string): number | null {
  const siteCache = cache.get(site)
  if (!siteCache) return null
  return siteCache.get(name.toLowerCase()) ?? null
}

// ==================== 同步单个商品 ====================

interface SyncOptions {
  fields?: SyncField[]  // 指定要同步的字段
  syncImages?: boolean  // 兼容旧参数
  categoryCache?: CategoryCache  // 预加载的分类缓存
}

// 判断是否需要同步某个字段
function shouldSync(field: SyncField, options?: SyncOptions): boolean {
  // 如果没有指定 fields，默认同步所有字段（images 除外）
  if (!options?.fields || options.fields.length === 0) {
    return field !== 'images' || options?.syncImages === true
  }
  // 如果指定了 fields，只同步指定的字段
  return options.fields.includes(field)
}

async function syncSingleSite(
  supabase: any,
  product: any,
  site: SiteKey,
  options?: SyncOptions
): Promise<SyncResult> {
  const wooId = product.woo_ids?.[site]
  
  if (!wooId) {
    return { site, success: false, error: '该站点未发布此商品' }
  }

  const client = new WooCommerceClient(site)
  
  // 获取站点数据（优先使用站点数据，否则回退到 .com）
  const siteContent = product.content?.[site] || product.content?.com
  const sitePrice = product.prices?.[site] ?? product.prices?.com ?? 0
  const siteRegularPrice = product.regular_prices?.[site] ?? product.regular_prices?.com
  const siteStatus = product.statuses?.[site] ?? product.statuses?.com ?? 'publish'
  const siteStockQty = product.stock_quantities?.[site] ?? product.stock_quantities?.com ?? 100
  const siteStockStatus = product.stock_statuses?.[site] ?? product.stock_statuses?.com ?? 'instock'
  
  // 构建更新数据（根据 fields 选项选择性添加）
  const updateData: any = {}
  let needsPriceUpdate = false

  // 名称和描述
  if (shouldSync('name', options) || shouldSync('description', options)) {
    if (siteContent) {
      if (shouldSync('name', options)) updateData.name = siteContent.name
      if (shouldSync('description', options)) {
        updateData.description = siteContent.description
        updateData.short_description = siteContent.short_description
      }
    } else if (shouldSync('name', options)) {
      updateData.name = product.name
    }
  }

  // 状态
  if (shouldSync('status', options)) {
    updateData.status = siteStatus
  }

  // 库存
  if (shouldSync('stock', options)) {
    updateData.stock_quantity = siteStockQty
    updateData.stock_status = siteStockStatus
  }

  // 价格（需要更新变体）
  if (shouldSync('prices', options)) {
    needsPriceUpdate = true
  }

  // 图片同步
  if (shouldSync('images', options) && product.images?.length > 0) {
    console.log(`[${site}] 开始同步图片（共 ${product.images.length} 张）...`)
    
    const cleanupResult = await cleanupProductImages(site, wooId)
    if (!cleanupResult.success) {
      console.warn(`[${site}] 图片清理失败: ${cleanupResult.error}`)
    } else {
      console.log(`[${site}] 图片清理成功`)
    }
    
    updateData.images = product.images.map((src: string) => ({ src }))
  }

  // 分类同步（优先使用缓存）
  if (shouldSync('categories', options) && product.categories && product.categories.length > 0) {
    console.log(`[${site}] 同步分类（共 ${product.categories.length} 个）...`)
    try {
      const categoryIds: number[] = []
      const missingCategories: string[] = []
      
      // 先从缓存获取
      for (const name of product.categories) {
        if (options?.categoryCache) {
          const cachedId = getCategoryIdFromCache(options.categoryCache, site, name)
          if (cachedId !== null) {
            categoryIds.push(cachedId)
            continue
          }
        }
        missingCategories.push(name)
      }
      
      // 缓存中没有的，调用 API 查找/创建
      if (missingCategories.length > 0) {
        console.log(`[${site}] ${missingCategories.length} 个分类需要 API 查找...`)
        const apiIds = await Promise.all(
          missingCategories.map((name: string) => client.findOrCreateCategory(name))
        )
        categoryIds.push(...apiIds)
      }
      
      updateData.categories = categoryIds.map(id => ({ id }))
      console.log(`[${site}] 分类同步完成 (缓存: ${product.categories.length - missingCategories.length}, API: ${missingCategories.length})`)
    } catch (err) {
      console.warn(`[${site}] 分类同步失败:`, err)
    }
  }

  // 如果有数据需要更新，执行更新
  if (Object.keys(updateData).length > 0) {
    await client.updateProduct(wooId, updateData)
    console.log(`[${site}] 商品基础信息更新完成`)
  }

  // 处理价格（需要更新变体）
  if (needsPriceUpdate) {
    const existingProduct = await client.getProduct(wooId)
    const gender = product.attributes?.gender || "Men's"
    const sizes = getSizesForGender(gender)
    
    if (existingProduct.type === 'simple') {
      console.log(`[${site}] 转换简单商品为可变商品...`)
      await client.convertToVariableProduct(wooId, sizes)

      // 主商品统一管理库存
      await client.updateProduct(wooId, {
        manage_stock: true,
        stock_quantity: siteStockQty,
        stock_status: siteStockStatus,
      })

      const variationsData = sizes.map(size => ({
        regular_price: siteRegularPrice?.toString() || sitePrice.toString(),
        sale_price: siteRegularPrice ? sitePrice.toString() : undefined,
        attributes: [{ id: ATTRIBUTE_IDS.size, option: size }],
        // ✅ 变体不管理库存，继承主商品
        manage_stock: false,
      }))

      await client.batchCreateVariations(wooId, variationsData)
      console.log(`[${site}] 创建 ${sizes.length} 个变体（主商品管理库存）`)
    } else {
      const variations = await client.getProductVariations(wooId)
      
      if (variations.length === 0) {
        console.log(`[${site}] 创建变体...`)
        // 主商品统一管理库存
        await client.updateProduct(wooId, {
          manage_stock: true,
          stock_quantity: siteStockQty,
          stock_status: siteStockStatus,
        })

        const variationsData = sizes.map(size => ({
          regular_price: siteRegularPrice?.toString() || sitePrice.toString(),
          sale_price: siteRegularPrice ? sitePrice.toString() : undefined,
          attributes: [{ id: ATTRIBUTE_IDS.size, option: size }],
          // ✅ 变体不管理库存，继承主商品
          manage_stock: false,
        }))
        await client.batchCreateVariations(wooId, variationsData)
        console.log(`[${site}] 创建 ${sizes.length} 个变体（主商品管理库存）`)
      } else {
        // 更新变体价格
        const updates = variations.map(v => {
          const update: any = { id: v.id }
          if (siteRegularPrice && parseFloat(siteRegularPrice.toString()) > parseFloat(sitePrice.toString())) {
            update.regular_price = siteRegularPrice.toString()
            update.sale_price = sitePrice.toString()
          } else {
            update.regular_price = sitePrice.toString()
            update.sale_price = ''
          }
          return update
        })
        await client.batchUpdateVariations(wooId, updates)
        console.log(`[${site}] 更新 ${variations.length} 个变体价格`)
      }
    }
  }

  // 更新同步状态
  const { error: updateError } = await supabase
    .from('products')
    .update({
      sync_status: { ...product.sync_status, [site]: 'synced' },
      last_synced_at: new Date().toISOString(),
    })
    .eq('sku', product.sku)

  if (updateError) {
    console.warn(`[${site}] 更新同步状态失败:`, updateError)
  }

  return { site, success: true }
}

async function syncProduct(
  supabase: any,
  sku: string,
  sites: SiteKey[],
  options?: SyncOptions
): Promise<SyncResult[]> {
  // 获取商品数据
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('sku', sku)
    .single()

  if (error || !product) {
    return sites.map(site => ({ site, success: false, error: '商品不存在' }))
  }

  console.log(`🚀 开始并行同步 ${sku} 到 ${sites.length} 个站点${options?.syncImages ? '（含图片）' : ''}`)
  const startTime = Date.now()

  // 如果需要同步分类，预加载分类缓存（从数据库，超快）
  let syncOptions = options
  const needsCategorySync = shouldSync('categories', options) && product.categories?.length > 0
  if (needsCategorySync && !options?.categoryCache) {
    const categoryCache = await preloadCategoryCacheFromDb(supabase, sites)
    syncOptions = { ...options, categoryCache }
  }

  // 并行同步所有站点
  const results = await Promise.all(
    sites.map(async (site): Promise<SyncResult> => {
      const siteStartTime = Date.now()
      try {
        const result = await syncSingleSite(supabase, product, site, syncOptions)
        const duration = ((Date.now() - siteStartTime) / 1000).toFixed(1)
        console.log(`${result.success ? '✅' : '⚠️'} [${site}] ${result.success ? '成功' : result.error} (${duration}s)`)
        return result
      } catch (err) {
        const duration = ((Date.now() - siteStartTime) / 1000).toFixed(1)
        const errorMsg = err instanceof Error ? err.message : '同步失败'
        console.error(`❌ [${site}] ${errorMsg} (${duration}s)`)
        return { site, success: false, error: errorMsg }
      }
    })
  )

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  const successCount = results.filter(r => r.success).length
  console.log(`🏁 同步完成: ${successCount}/${sites.length} 成功 (${totalDuration}s)`)

  return results
}

// ==================== 批量同步多个商品 ====================

interface BatchSyncResult {
  sku: string
  results: SyncResult[]
}

async function syncProductsBatch(
  supabase: any,
  skus: string[],
  sites: SiteKey[],
  options?: SyncOptions
): Promise<BatchSyncResult[]> {
  console.log(`🚀 批量同步 ${skus.length} 个商品到 ${sites.length} 个站点`)
  const startTime = Date.now()

  // 预加载分类缓存（从数据库，超快）
  const needsCategorySync = shouldSync('categories', options)
  let categoryCache: CategoryCache | undefined
  if (needsCategorySync) {
    categoryCache = await preloadCategoryCacheFromDb(supabase, sites)
  }

  // 获取所有商品数据
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .in('sku', skus)

  if (error) {
    console.error('获取商品数据失败:', error)
    return skus.map(sku => ({
      sku,
      results: sites.map(site => ({ site, success: false, error: '获取商品数据失败' }))
    }))
  }

  const productMap = new Map(products.map((p: any) => [p.sku, p]))

  // 串行处理每个商品（避免服务器过载）
  const allResults: BatchSyncResult[] = []
  
  for (const sku of skus) {
    const product = productMap.get(sku)
    if (!product) {
      allResults.push({
        sku,
        results: sites.map(site => ({ site, success: false, error: '商品不存在' }))
      })
      continue
    }

    // 并行同步到各站点（使用共享缓存）
    const syncOptions = { ...options, categoryCache }
    const results = await Promise.all(
      sites.map(async (site): Promise<SyncResult> => {
        try {
          return await syncSingleSite(supabase, product, site, syncOptions)
        } catch (err) {
          return { site, success: false, error: err instanceof Error ? err.message : '同步失败' }
        }
      })
    )

    const successCount = results.filter(r => r.success).length
    console.log(`[${sku}] ${successCount}/${sites.length} 站点成功`)
    
    allResults.push({ sku, results })
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  const totalSuccess = allResults.filter(r => r.results.every(s => s.success)).length
  console.log(`🏁 批量同步完成: ${totalSuccess}/${skus.length} 商品完全成功 (${totalDuration}s)`)

  return allResults
}

// ==================== 全量同步 ====================

async function syncAll(supabase: any): Promise<{
  success: boolean
  results: Record<SiteKey, { synced: number; errors: number }>
}> {
  const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr']
  const results: Record<SiteKey, { synced: number; errors: number }> = {
    com: { synced: 0, errors: 0 },
    uk: { synced: 0, errors: 0 },
    de: { synced: 0, errors: 0 },
    fr: { synced: 0, errors: 0 },
  }

  console.log('🚀 开始全量同步...')

  // 并行获取所有站点商品
  const allSiteProducts: Record<SiteKey, any[]> = {} as any
  
  await Promise.all(ALL_SITES.map(async (site) => {
    try {
      const client = new WooCommerceClient(site)
      const products = await client.getAllProducts('publish')
      allSiteProducts[site] = products
      console.log(`[${site}] 获取 ${products.length} 个商品`)
    } catch (err) {
      console.error(`[${site}] 获取商品失败:`, err)
      allSiteProducts[site] = []
    }
  }))

  // 按 SKU 合并数据
  const skuMap = new Map<string, { site: SiteKey; product: any }[]>()
  
  for (const site of ALL_SITES) {
    for (const product of allSiteProducts[site] || []) {
      const sku = product.sku || `WOO-${site}-${product.id}`
      if (!skuMap.has(sku)) {
        skuMap.set(sku, [])
      }
      skuMap.get(sku)!.push({ site, product })
      results[site].synced++
    }
  }

  console.log(`📦 共 ${skuMap.size} 个唯一 SKU`)

  // 批量写入数据库
  const allUpsertData: any[] = []

  for (const [sku, siteProducts] of skuMap) {
    const woo_ids: Record<string, number> = {}
    const prices: Record<string, number> = {}
    const regular_prices: Record<string, number> = {}
    const stock_quantities: Record<string, number> = {}
    const stock_statuses: Record<string, string> = {}
    const statuses: Record<string, string> = {}
    const content: Record<string, any> = {}
    const sync_status: Record<string, string> = {}
    const date_modified: Record<string, string> = {}

    let mainProduct: any = null

    for (const { site, product } of siteProducts) {
      woo_ids[site] = product.id
      prices[site] = parseFloat(product.sale_price) || parseFloat(product.price) || 0
      regular_prices[site] = parseFloat(product.regular_price) || parseFloat(product.price) || 0
      stock_quantities[site] = product.stock_quantity ?? 100
      stock_statuses[site] = product.stock_status || 'instock'
      statuses[site] = product.status || 'publish'
      content[site] = {
        name: product.name,
        description: product.description || '',
        short_description: product.short_description || '',
      }
      sync_status[site] = 'synced'
      if (product.date_modified) {
        date_modified[site] = product.date_modified
      }

      if (site === 'com' || !mainProduct) {
        mainProduct = product
      }
    }

    const images = (mainProduct?.images || []).map((img: any) => img.src)
    const categories = (mainProduct?.categories || []).map((c: any) => c.name)
    
    // 提取属性
    const attributes: Record<string, any> = {}
    for (const attr of mainProduct?.attributes || []) {
      const attrName = (attr.name || '').toLowerCase().replace(/[^a-z]/g, '')
      const value = attr.options?.[0] || ''
      
      if (attrName === 'genderage' || attrName === 'gender') attributes.gender = value
      else if (attrName === 'season') attributes.season = value
      else if (attrName === 'jerseytype' || attrName === 'type') attributes.type = value
      else if (attrName === 'style' || attrName === 'version') attributes.version = value
      else if (attrName === 'sleevelength' || attrName === 'sleeve') attributes.sleeve = value
      else if (attrName === 'team') attributes.team = value
      else if (attrName === 'event' || attrName === 'events') attributes.events = attr.options || []
    }

    allUpsertData.push({
      sku,
      name: mainProduct?.name || sku,
      slug: mainProduct?.slug || '',
      images,
      categories,
      attributes,
      woo_ids,
      prices,
      regular_prices,
      stock_quantities,
      stock_statuses,
      statuses,
      content,
      sync_status,
      date_modified,
      published_at: mainProduct?.date_created,
      last_synced_at: new Date().toISOString(),
    })
  }

  // 批量 upsert
  const BATCH_SIZE = 100
  for (let i = 0; i < allUpsertData.length; i += BATCH_SIZE) {
    const batch = allUpsertData.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'sku' })
    
    if (error) {
      console.error('Upsert error:', error)
    }
  }

  console.log(`✅ 全量同步完成: ${allUpsertData.length} 个商品`)

  return { success: true, results }
}

// ==================== 发布新商品 ====================

// 生成 SKU（统一格式）
// 格式: {TeamCode}-{SeasonCode}-{TypeCode}-{Random}
// 示例: RM-2425-HOM-A3X7K, A-WC26-HOM-B2Y8J
function generateSKU(team: string, season: string, type: string): string {
  // 球队代码：取每个单词首字母，大写，最多3位
  const teamCode = team
    .replace(/[^a-zA-Z\s]/g, '')
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 3) || 'XXX'

  // 赛季代码
  let seasonCode = season
  if (season.includes('/')) {
    // 2024/25 -> 2425
    const parts = season.split('/')
    seasonCode = parts[0].slice(-2) + parts[1]
  } else if (season === 'Retro') {
    seasonCode = 'RET'
  } else if (season === 'World Cup 2026') {
    seasonCode = 'WC26'
  } else if (season.startsWith('World Cup')) {
    // World Cup 2022 -> WC22
    seasonCode = 'WC' + season.slice(-2)
  }

  // 类型代码：取前3个字母
  const typeCode = type.substring(0, 3).toUpperCase()

  // 随机后缀：5位字母数字
  const random = Math.random().toString(36).substring(2, 7).toUpperCase()

  return `${teamCode}-${seasonCode}-${typeCode}-${random}`
}

interface PublishResult {
  site: SiteKey
  success: boolean
  wooId?: number
  permalink?: string
  error?: string
}

async function publishProduct(
  supabase: any,
  sites: SiteKey[],
  product: PublishProductRequest['product']
): Promise<{ sku: string; results: PublishResult[] }> {
  console.log(`🚀 发布新商品到 ${sites.length} 个站点...`)
  const startTime = Date.now()

  // 生成 SKU（如果没有提供）
  const team = product.attributes.team || product.categories[0] || 'PRODUCT'
  const sku = product.sku || generateSKU(team, product.attributes.season, product.attributes.type)
  console.log(`📦 SKU: ${sku}`)

  // 预加载分类缓存
  const categoryCache = await preloadCategoryCacheFromDb(supabase, sites)

  // 并行发布到所有站点
  const results = await Promise.all(
    sites.map(async (site): Promise<PublishResult> => {
      const siteStartTime = Date.now()
      console.log(`[${site}] 开始发布...`)

      try {
        const client = new WooCommerceClient(site)

        // 获取分类 ID
        const categoryIds: number[] = []
        for (const catName of product.categories) {
          // 先从缓存获取
          const cachedId = getCategoryIdFromCache(categoryCache, site, catName)
          if (cachedId !== null) {
            categoryIds.push(cachedId)
          } else {
            // 缓存中没有，调用 API 查找/创建
            const catId = await client.findOrCreateCategory(catName)
            categoryIds.push(catId)
          }
        }

        // 获取站点内容（优先使用站点内容，否则使用 .com）
        const siteContent = product.content[site] || product.content.com || {
          name: product.name,
          description: '',
          short_description: '',
        }

        // 创建商品（所有站点使用相同 SKU）
        const result = await client.createVariableProduct({
          name: siteContent.name,
          description: siteContent.description,
          short_description: siteContent.short_description,
          sku,  // 统一 SKU，不加站点后缀
          categories: categoryIds,
          imageUrls: product.images,
          attributes: product.attributes,
          price: product.price,
        })

        const duration = ((Date.now() - siteStartTime) / 1000).toFixed(1)
        console.log(`✅ [${site}] 发布成功 (${duration}s) - ID: ${result.id}`)

        return {
          site,
          success: true,
          wooId: result.id,
          permalink: result.permalink,
        }
      } catch (err) {
        const duration = ((Date.now() - siteStartTime) / 1000).toFixed(1)
        const errorMsg = err instanceof Error ? err.message : '发布失败'
        console.error(`❌ [${site}] 发布失败 (${duration}s): ${errorMsg}`)

        return {
          site,
          success: false,
          error: errorMsg,
        }
      }
    })
  )

  // 保存到本地数据库
  const successResults = results.filter(r => r.success)
  if (successResults.length > 0) {
    const woo_ids: Record<string, number> = {}
    const prices: Record<string, number> = {}
    const regular_prices: Record<string, number> = {}
    const stock_quantities: Record<string, number> = {}
    const stock_statuses: Record<string, string> = {}
    const statuses: Record<string, string> = {}
    const content: Record<string, any> = {}
    const sync_status: Record<string, string> = {}

    const salePrice = parseFloat(product.price)
    const regularPrice = parseFloat((salePrice * 2).toFixed(2))

    for (const r of results) {
      if (r.success && r.wooId) {
        woo_ids[r.site] = r.wooId
        sync_status[r.site] = 'synced'
      } else {
        sync_status[r.site] = r.error ? 'error' : 'not_published'
      }

      prices[r.site] = salePrice
      regular_prices[r.site] = regularPrice  // 划线价 = 售价 * 2
      stock_quantities[r.site] = 100
      stock_statuses[r.site] = 'instock'
      statuses[r.site] = 'publish'

      const siteContent = product.content[r.site] || product.content.com
      if (siteContent) {
        content[r.site] = siteContent
      }
    }

    const productData = {
      sku,
      name: product.name,
      slug: null,
      images: product.images,
      categories: product.categories,
      attributes: product.attributes,
      woo_ids,
      prices,
      regular_prices,  // 划线价（原价）
      stock_quantities,
      stock_statuses,
      statuses,
      content,
      sync_status,
      published_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('products').upsert(productData, { onConflict: 'sku' })
    if (error) {
      console.error('保存到数据库失败:', error)
    } else {
      console.log(`💾 商品已保存到数据库: ${sku}`)
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  const successCount = successResults.length
  console.log(`🏁 发布完成: ${successCount}/${sites.length} 成功 (${totalDuration}s)`)

  return { sku, results }
}

// ==================== 注册 Webhooks ====================

async function registerWebhooks(
  webhookUrl: string
): Promise<Record<SiteKey, { success: boolean; error?: string }>> {
  const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr']
  const results: Record<SiteKey, { success: boolean; error?: string }> = {} as any

  console.log(`🔗 注册 Webhooks 到所有站点: ${webhookUrl}`)

  for (const site of ALL_SITES) {
    try {
      const client = new WooCommerceClient(site)

      // 注册商品事件
      await client.registerWebhook('product.created', webhookUrl)
      await client.registerWebhook('product.updated', webhookUrl)
      await client.registerWebhook('product.deleted', webhookUrl)

      // 注册订单事件
      await client.registerWebhook('order.created', webhookUrl)
      await client.registerWebhook('order.updated', webhookUrl)

      results[site] = { success: true }
      console.log(`✅ [${site}] Webhooks 注册成功 (商品 + 订单)`)
    } catch (err) {
      results[site] = {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
      console.error(`❌ [${site}] Webhooks 注册失败:`, err)
    }
  }

  return results
}

// ==================== 删除商品 ====================

interface DeleteResult {
  site: SiteKey
  success: boolean
  error?: string
}

async function deleteProduct(
  supabase: any,
  sku: string,
  sites: SiteKey[],
  deleteLocal: boolean = true
): Promise<{ results: DeleteResult[]; localDeleted: boolean }> {
  console.log(`🗑️ 删除商品 ${sku} 从 ${sites.length} 个站点...`)
  const startTime = Date.now()

  // 获取商品数据（需要 woo_ids）
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('woo_ids')
    .eq('sku', sku)
    .single()

  if (fetchError || !product) {
    console.error('获取商品数据失败:', fetchError)
    return {
      results: sites.map(site => ({ site, success: false, error: '商品不存在' })),
      localDeleted: false,
    }
  }

  // 并行删除所有站点
  const results = await Promise.all(
    sites.map(async (site): Promise<DeleteResult> => {
      const siteStartTime = Date.now()
      const wooId = product.woo_ids?.[site]

      if (!wooId) {
        console.log(`[${site}] 跳过 - 该站点未发布此商品`)
        return { site, success: true, error: undefined }  // 未发布视为成功
      }

      try {
        const client = new WooCommerceClient(site)
        await client.deleteProduct(wooId)

        const duration = ((Date.now() - siteStartTime) / 1000).toFixed(1)
        console.log(`✅ [${site}] 删除成功 (${duration}s) - ID: ${wooId}`)

        return { site, success: true }
      } catch (err) {
        const duration = ((Date.now() - siteStartTime) / 1000).toFixed(1)
        const errorMsg = err instanceof Error ? err.message : '删除失败'
        console.error(`❌ [${site}] 删除失败 (${duration}s): ${errorMsg}`)

        return { site, success: false, error: errorMsg }
      }
    })
  )

  // 删除本地数据库记录
  let localDeleted = false
  if (deleteLocal) {
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('sku', sku)

    if (deleteError) {
      console.error('删除本地记录失败:', deleteError)
    } else {
      localDeleted = true
      console.log(`💾 本地记录已删除: ${sku}`)
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  const successCount = results.filter(r => r.success).length
  console.log(`🏁 删除完成: ${successCount}/${sites.length} 成功 (${totalDuration}s)`)

  return { results, localDeleted }
}

// ==================== 从站点拉取商品数据到 PIM ====================

interface PullResult {
  sku: string
  success: boolean
  error?: string
}

async function pullProducts(
  supabase: any,
  skus: string[],
  site: SiteKey
): Promise<{ results: PullResult[] }> {
  console.log(`📥 从 ${site} 站点拉取 ${skus.length} 个商品数据到 PIM...`)
  const startTime = Date.now()

  const client = new WooCommerceClient(site)
  const results: PullResult[] = []

  // 先获取本地商品的 woo_ids
  const { data: localProducts, error: fetchError } = await supabase
    .from('products')
    .select('sku, woo_ids')
    .in('sku', skus)

  if (fetchError) {
    console.error('获取本地商品数据失败:', fetchError)
    return {
      results: skus.map(sku => ({ sku, success: false, error: '获取本地数据失败' })),
    }
  }

  const skuToWooId = new Map<string, number>()
  for (const p of localProducts || []) {
    const wooId = p.woo_ids?.[site]
    if (wooId) {
      skuToWooId.set(p.sku, wooId)
    }
  }

  // 逐个拉取并更新
  for (const sku of skus) {
    const wooId = skuToWooId.get(sku)
    if (!wooId) {
      results.push({ sku, success: false, error: `该商品未在 ${site} 站点发布` })
      continue
    }

    try {
      // 从 WooCommerce 获取完整商品数据
      const wooProduct = await client.getProduct(wooId)

      // 提取数据更新到 PIM
      const updateData: any = {
        // 更新该站点的价格
        [`prices`]: { [site]: parseFloat(wooProduct.sale_price) || parseFloat(wooProduct.price) || 0 },
        [`regular_prices`]: { [site]: parseFloat(wooProduct.regular_price) || parseFloat(wooProduct.price) || 0 },
        // 更新该站点的库存
        [`stock_quantities`]: { [site]: wooProduct.stock_quantity ?? 100 },
        [`stock_statuses`]: { [site]: wooProduct.stock_status || 'instock' },
        // 更新该站点的状态
        [`statuses`]: { [site]: wooProduct.status || 'publish' },
        // 更新该站点的内容
        [`content`]: {
          [site]: {
            name: wooProduct.name,
            description: wooProduct.description || '',
            short_description: wooProduct.short_description || '',
          }
        },
        // 更新同步状态
        [`sync_status`]: { [site]: 'synced' },
        last_synced_at: new Date().toISOString(),
      }

      // 如果是主站点 (com)，还要更新共享数据
      if (site === 'com') {
        updateData.name = wooProduct.name
        updateData.images = (wooProduct.images || []).map((img: any) => img.src)
        updateData.categories = (wooProduct.categories || []).map((c: any) => c.name)

        // 提取属性
        const attributes: Record<string, any> = {}
        for (const attr of wooProduct.attributes || []) {
          const attrName = (attr.name || '').toLowerCase().replace(/[^a-z]/g, '')
          const value = attr.options?.[0] || ''

          if (attrName === 'genderage' || attrName === 'gender') attributes.gender = value
          else if (attrName === 'season') attributes.season = value
          else if (attrName === 'jerseytype' || attrName === 'type') attributes.type = value
          else if (attrName === 'style' || attrName === 'version') attributes.version = value
          else if (attrName === 'sleevelength' || attrName === 'sleeve') attributes.sleeve = value
          else if (attrName === 'team') attributes.team = value
          else if (attrName === 'event' || attrName === 'events') attributes.events = attr.options || []
        }
        if (Object.keys(attributes).length > 0) {
          updateData.attributes = attributes
        }
      }

      // 获取现有数据并合并（保留其他站点的数据）
      const { data: existingProduct } = await supabase
        .from('products')
        .select('prices, regular_prices, stock_quantities, stock_statuses, statuses, content, sync_status')
        .eq('sku', sku)
        .single()

      if (existingProduct) {
        // 合并 JSONB 字段
        updateData.prices = { ...existingProduct.prices, ...updateData.prices }
        updateData.regular_prices = { ...existingProduct.regular_prices, ...updateData.regular_prices }
        updateData.stock_quantities = { ...existingProduct.stock_quantities, ...updateData.stock_quantities }
        updateData.stock_statuses = { ...existingProduct.stock_statuses, ...updateData.stock_statuses }
        updateData.statuses = { ...existingProduct.statuses, ...updateData.statuses }
        updateData.content = { ...existingProduct.content, ...updateData.content }
        updateData.sync_status = { ...existingProduct.sync_status, ...updateData.sync_status }
      }

      // 更新数据库
      const { error: updateError } = await supabase
        .from('products')
        .update(updateData)
        .eq('sku', sku)

      if (updateError) {
        throw new Error(updateError.message)
      }

      results.push({ sku, success: true })
      console.log(`✅ [${sku}] 拉取成功`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '拉取失败'
      results.push({ sku, success: false, error: errorMsg })
      console.error(`❌ [${sku}] 拉取失败: ${errorMsg}`)
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  const successCount = results.filter(r => r.success).length
  console.log(`🏁 拉取完成: ${successCount}/${skus.length} 成功 (${totalDuration}s)`)

  return { results }
}

// ==================== 订单同步 ====================

interface OrderSyncResult {
  site: SiteKey
  success: boolean
  synced: number
  errors: number
  error?: string
}

// 转换 WooCommerce 订单数据为数据库格式
function transformWooOrder(wooOrder: any, site: SiteKey): any {
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
      image: item.image || null,  // 商品图片
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

// 同步单个站点的订单
async function syncSiteOrders(
  supabase: any,
  site: SiteKey,
  options: { status?: string; after?: string; per_page?: number } = {}
): Promise<OrderSyncResult> {
  console.log(`📦 [${site}] 开始同步订单...`)
  const startTime = Date.now()

  try {
    const client = new WooCommerceClient(site)
    const orders = await client.getAllOrders({
      status: options.status,
      after: options.after,
      per_page: options.per_page,
    })

    console.log(`[${site}] 获取到 ${orders.length} 个订单`)

    if (orders.length === 0) {
      return { site, success: true, synced: 0, errors: 0 }
    }

    // 转换订单数据
    const ordersData = orders.map(order => transformWooOrder(order, site))

    // 批量 upsert（使用 site + woo_id 作为唯一键）
    let synced = 0
    let errors = 0
    const BATCH_SIZE = 50

    for (let i = 0; i < ordersData.length; i += BATCH_SIZE) {
      const batch = ordersData.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('orders')
        .upsert(batch, {
          onConflict: 'site,woo_id',
          ignoreDuplicates: false
        })

      if (error) {
        console.error(`[${site}] 批次 ${Math.floor(i / BATCH_SIZE) + 1} 插入失败:`, error)
        errors += batch.length
      } else {
        synced += batch.length
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`✅ [${site}] 订单同步完成: ${synced}/${orders.length} 成功 (${duration}s)`)

    return { site, success: true, synced, errors }
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    const errorMsg = err instanceof Error ? err.message : '同步失败'
    console.error(`❌ [${site}] 订单同步失败 (${duration}s):`, errorMsg)
    return { site, success: false, synced: 0, errors: 0, error: errorMsg }
  }
}

// 同步所有站点的订单
async function syncOrders(
  supabase: any,
  options: { site?: SiteKey; status?: string; after?: string; per_page?: number } = {}
): Promise<{ results: OrderSyncResult[] }> {
  const ALL_SITES: SiteKey[] = ['com', 'uk', 'de', 'fr']
  const sites = options.site ? [options.site] : ALL_SITES

  console.log(`🚀 开始同步 ${sites.length} 个站点的订单...`)
  const startTime = Date.now()

  // 并行同步所有站点
  const results = await Promise.all(
    sites.map(site => syncSiteOrders(supabase, site, {
      status: options.status,
      after: options.after,
      per_page: options.per_page,
    }))
  )

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0)
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)
  console.log(`🏁 订单同步完成: ${totalSynced} 条成功, ${totalErrors} 条失败 (${totalDuration}s)`)

  return { results }
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
      case 'get-product': {
        // 从 WooCommerce 获取单个商品完整数据
        try {
          const client = new WooCommerceClient(body.site)
          const product = await client.getProduct(body.productId)
          return new Response(JSON.stringify({ success: true, product }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error(`[${body.site}] 获取商品失败:`, err)
          return new Response(JSON.stringify({ 
            success: false, 
            error: err instanceof Error ? err.message : 'Unknown error' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      case 'publish-product': {
        const result = await publishProduct(supabase, body.sites, body.product)
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'sync-product': {
        const results = await syncProduct(supabase, body.sku, body.sites, body.options)
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'sync-products-batch': {
        const results = await syncProductsBatch(supabase, body.skus, body.sites, body.options)
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'sync-all': {
        const result = await syncAll(supabase)
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'cleanup-images': {
        const result = await cleanupProductImages(body.site, body.productId)
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'register-webhooks': {
        const results = await registerWebhooks(body.webhookUrl)
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'delete-product': {
        const result = await deleteProduct(supabase, body.sku, body.sites, body.deleteLocal ?? true)
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'pull-products': {
        const result = await pullProducts(supabase, body.skus, body.site)
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // ==================== 订单操作 ====================

      case 'sync-orders': {
        const result = await syncOrders(supabase, {
          site: body.site,
          status: body.status,
          after: body.after,
          per_page: body.per_page,
        })
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get-order': {
        try {
          const client = new WooCommerceClient(body.site)
          const order = await client.getOrder(body.woo_id)
          return new Response(JSON.stringify({ success: true, order }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error(`[${body.site}] 获取订单失败:`, err)
          return new Response(JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      case 'update-order-status': {
        try {
          const client = new WooCommerceClient(body.site)
          const order = await client.updateOrderStatus(body.woo_id, body.status)

          // 同时更新本地数据库
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              status: body.status,
              updated_at: new Date().toISOString(),
              last_synced_at: new Date().toISOString(),
            })
            .eq('site', body.site)
            .eq('woo_id', body.woo_id)

          if (updateError) {
            console.warn('更新本地订单状态失败:', updateError)
          }

          return new Response(JSON.stringify({ success: true, order }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error(`[${body.site}] 更新订单状态失败:`, err)
          return new Response(JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      case 'add-order-note': {
        try {
          const client = new WooCommerceClient(body.site)
          const note = await client.addOrderNote(body.woo_id, body.note, body.customer_note ?? false)
          return new Response(JSON.stringify({ success: true, note }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error(`[${body.site}] 添加订单备注失败:`, err)
          return new Response(JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
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

