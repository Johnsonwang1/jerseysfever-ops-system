/**
 * Supabase Edge Function: woo-sync
 * 统一的 WooCommerce 同步服务
 *
 * 支持的 actions:
 * - get-product: 从 WooCommerce 获取单个商品完整数据
 * - publish-product: 创建新商品到指定站点
 * - sync-product: 同步单个商品到指定站点（PIM → WooCommerce）
 * - sync-products-batch: 批量同步多个商品
 * - pull-products: 从站点拉取商品数据（WooCommerce → PIM）
 * - delete-product: 删除商品
 * - cleanup-images: 清理商品图片
 * - register-webhooks: 注册 Webhook 到所有站点
 * - get-variations: 获取商品变体
 *
 * 订单相关:
 * - sync-orders: 全量同步订单
 * - update-order-status: 更新订单状态
 * - add-order-note: 添加订单备注
 * - get-order: 获取单个订单
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts'

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

// 检查 Webhook 请求
interface ListWebhooksRequest {
  action: 'list-webhooks'
  site?: SiteKey
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

// 更新物流信息请求
interface UpdateTrackingRequest {
  action: 'update-tracking'
  orderId: string  // 数据库中的订单 ID
  trackingInfo: Array<{
    carrier: string
    tracking_number: string
    tracking_url?: string
    date_shipped?: string
  }>
}

// 获取商品变体请求
interface GetVariationsRequest {
  action: 'get-variations'
  site: SiteKey
  productId: number
}

// 批量同步变体请求（只同步变体，不更新其他字段）
interface SyncVariationsRequest {
  action: 'sync-variations'
  site: SiteKey
  limit?: number   // 每批数量，默认 50
  offset?: number  // 偏移量
}

// 重建变体请求（删除旧变体，创建新变体）
interface RebuildVariationsRequest {
  action: 'rebuild-variations'
  sku: string
  sites: SiteKey[]
}

// 单独同步视频请求
interface SyncVideoRequest {
  action: 'sync-video'
  sku: string
  sites: SiteKey[]
  videoUrl: string | null  // null 表示清除视频
}

type RequestBody = SyncProductRequest | SyncProductsBatchRequest | CleanupImagesRequest | PublishProductRequest | RegisterWebhooksRequest | ListWebhooksRequest | GetProductRequest | DeleteProductRequest | PullProductsRequest | SyncOrdersRequest | UpdateOrderStatusRequest | AddOrderNoteRequest | GetOrderRequest | UpdateTrackingRequest | GetVariationsRequest | SyncVariationsRequest | RebuildVariationsRequest | SyncVideoRequest

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

  // 通过 SKU 搜索商品（用于检查是否已存在）
  async findProductBySku(sku: string): Promise<{ id: number; name: string } | null> {
    try {
      const products = await this.request<any[]>(`/products?sku=${encodeURIComponent(sku)}&per_page=1`)
      if (products && products.length > 0) {
        return { id: products[0].id, name: products[0].name }
      }
      return null
    } catch (error) {
      console.warn(`[${this.site}] 搜索 SKU ${sku} 失败:`, error)
      return null
    }
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

  // 获取完整的变体信息（包含 SKU 和属性）
  async getProductVariationsFull(productId: number): Promise<{
    id: number
    sku: string
    regular_price: string
    sale_price: string
    stock_quantity: number | null
    stock_status: string
    attributes: { name: string; option: string }[]
  }[]> {
    try {
      const variations = await this.request<any[]>(`/products/${productId}/variations?per_page=100`)
      return variations.map(v => ({
        id: v.id,
        sku: v.sku || '',
        regular_price: v.regular_price || '',
        sale_price: v.sale_price || '',
        stock_quantity: v.stock_quantity,
        stock_status: v.stock_status || 'instock',
        attributes: (v.attributes || []).map((attr: any) => ({
          name: attr.name || '',
          option: attr.option || '',
        })),
      }))
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

  async batchDeleteVariations(productId: number, variationIds: number[]): Promise<void> {
    if (variationIds.length === 0) return
    await this.request(`/products/${productId}/variations/batch`, {
      method: 'POST',
      body: JSON.stringify({ delete: variationIds }),
    })
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

// ==================== 图片转存到 Supabase Storage ====================

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
  // 提取文件扩展名
  const urlPath = url.split('?')[0]
  const ext = urlPath.split('.').pop()?.toLowerCase() || 'jpg'
  const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg'
  // 清理 SKU（移除特殊字符）
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
 * 转存单张图片到 Supabase Storage（自动去重）
 */
async function transferImageToStorage(
  supabase: any,
  imageUrl: string,
  sku: string
): Promise<string> {
  const filename = await getStorageFilename(imageUrl, sku)
  
  // 检查是否已存在（哈希去重）
  const exists = await checkImageExists(supabase, filename)
  if (exists) {
    console.log(`[Storage] 图片已存在，复用: ${filename}`)
    const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
    return data.publicUrl
  }
  
  // 下载图片
  console.log(`[Storage] 下载图片: ${imageUrl}`)
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`)
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
    // 如果是重复文件错误，可能是并发上传，直接返回 URL
    if (error.message?.includes('already exists') || error.message?.includes('Duplicate')) {
      console.log(`[Storage] 图片已存在（并发），复用: ${filename}`)
      const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
      return data.publicUrl
    }
    throw new Error(`上传图片失败: ${error.message}`)
  }
  
  console.log(`[Storage] 上传成功: ${filename}`)
  const { data } = supabase.storage.from('product-images').getPublicUrl(filename)
  return data.publicUrl
}

/**
 * 准备发布用的图片（自动转存 .com 图片到 Storage）
 * 返回所有图片的 Storage URL 和新转存的 URL 列表
 */
async function prepareImagesForPublish(
  supabase: any,
  images: string[],
  sku: string
): Promise<{ storageUrls: string[]; migrated: number; skipped: number; migratedUrls: string[] }> {
  const storageUrls: string[] = []
  const migratedUrls: string[] = []  // 记录新转存的图片 URL
  let migrated = 0
  let skipped = 0
  
  for (const url of images) {
    try {
      // 已经是 Supabase Storage URL，直接使用
      if (url.includes('supabase.co') || url.includes('supabase.in')) {
        storageUrls.push(url)
        skipped++
        continue
      }
      
      // 转存到 Storage
      const storageUrl = await transferImageToStorage(supabase, url, sku)
      storageUrls.push(storageUrl)
      migratedUrls.push(storageUrl)  // 记录新转存的 URL
      migrated++
    } catch (err) {
      console.error(`[Storage] 转存失败: ${url}`, err)
      // 转存失败时保留原 URL（降级处理）
      storageUrls.push(url)
    }
  }
  
  console.log(`[Storage] 图片处理完成: ${migrated} 张迁移, ${skipped} 张跳过`)
  return { storageUrls, migrated, skipped, migratedUrls }
}

/**
 * 从 Storage URL 提取文件路径
 */
function extractStoragePath(url: string): string | null {
  try {
    const urlObj = new URL(url)
    // Supabase Storage URL 格式: https://xxx.supabase.co/storage/v1/object/public/product-images/path/to/file.jpg
    const match = urlObj.pathname.match(/\/storage\/v1\/object\/public\/product-images\/(.+)$/)
    if (match) {
      return decodeURIComponent(match[1])
    }
    return null
  } catch {
    return null
  }
}

/**
 * 删除 Storage 中的临时图片
 * 只删除本次发布时转存的图片（通过 URL 判断）
 */
async function cleanupTemporaryImages(
  supabase: any,
  storageUrls: string[]
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0
  let failed = 0
  
  const pathsToDelete: string[] = []
  
  for (const url of storageUrls) {
    // 只处理 Supabase Storage URL
    if (!url.includes('supabase.co') && !url.includes('supabase.in')) {
      continue
    }
    
    const path = extractStoragePath(url)
    if (path) {
      pathsToDelete.push(path)
    }
  }
  
  if (pathsToDelete.length === 0) {
    return { deleted: 0, failed: 0 }
  }
  
  console.log(`🗑️ 删除 ${pathsToDelete.length} 张临时图片...`)
  
  // 批量删除
  const { data, error } = await supabase.storage
    .from('product-images')
    .remove(pathsToDelete)
  
  if (error) {
    console.error('删除临时图片失败:', error)
    failed = pathsToDelete.length
  } else {
    deleted = pathsToDelete.length
    console.log(`✅ 已删除 ${deleted} 张临时图片`)
  }
  
  return { deleted, failed }
}

// ==================== 图片验证 ====================

/**
 * 验证图片 URL 是否有效
 * 检查 Content-Type 是否为图片类型，以及扩展名是否匹配
 */
async function validateImageUrl(url: string): Promise<{
  valid: boolean
  error?: string
  contentType?: string
}> {
  try {
    // 发送 HEAD 请求检查 Content-Type
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000), // 10秒超时
    })
    
    if (!response.ok) {
      return { valid: false, error: `HTTP ${response.status}` }
    }
    
    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    
    // 检查是否为图片类型
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    const isValidType = validTypes.some(t => contentType.includes(t))
    
    if (!isValidType) {
      return { valid: false, error: `不支持的类型: ${contentType}`, contentType }
    }
    
    // 只要 Content-Type 是有效的图片类型就通过
    // 不再严格检查扩展名匹配（因为有些图片上传时保留了原始扩展名但实际是 webp）
    // WooCommerce 会自己处理图片格式转换
    return { valid: true, contentType }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : '验证失败' }
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
  syncVideo?: boolean   // 是否同步视频
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
  const client = new WooCommerceClient(site)
  
  // 如果站点没有 woo_id，先检查 SKU 是否已存在，存在则关联，否则创建新商品
  if (!wooId) {
    console.log(`[${site}] PIM 未记录此站点，检查是否已存在...`)
    
    try {
      // 先通过 SKU 搜索，检查站点是否已有此商品
      const existingProduct = await client.findProductBySku(product.sku)
      
      if (existingProduct) {
        // 站点已有此商品，直接关联 woo_id 并继续同步
        console.log(`✅ [${site}] 发现已存在的商品 (ID: ${existingProduct.id})，关联并同步...`)
        
        // 更新 PIM 中的 woo_id
        const { error: linkError } = await supabase
          .from('products')
          .update({
            woo_ids: { ...product.woo_ids, [site]: existingProduct.id },
            sync_status: { ...product.sync_status, [site]: 'synced' },
          })
          .eq('sku', product.sku)
        
        if (linkError) {
          console.warn(`[${site}] 关联 woo_id 失败: ${linkError.message}`)
        }
        
        // 更新 product 对象，继续执行后续同步逻辑
        product.woo_ids = { ...product.woo_ids, [site]: existingProduct.id }
        
        // 递归调用自己，这次有 woo_id 了会走更新逻辑
        return syncSingleSite(supabase, product, site, options)
      }
      
      // 站点没有此商品，创建新商品
      console.log(`[${site}] 商品不存在，开始创建...`)
      
      // 获取站点内容（优先使用站点内容，否则回退到 .com 或默认）
      const siteContent = product.content?.[site] || product.content?.com || {
        name: product.name || 'Unnamed Product',
        description: '',
        short_description: '',
      }
      
      // 验证必要内容
      if (!siteContent.name) {
        return { site, success: false, error: '缺少商品名称，请先生成站点内容' }
      }
      
      // 获取价格
      const sitePrice = product.prices?.[site] ?? product.prices?.com ?? 29.99
      
      // 获取分类 ID
      const categoryIds: number[] = []
      if (product.categories && product.categories.length > 0) {
        for (const catName of product.categories) {
          // 先从缓存获取
          if (options?.categoryCache) {
            const cachedId = getCategoryIdFromCache(options.categoryCache, site, catName)
            if (cachedId !== null) {
              categoryIds.push(cachedId)
              continue
            }
          }
          // 缓存中没有，调用 API 查找/创建
          const catId = await client.findOrCreateCategory(catName)
          categoryIds.push(catId)
        }
      }
      
      // 准备图片（转存到 Storage）
      let finalImages = product.images || []
      if (finalImages.length > 0) {
        console.log(`[${site}] 处理 ${finalImages.length} 张图片...`)
        const imageResult = await prepareImagesForPublish(supabase, finalImages, product.sku)
        finalImages = imageResult.storageUrls
        if (imageResult.migrated > 0) {
          console.log(`[${site}] 🖼️ ${imageResult.migrated} 张图片已转存到 Storage`)
        }
      }
      
      // 获取属性（带默认值）
      const attributes = {
        gender: product.attributes?.gender || "Men's",
        season: product.attributes?.season || '2024/25',
        type: product.attributes?.type || 'Home',
        version: product.attributes?.version || 'Standard',
        sleeve: product.attributes?.sleeve || 'Short Sleeve',
        events: product.attributes?.events || [],
        team: product.attributes?.team || product.categories?.[0] || undefined,
      }
      
      // 创建可变商品
      const result = await client.createVariableProduct({
        name: siteContent.name,
        description: siteContent.description || '',
        short_description: siteContent.short_description || '',
        sku: product.sku,
        categories: categoryIds,
        imageUrls: finalImages,
        attributes,
        price: sitePrice.toString(),
      })
      
      console.log(`✅ [${site}] 商品创建成功 - ID: ${result.id}`)
      
      // 更新数据库：woo_ids, sync_status, prices 等
      const salePrice = parseFloat(sitePrice.toString())
      const regularPrice = parseFloat((salePrice * 2).toFixed(2))
      
      // 获取变体信息
      let siteVariations: any[] = []
      try {
        siteVariations = await client.getProductVariationsFull(result.id)
        console.log(`[${site}] 获取 ${siteVariations.length} 个变体`)
      } catch (err) {
        console.warn(`[${site}] 获取变体失败:`, err)
      }
      
      // 合并更新数据库
      const updateData: Record<string, any> = {
        woo_ids: { ...product.woo_ids, [site]: result.id },
        sync_status: { ...product.sync_status, [site]: 'synced' },
        prices: { ...product.prices, [site]: salePrice },
        regular_prices: { ...product.regular_prices, [site]: regularPrice },
        stock_quantities: { ...product.stock_quantities, [site]: 100 },
        stock_statuses: { ...product.stock_statuses, [site]: 'instock' },
        statuses: { ...product.statuses, [site]: 'publish' },
        variations: { ...(product.variations || {}), [site]: siteVariations },
        variation_counts: { ...(product.variation_counts || {}), [site]: siteVariations.length },
        last_synced_at: new Date().toISOString(),
      }
      
      // 如果是首次创建且没有 content，添加 content
      if (!product.content?.[site] && siteContent) {
        updateData.content = { ...product.content, [site]: siteContent }
      }
      
      const { error: dbError } = await supabase
        .from('products')
        .update(updateData)
        .eq('sku', product.sku)
      
      if (dbError) {
        console.warn(`[${site}] 更新数据库失败: ${dbError.message}`)
      }
      
      return { site, success: true }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '创建商品失败'
      console.error(`❌ [${site}] 创建商品失败: ${errorMsg}`)
      return { site, success: false, error: errorMsg }
    }
  }
  
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
    console.log(`[${site}] 开始处理图片（共 ${product.images.length} 张）...`)
    
    // 🔧 先转存 .com 图片到 Supabase Storage（避免验证超时导致图片丢失）
    const imageResult = await prepareImagesForPublish(supabase, product.images, product.sku)
    const storageImages = imageResult.storageUrls
    
    if (imageResult.migrated > 0) {
      console.log(`[${site}] 🖼️ ${imageResult.migrated} 张图片已转存到 Storage`)
      
      // 更新本地数据库的 images 字段（使用 Storage URL）
      const { error: dbError } = await supabase
        .from('products')
        .update({ images: storageImages })
        .eq('sku', product.sku)
      
      if (dbError) {
        console.warn(`[${site}] 更新本地图片 URL 失败: ${dbError.message}`)
      } else {
        console.log(`[${site}] ✅ 本地图片 URL 已更新为 Storage URL`)
      }
    }
    
    // 验证转存后的图片 URL
    const validImages: string[] = []
    const invalidImages: { url: string; error: string }[] = []
    
    // 并行验证所有图片（加快速度）
    const validationResults = await Promise.all(
      storageImages.map(async (src: string) => {
        if (!src || typeof src !== 'string') {
          return { url: src || '(empty)', valid: false, error: '无效 URL' }
        }
        const result = await validateImageUrl(src)
        return { url: src, ...result }
      })
    )
    
    for (const result of validationResults) {
      if (result.valid) {
        validImages.push(result.url)
      } else {
        invalidImages.push({ url: result.url, error: result.error || '未知错误' })
      }
    }
    
    if (invalidImages.length > 0) {
      console.warn(`[${site}] ⚠️ 跳过 ${invalidImages.length} 张无效图片:`)
      invalidImages.forEach(img => {
        console.warn(`  - ${img.error}: ${img.url.substring(0, 80)}...`)
      })
    }
    
    if (validImages.length === 0) {
      console.warn(`[${site}] 没有有效图片可同步`)
    } else {
      console.log(`[${site}] ✅ ${validImages.length} 张图片验证通过，开始同步...`)
      
      const cleanupResult = await cleanupProductImages(site, wooId)
      if (!cleanupResult.success) {
        console.warn(`[${site}] 图片清理失败: ${cleanupResult.error}`)
      } else {
        console.log(`[${site}] 图片清理成功`)
      }
      
      updateData.images = validImages.map((src: string) => ({ src }))
    }
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

  // 视频 URL 同步（通过 meta_data）- 需要 syncVideo 选项开启
  if (options?.syncVideo && product.video_url !== undefined) {
    updateData.meta_data = updateData.meta_data || []
    updateData.meta_data.push({
      key: '_product_video_url',
      value: product.video_url || ''
    })
    if (product.video_url) {
      console.log(`[${site}] 同步视频 URL: ${product.video_url.substring(0, 50)}...`)
    } else {
      console.log(`[${site}] 清除视频 URL`)
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

// 单独同步视频到指定站点
async function syncVideo(
  supabase: any,
  sku: string,
  sites: SiteKey[],
  videoUrl: string | null
): Promise<SyncResult[]> {
  console.log(`🎬 syncVideo 被调用: sku=${sku}, sites=${JSON.stringify(sites)}, videoUrl=${videoUrl}`)

  // 获取商品数据获取 woo_ids
  const { data: product, error } = await supabase
    .from('products')
    .select('sku, woo_ids')
    .eq('sku', sku)
    .single()

  if (error || !product) {
    console.error(`❌ 获取商品失败: ${error?.message || '商品不存在'}`)
    return sites.map(site => ({ site, success: false, error: '商品不存在' }))
  }

  console.log(`📦 商品数据: woo_ids=${JSON.stringify(product.woo_ids)}`)

  const wooIds = product.woo_ids || {}
  console.log(`🎬 开始同步视频到 ${sites.length} 个站点: ${videoUrl || '(清除视频)'}`)

  // 并行同步所有站点
  const results = await Promise.all(
    sites.map(async (site): Promise<SyncResult> => {
      try {
        const wooId = wooIds[site]
        if (!wooId) {
          return { site, success: false, error: '商品未发布到该站点' }
        }

        const { key, secret } = getWooCredentials(site)
        if (!key || !secret) {
          return { site, success: false, error: 'API 凭证缺失' }
        }

        const client = new WooCommerceClient(SITE_URLS[site], key, secret)

        // 只更新视频 meta_data
        await client.updateProduct(wooId, {
          meta_data: [{
            key: '_product_video_url',
            value: videoUrl || ''
          }]
        })

        console.log(`✅ [${site}] 视频同步成功`)
        return { site, success: true }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '同步失败'
        console.error(`❌ [${site}] 视频同步失败: ${errorMsg}`)
        return { site, success: false, error: errorMsg }
      }
    })
  )

  // 同时更新本地数据库
  try {
    await supabase
      .from('products')
      .update({ video_url: videoUrl || null })
      .eq('sku', sku)
    console.log(`💾 本地数据库视频 URL 已更新`)
  } catch (err) {
    console.warn('更新本地数据库时出错:', err)
  }

  const successCount = results.filter(r => r.success).length
  console.log(`🏁 视频同步完成: ${successCount}/${sites.length} 成功`)

  return results
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

  console.log(`🚀 开始并行同步 ${sku} 到 ${sites.length} 个站点`)
  console.log(`📋 同步选项:`, JSON.stringify(options))
  console.log(`🖼️ syncImages = ${options?.syncImages}, 图片数量 = ${product.images?.length || 0}`)
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
  const failedResults = results.filter(r => !r.success)
  console.log(`🏁 同步完成: ${successCount}/${sites.length} 成功 (${totalDuration}s)`)

  // 更新失败站点的 sync_status 为 error
  if (failedResults.length > 0) {
    const syncStatusUpdates: Record<string, string> = {}
    for (const result of failedResults) {
      syncStatusUpdates[result.site] = 'error'
    }
    
    try {
      await supabase
        .from('products')
        .update({
          sync_status: { ...product.sync_status, ...syncStatusUpdates },
        })
        .eq('sku', sku)
      console.log(`⚠️ 已标记 ${failedResults.length} 个站点为 error 状态`)
    } catch (err) {
      console.warn('更新失败状态时出错:', err)
    }
  }

  // 同步完成后，获取各站点变体信息
  try {
    const variations: Record<string, any[]> = {}
    const variation_counts: Record<string, number> = {}
    
    for (const site of sites) {
      const wooId = product.woo_ids?.[site]
      if (wooId) {
        try {
          const client = new WooCommerceClient(site)
          const siteVariations = await client.getProductVariationsFull(wooId)
          variations[site] = siteVariations
          variation_counts[site] = siteVariations.length
          console.log(`📦 [${site}] 获取 ${siteVariations.length} 个变体`)
        } catch (err) {
          console.warn(`[${site}] 获取变体失败:`, err)
        }
      }
    }
    
    // 合并现有变体数据并更新
    const existingVariations = product.variations || {}
    const existingCounts = product.variation_counts || {}
    
    await supabase
      .from('products')
      .update({
        variations: { ...existingVariations, ...variations },
        variation_counts: { ...existingCounts, ...variation_counts },
      })
      .eq('sku', sku)
      
  } catch (err) {
    console.warn('更新变体信息失败:', err)
  }

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

// ==================== 获取并存储变体信息 ====================

async function fetchAndStoreVariations(
  supabase: any,
  sku: string,
  site: SiteKey,
  productId: number
): Promise<void> {
  try {
    const client = new WooCommerceClient(site)
    const siteVariations = await client.getProductVariationsFull(productId)
    
    // 获取现有数据
    const { data: existing } = await supabase
      .from('products')
      .select('variations, variation_counts')
      .eq('sku', sku)
      .single()
    
    // 合并更新
    const variations = { ...(existing?.variations || {}), [site]: siteVariations }
    const variation_counts = { ...(existing?.variation_counts || {}), [site]: siteVariations.length }
    
    // 更新数据库
    const { error } = await supabase
      .from('products')
      .update({
        variations,
        variation_counts,
      })
      .eq('sku', sku)
    
    if (error) {
      console.warn(`[${site}] 存储变体信息失败:`, error)
    } else {
      console.log(`[${site}] 存储 ${siteVariations.length} 个变体信息`)
    }
  } catch (err) {
    console.warn(`[${site}] 获取变体信息失败:`, err)
  }
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

  // 🖼️ 图片预处理：将 .com 图片转存到 Supabase Storage
  let finalImages = product.images
  let migratedImageUrls: string[] = []  // 记录本次转存的图片 URL（用于后续删除）
  if (product.images && product.images.length > 0) {
    console.log(`🖼️ 处理 ${product.images.length} 张图片...`)
    const imageResult = await prepareImagesForPublish(supabase, product.images, sku)
    finalImages = imageResult.storageUrls
    migratedImageUrls = imageResult.migratedUrls  // 直接使用返回的新转存 URL 列表
    
    if (imageResult.migrated > 0) {
      console.log(`🖼️ ${imageResult.migrated} 张图片已转存到 Storage`)
    }
  }

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

        // 创建商品（所有站点使用相同 SKU，使用转存后的 Storage 图片）
        const result = await client.createVariableProduct({
          name: siteContent.name,
          description: siteContent.description,
          short_description: siteContent.short_description,
          sku,  // 统一 SKU，不加站点后缀
          categories: categoryIds,
          imageUrls: finalImages,  // 使用转存后的 Storage URL
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

    // 获取各站点变体信息
    const variations: Record<string, any[]> = {}
    const variation_counts: Record<string, number> = {}
    
    for (const r of results) {
      if (r.success && r.wooId) {
        try {
          const client = new WooCommerceClient(r.site)
          const siteVariations = await client.getProductVariationsFull(r.wooId)
          variations[r.site] = siteVariations
          variation_counts[r.site] = siteVariations.length
          console.log(`[${r.site}] 获取 ${siteVariations.length} 个变体`)
        } catch (err) {
          console.warn(`[${r.site}] 获取变体失败:`, err)
        }
      }
    }

    const productData = {
      sku,
      name: product.name,
      slug: null,
      images: finalImages,  // 使用转存后的 Storage URL
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
      variations,
      variation_counts,
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

  // 🗑️ 发布成功后删除临时图片（等待 Webhook 回传更新）
  if (successResults.length > 0 && migratedImageUrls.length > 0) {
    console.log(`🗑️ 发布成功，删除 ${migratedImageUrls.length} 张临时图片...`)
    const cleanupResult = await cleanupTemporaryImages(supabase, migratedImageUrls)
    if (cleanupResult.deleted > 0) {
      console.log(`✅ 已删除 ${cleanupResult.deleted} 张临时图片，等待 Webhook 回传更新图片 URL`)
    }
    if (cleanupResult.failed > 0) {
      console.warn(`⚠️ ${cleanupResult.failed} 张临时图片删除失败（可稍后手动清理）`)
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

// ==================== 检查 Webhooks ====================

async function listWebhooksForSites(site?: SiteKey): Promise<Record<SiteKey, {
  webhooks: Array<{
    id: number
    name: string
    topic: string
    delivery_url: string
    status: string
  }>
  error?: string
}>> {
  const sites: SiteKey[] = site ? [site] : ['com', 'uk', 'de', 'fr']
  const results: Record<SiteKey, {
    webhooks: Array<{
      id: number
      name: string
      topic: string
      delivery_url: string
      status: string
    }>
    error?: string
  }> = {} as any

  for (const s of sites) {
    try {
      const client = new WooCommerceClient(s)
      const webhooks = await client.listWebhooks()
      results[s] = { webhooks }
      console.log(`✅ [${s}] 找到 ${webhooks.length} 个 Webhooks`)
    } catch (err) {
      results[s] = {
        webhooks: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      }
      console.error(`❌ [${s}] 获取 Webhooks 失败:`, err)
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

      // 获取变体信息
      let siteVariations: any[] = []
      if (wooProduct.type === 'variable') {
        try {
          siteVariations = await client.getProductVariationsFull(wooId)
          console.log(`📦 [${sku}] 获取 ${siteVariations.length} 个变体`)
        } catch (err) {
          console.warn(`[${sku}] 获取变体失败:`, err)
        }
      }

      // 获取现有数据并合并（保留其他站点的数据）
      const { data: existingProduct } = await supabase
        .from('products')
        .select('prices, regular_prices, stock_quantities, stock_statuses, statuses, content, sync_status, variations, variation_counts')
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
        // 合并变体数据
        updateData.variations = { ...(existingProduct.variations || {}), [site]: siteVariations }
        updateData.variation_counts = { ...(existingProduct.variation_counts || {}), [site]: siteVariations.length }
      } else {
        updateData.variations = { [site]: siteVariations }
        updateData.variation_counts = { [site]: siteVariations.length }
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

// 从 WooCommerce 订单中提取物流跟踪信息
function extractTrackingInfo(wooOrder: any): Array<{
  carrier: string;
  tracking_number: string;
  tracking_url?: string;
  date_shipped?: string;
}> {
  const trackingInfo: Array<{
    carrier: string;
    tracking_number: string;
    tracking_url?: string;
    date_shipped?: string;
  }> = [];

  // 方法1: 从 meta_data 中提取 (WooCommerce Shipment Tracking 插件)
  const metaData = wooOrder.meta_data || [];
  const trackingMeta = metaData.find((m: any) => m.key === '_wc_shipment_tracking_items');
  
  if (trackingMeta?.value) {
    try {
      // 值可能是数组或 JSON 字符串
      const trackingItems = typeof trackingMeta.value === 'string' 
        ? JSON.parse(trackingMeta.value) 
        : trackingMeta.value;
      
      if (Array.isArray(trackingItems)) {
        for (const item of trackingItems) {
          trackingInfo.push({
            carrier: item.tracking_provider || item.custom_tracking_provider || '',
            tracking_number: item.tracking_number || '',
            tracking_url: item.tracking_link || item.custom_tracking_link || undefined,
            date_shipped: item.date_shipped ? new Date(item.date_shipped * 1000).toISOString() : undefined,
          });
        }
      }
    } catch (e) {
      console.warn('解析物流跟踪信息失败:', e);
    }
  }

  // 方法2: 从 shipment_trackings 字段提取 (某些插件直接提供)
  if (wooOrder.shipment_trackings && Array.isArray(wooOrder.shipment_trackings)) {
    for (const tracking of wooOrder.shipment_trackings) {
      // 检查是否已存在相同的运单号
      const exists = trackingInfo.some(t => t.tracking_number === tracking.tracking_number);
      if (!exists) {
        trackingInfo.push({
          carrier: tracking.tracking_provider || '',
          tracking_number: tracking.tracking_number || '',
          tracking_url: tracking.tracking_link || undefined,
          date_shipped: tracking.date_shipped || undefined,
        });
      }
    }
  }

  return trackingInfo;
}

// 订单归属信息接口
interface OrderAttribution {
  source_type: string | null;
  utm_source: string | null;
  device_type: string | null;
  session_pages: number | null;
  referrer: string | null;
}

// 提取订单归属信息（WooCommerce Order Attribution）
function extractOrderAttribution(wooOrder: any): OrderAttribution {
  const metaData = wooOrder.meta_data || [];
  
  const getMeta = (key: string): string | null => {
    const meta = metaData.find((m: any) => m.key === key);
    return meta?.value || null;
  };
  
  return {
    source_type: getMeta('_wc_order_attribution_source_type'),
    utm_source: getMeta('_wc_order_attribution_utm_source'),
    device_type: getMeta('_wc_order_attribution_device_type'),
    session_pages: getMeta('_wc_order_attribution_session_pages') 
      ? parseInt(getMeta('_wc_order_attribution_session_pages')!) 
      : null,
    referrer: getMeta('_wc_order_attribution_referrer'),
  };
}

// 提取订单来源（友好名称）- 兼容旧字段
function extractOrderSource(wooOrder: any): string {
  const createdVia = wooOrder.created_via || '';
  const paymentMethod = wooOrder.payment_method || '';
  const metaData = wooOrder.meta_data || [];
  
  // 优先使用 WooCommerce Order Attribution 的来源类型
  const sourceTypeMeta = metaData.find((m: any) => m.key === '_wc_order_attribution_source_type');
  if (sourceTypeMeta?.value) {
    const sourceType = sourceTypeMeta.value;
    const utmSourceMeta = metaData.find((m: any) => m.key === '_wc_order_attribution_utm_source');
    const utmSource = utmSourceMeta?.value || '';
    
    // 返回更友好的名称
    if (sourceType === 'organic' && utmSource) {
      return `Organic (${utmSource})`;
    }
    if (sourceType === 'direct') return 'Direct';
    if (sourceType === 'organic') return 'Organic';
    if (sourceType === 'paid') return `Paid (${utmSource || 'ads'})`;
    if (sourceType === 'referral') return `Referral`;
    return sourceType;
  }
  
  // 根据 created_via 和 payment_method 判断来源
  if (createdVia === 'checkout') {
    if (paymentMethod.toLowerCase().includes('paypal')) return 'PayPal';
    if (paymentMethod.toLowerCase().includes('stripe')) return 'Stripe';
    if (paymentMethod.toLowerCase().includes('klarna')) return 'Klarna';
    return 'Website';
  }
  if (createdVia === 'admin') return 'Admin';
  if (createdVia === 'rest-api') return 'API';
  if (createdVia === 'import') return 'Import';
  
  return createdVia || 'Unknown';
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
    tracking_info: extractTrackingInfo(wooOrder),  // 物流跟踪信息
    order_source: extractOrderSource(wooOrder),    // 订单来源（友好名称）
    // 订单归属详细信息
    attribution_source_type: extractOrderAttribution(wooOrder).source_type,
    attribution_utm_source: extractOrderAttribution(wooOrder).utm_source,
    attribution_device_type: extractOrderAttribution(wooOrder).device_type,
    attribution_session_pages: extractOrderAttribution(wooOrder).session_pages,
    attribution_referrer: extractOrderAttribution(wooOrder).referrer,
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

// ==================== 批量同步变体 ====================

/**
 * 批量同步指定站点的商品变体
 * 只更新 variations 和 variation_counts 字段
 */
async function syncVariationsBatch(
  supabase: any,
  site: SiteKey,
  limit: number = 50,
  offset: number = 0
): Promise<{
  synced: number
  failed: number
  skipped: number
  total: number
  hasMore: boolean
  details: Array<{ sku: string; varCount: number; error?: string }>
}> {
  const client = new WooCommerceClient(site)
  const details: Array<{ sku: string; varCount: number; error?: string }> = []
  
  console.log(`🔄 [${site}] 开始同步变体 (limit=${limit}, offset=${offset})`)

  // 获取有 woo_id 的商品
  const { data: products, error: fetchError, count } = await supabase
    .from('products')
    .select('sku, woo_ids, variations, variation_counts', { count: 'exact' })
    .not(`woo_ids->${site}`, 'is', null)
    .order('sku')
    .range(offset, offset + limit - 1)

  if (fetchError) {
    console.error('获取商品列表失败:', fetchError)
    throw new Error(`获取商品列表失败: ${fetchError.message}`)
  }

  const total = count || 0
  const hasMore = offset + limit < total
  let synced = 0
  let failed = 0
  let skipped = 0

  // 逐个获取变体
  for (const product of products || []) {
    const wooId = product.woo_ids?.[site]
    if (!wooId) {
      skipped++
      continue
    }

    try {
      const variations = await client.getProductVariationsFull(wooId)
      
      // 更新数据库
      const updatedVariations = { ...(product.variations || {}), [site]: variations }
      const updatedCounts = { ...(product.variation_counts || {}), [site]: variations.length }

      const { error: updateError } = await supabase
        .from('products')
        .update({
          variations: updatedVariations,
          variation_counts: updatedCounts,
          last_synced_at: new Date().toISOString(),
        })
        .eq('sku', product.sku)

      if (updateError) {
        console.error(`[${product.sku}] 更新变体失败:`, updateError)
        failed++
        details.push({ sku: product.sku, varCount: 0, error: updateError.message })
      } else {
        synced++
        details.push({ sku: product.sku, varCount: variations.length })
        console.log(`[${product.sku}] 同步 ${variations.length} 个变体`)
      }
    } catch (err) {
      console.error(`[${product.sku}] 获取变体失败:`, err)
      failed++
      details.push({ sku: product.sku, varCount: 0, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  console.log(`✅ [${site}] 变体同步完成: ${synced} 成功, ${failed} 失败, ${skipped} 跳过`)

  return { synced, failed, skipped, total, hasMore, details }
}

// ==================== 重建变体 ====================

interface RebuildResult {
  site: SiteKey
  success: boolean
  deleted: number
  created: number
  error?: string
}

/**
 * 重建商品变体
 * 1. 删除所有现有变体
 * 2. 根据 gender 确定尺码
 * 3. 创建新变体，SKU 格式: {产品SKU}-{尺码}
 */
async function rebuildVariations(
  supabase: any,
  sku: string,
  sites: SiteKey[]
): Promise<{ sku: string; results: RebuildResult[] }> {
  console.log(`🔄 重建变体: ${sku} -> ${sites.join(', ')}`)

  // 1. 从 PIM 获取商品数据
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('sku, name, woo_ids, prices, regular_prices, attributes')
    .eq('sku', sku)
    .single()

  if (fetchError || !product) {
    throw new Error(`商品不存在: ${sku}`)
  }

  // 2. 根据 gender 确定尺码
  const gender = product.attributes?.gender || 'Men'
  const sizes = getSizesForGender(gender)
  console.log(`📏 尺码列表 (${gender}): ${sizes.join(', ')}`)

  // 3. 对每个站点重建变体
  const results: RebuildResult[] = await Promise.all(
    sites.map(async (site): Promise<RebuildResult> => {
      const wooId = product.woo_ids?.[site]
      if (!wooId) {
        return { site, success: false, deleted: 0, created: 0, error: '商品未发布到该站点' }
      }

      try {
        const client = new WooCommerceClient(site)
        
        // 获取现有变体
        const existingVariations = await client.getProductVariationsFull(wooId)
        const variationIds = existingVariations.map(v => v.id)
        console.log(`[${site}] 发现 ${variationIds.length} 个现有变体`)

        // 删除所有现有变体
        if (variationIds.length > 0) {
          await client.batchDeleteVariations(wooId, variationIds)
          console.log(`[${site}] 已删除 ${variationIds.length} 个旧变体`)
        }

        // 获取价格
        const salePrice = product.prices?.[site] || product.prices?.com || 29.99
        const regularPrice = product.regular_prices?.[site] || product.regular_prices?.com || salePrice * 2

        // 创建新变体，带正确的 SKU
        const variationsData = sizes.map(size => ({
          sku: `${sku}-${size}`,  // 关键：指定正确 SKU
          regular_price: regularPrice.toString(),
          sale_price: salePrice.toString(),
          attributes: [{ id: ATTRIBUTE_IDS.size, option: size }],
          manage_stock: false,
        }))

        await client.batchCreateVariations(wooId, variationsData)
        console.log(`[${site}] 已创建 ${sizes.length} 个新变体`)

        return {
          site,
          success: true,
          deleted: variationIds.length,
          created: sizes.length,
        }
      } catch (err) {
        console.error(`[${site}] 重建变体失败:`, err)
        return {
          site,
          success: false,
          deleted: 0,
          created: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        }
      }
    })
  )

  // 4. 更新 PIM 中的变体数据
  const successSites = results.filter(r => r.success).map(r => r.site)
  if (successSites.length > 0) {
    // 重新获取变体信息
    const variations: Record<string, any[]> = { ...(product.variations || {}) }
    const variation_counts: Record<string, number> = { ...(product.variation_counts || {}) }

    for (const site of successSites) {
      const wooId = product.woo_ids[site]
      try {
        const client = new WooCommerceClient(site)
        const siteVariations = await client.getProductVariationsFull(wooId)
        variations[site] = siteVariations
        variation_counts[site] = siteVariations.length
      } catch (err) {
        console.warn(`[${site}] 获取新变体信息失败:`, err)
      }
    }

    await supabase
      .from('products')
      .update({
        variations,
        variation_counts,
        last_synced_at: new Date().toISOString(),
      })
      .eq('sku', sku)
  }

  console.log(`✅ 重建完成: ${successSites.length}/${sites.length} 个站点成功`)
  return { sku, results }
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

      case 'sync-video': {
        const videoBody = body as SyncVideoRequest
        console.log(`📹 sync-video 请求: sku=${videoBody.sku}, sites=${JSON.stringify(videoBody.sites)}, videoUrl=${videoBody.videoUrl?.substring(0, 50)}`)
        const results = await syncVideo(supabase, videoBody.sku, videoBody.sites, videoBody.videoUrl)
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

      case 'list-webhooks': {
        const results = await listWebhooksForSites(body.site)
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

      case 'update-tracking': {
        // 更新物流跟踪信息（手动录入）
        try {
          const { orderId, trackingInfo } = body
          
          if (!orderId) {
            return new Response(JSON.stringify({
              success: false,
              error: '缺少订单 ID'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          const { error: updateError } = await supabase
            .from('orders')
            .update({
              tracking_info: trackingInfo || [],
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderId)

          if (updateError) {
            console.error('更新物流信息失败:', updateError)
            return new Response(JSON.stringify({
              success: false,
              error: updateError.message
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error('更新物流信息失败:', err)
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

      case 'get-variations': {
        try {
          const client = new WooCommerceClient(body.site)
          const variations = await client.getProductVariationsFull(body.productId)
          return new Response(JSON.stringify({ 
            success: true, 
            variations,
            count: variations.length
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error(`[${body.site}] 获取变体失败:`, err)
          return new Response(JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      case 'sync-variations': {
        try {
          const { site, limit = 50, offset = 0 } = body as SyncVariationsRequest
          const result = await syncVariationsBatch(supabase, site, limit, offset)
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error('批量同步变体失败:', err)
          return new Response(JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      case 'rebuild-variations': {
        try {
          const { sku, sites } = body as RebuildVariationsRequest
          const result = await rebuildVariations(supabase, sku, sites)
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error('重建变体失败:', err)
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

