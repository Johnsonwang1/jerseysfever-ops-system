// Facebook Ads 数据层
// 从 Supabase 获取同步后的广告数据

import { supabase } from './supabase'

// Types
export interface FbAdAccount {
  id: string
  account_id: string
  account_name: string | null
  currency: string
  is_active: boolean
}

export interface FbAdDaily {
  id: string
  date: string
  account_id: string
  campaign_id: string | null
  campaign_name: string | null
  adset_id: string | null
  adset_name: string | null
  ad_id: string | null
  ad_name: string | null
  country: string | null
  spend: number
  impressions: number
  clicks: number
  reach: number
  cpc: number | null
  cpm: number | null
  ctr: number | null
  purchases: number
  purchase_value: number
  add_to_cart: number
  view_content: number
  currency: string
}

export interface FbAdsSummary {
  total_spend: number
  total_impressions: number
  total_clicks: number
  total_reach: number
  total_purchase_value: number
  avg_cpc: number
  avg_cpm: number
  avg_ctr: number
  avg_roas: number
  by_country: Record<string, { spend: number; impressions: number; clicks: number; purchase_value: number; roas: number }>
}

export interface CampaignPerformance {
  campaign_id: string
  campaign_name: string
  account_id: string
  spend: number
  impressions: number
  clicks: number
  reach: number
  cpc: number
  cpm: number
  ctr: number
  // 转化指标
  purchases: number
  add_to_cart: number
  initiate_checkout: number
  view_content: number
  landing_page_view: number
  fb_purchase_value: number
  // 计算指标
  roas: number                  // 购买价值/花费
  add_to_cart_rate: number      // 加购率 = 加购/点击
  checkout_rate: number         // 结算率 = 结算/加购
  cvr: number                   // 转化率 = 购买/点击
}

export interface DailyTrend {
  date: string
  country?: string
  spend: number
  impressions: number
  clicks: number
  reach: number
  fb_purchase_value: number
  purchases: number
  // 计算指标
  roas: number
  cpm: number
  ctr: number
  cpc: number
}

export interface ExchangeRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  is_active: boolean
}

export interface FbSyncLog {
  id: string
  sync_type: string
  status: string
  date_from: string | null
  date_to: string | null
  records_synced: number
  error_message: string | null
  started_at: string
  completed_at: string | null
}

// 获取广告账户列表
export async function getFbAdAccounts(): Promise<FbAdAccount[]> {
  const { data, error } = await supabase
    .from('fb_ad_accounts')
    .select('*')
    .eq('is_active', true)
    .order('account_name')

  if (error) throw error
  return data || []
}

// 获取广告数据汇总
export async function getFbAdsSummary(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
}): Promise<FbAdsSummary> {
  const { dateFrom, dateTo, accountIds } = params

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

  // 聚合计算
  const summary: FbAdsSummary = {
    total_spend: 0,
    total_impressions: 0,
    total_clicks: 0,
    total_reach: 0,
    total_purchase_value: 0,
    avg_cpc: 0,
    avg_cpm: 0,
    avg_ctr: 0,
    avg_roas: 0,
    by_country: {},
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

  // 计算平均值
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

// 获取 Campaign 表现数据
export async function getCampaignPerformance(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
}): Promise<CampaignPerformance[]> {
  const { dateFrom, dateTo, accountIds } = params

  let query = supabase
    .from('fb_ads_daily')
    .select('campaign_id, campaign_name, account_id, spend, impressions, clicks, reach, purchases, add_to_cart, initiate_checkout, view_content, landing_page_view, fb_purchase_value')
    .gte('date', dateFrom)
    .lte('date', dateTo)

  if (accountIds && accountIds.length > 0) {
    query = query.in('account_id', accountIds)
  }

  const { data, error } = await query

  if (error) throw error

  // 按 campaign 聚合
  const campaignMap = new Map<string, CampaignPerformance>()

  for (const row of data || []) {
    const key = row.campaign_id || 'unknown'
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        campaign_id: row.campaign_id || 'unknown',
        campaign_name: row.campaign_name || 'Unknown Campaign',
        account_id: row.account_id,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
        purchases: 0,
        add_to_cart: 0,
        initiate_checkout: 0,
        view_content: 0,
        landing_page_view: 0,
        fb_purchase_value: 0,
        roas: 0,
        add_to_cart_rate: 0,
        checkout_rate: 0,
        cvr: 0,
      })
    }
    const campaign = campaignMap.get(key)!
    campaign.spend += Number(row.spend) || 0
    campaign.impressions += row.impressions || 0
    campaign.clicks += row.clicks || 0
    campaign.reach += row.reach || 0
    campaign.purchases += row.purchases || 0
    campaign.add_to_cart += row.add_to_cart || 0
    campaign.initiate_checkout += row.initiate_checkout || 0
    campaign.view_content += row.view_content || 0
    campaign.landing_page_view += row.landing_page_view || 0
    campaign.fb_purchase_value += Number(row.fb_purchase_value) || 0
  }

  // 计算指标并排序
  return Array.from(campaignMap.values())
    .map(c => ({
      ...c,
      cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      roas: c.spend > 0 ? c.fb_purchase_value / c.spend : 0,
      add_to_cart_rate: c.clicks > 0 ? (c.add_to_cart / c.clicks) * 100 : 0,
      checkout_rate: c.add_to_cart > 0 ? (c.initiate_checkout / c.add_to_cart) * 100 : 0,
      cvr: c.clicks > 0 ? (c.purchases / c.clicks) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend)
}

// 获取每日趋势 (按日期聚合 - 用于广告分析)
export async function getDailyTrend(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
}): Promise<DailyTrend[]> {
  const { dateFrom, dateTo, accountIds } = params

  let query = supabase
    .from('fb_ads_daily')
    .select('date, spend, impressions, clicks, reach, fb_purchase_value, purchases')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true })

  if (accountIds && accountIds.length > 0) {
    query = query.in('account_id', accountIds)
  }

  const { data, error } = await query

  if (error) throw error

  // 按日期聚合
  const dailyMap = new Map<string, DailyTrend>()

  for (const row of data || []) {
    const date = row.date
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        fb_purchase_value: 0,
        purchases: 0,
        roas: 0,
        cpm: 0,
        ctr: 0,
        cpc: 0,
      })
    }
    const day = dailyMap.get(date)!
    day.spend += Number(row.spend) || 0
    day.impressions += row.impressions || 0
    day.clicks += row.clicks || 0
    day.reach += row.reach || 0
    day.fb_purchase_value += Number(row.fb_purchase_value) || 0
    day.purchases += row.purchases || 0
  }

  // 计算率指标
  return Array.from(dailyMap.values())
    .map(day => ({
      ...day,
      roas: day.spend > 0 ? day.fb_purchase_value / day.spend : 0,
      cpm: day.impressions > 0 ? (day.spend / day.impressions) * 1000 : 0,
      ctr: day.impressions > 0 ? (day.clicks / day.impressions) * 100 : 0,
      cpc: day.clicks > 0 ? day.spend / day.clicks : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// 获取每日趋势 (按日期+国家 - 用于销售分析的 ROAS 计算)
export async function getDailyTrendByCountry(params: {
  dateFrom: string
  dateTo: string
}): Promise<DailyTrend[]> {
  const { dateFrom, dateTo } = params

  const { data, error } = await supabase
    .from('fb_ads_daily')
    .select('date, country, spend, impressions, clicks, reach, fb_purchase_value, purchases')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true })

  if (error) throw error

  // 按日期+国家聚合
  const dailyMap = new Map<string, DailyTrend>()

  for (const row of data || []) {
    const key = `${row.date}|${row.country || 'unknown'}`
    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        date: row.date,
        country: row.country || 'unknown',
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        fb_purchase_value: 0,
        purchases: 0,
        roas: 0,
        cpm: 0,
        ctr: 0,
        cpc: 0,
      })
    }
    const day = dailyMap.get(key)!
    day.spend += Number(row.spend) || 0
    day.impressions += row.impressions || 0
    day.clicks += row.clicks || 0
    day.reach += row.reach || 0
    day.fb_purchase_value += Number(row.fb_purchase_value) || 0
    day.purchases += row.purchases || 0
  }

  // 计算率指标
  return Array.from(dailyMap.values())
    .map(day => ({
      ...day,
      roas: day.spend > 0 ? day.fb_purchase_value / day.spend : 0,
      cpm: day.impressions > 0 ? (day.spend / day.impressions) * 1000 : 0,
      ctr: day.impressions > 0 ? (day.clicks / day.impressions) * 100 : 0,
      cpc: day.clicks > 0 ? day.spend / day.clicks : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// 获取国家分布
export async function getCountryBreakdown(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
}): Promise<Array<{ country: string; spend: number; impressions: number; clicks: number; cpc: number; ctr: number }>> {
  const { dateFrom, dateTo, accountIds } = params

  let query = supabase
    .from('fb_ads_daily')
    .select('country, spend, impressions, clicks')
    .gte('date', dateFrom)
    .lte('date', dateTo)

  if (accountIds && accountIds.length > 0) {
    query = query.in('account_id', accountIds)
  }

  const { data, error } = await query

  if (error) throw error

  // 按国家聚合
  const countryMap = new Map<string, { spend: number; impressions: number; clicks: number }>()

  for (const row of data || []) {
    const country = row.country || 'unknown'
    if (!countryMap.has(country)) {
      countryMap.set(country, { spend: 0, impressions: 0, clicks: 0 })
    }
    const c = countryMap.get(country)!
    c.spend += Number(row.spend) || 0
    c.impressions += row.impressions || 0
    c.clicks += row.clicks || 0
  }

  return Array.from(countryMap.entries())
    .map(([country, stats]) => ({
      country,
      ...stats,
      cpc: stats.clicks > 0 ? stats.spend / stats.clicks : 0,
      ctr: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
    }))
    .filter(c => c.country !== 'unknown' && c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
}

// 获取汇率
export async function getExchangeRates(): Promise<ExchangeRate[]> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('is_active', true)

  if (error) throw error
  return data || []
}

// 获取同步日志
export async function getSyncLogs(limit = 10): Promise<FbSyncLog[]> {
  const { data, error } = await supabase
    .from('fb_sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

// 触发数据同步 (调用 Edge Function)
export async function syncFbAdsData(dateFrom: string, dateTo: string): Promise<{ success: boolean; records_synced?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('fb-ads-sync', {
    body: {
      action: 'sync',
      date_from: dateFrom,
      date_to: dateTo,
    },
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return data
}

// 获取最后同步时间
export async function getLastSyncTime(): Promise<string | null> {
  const { data, error } = await supabase
    .from('fb_ads_daily')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data.synced_at
}

// 国家代码映射
export const COUNTRY_NAMES: Record<string, string> = {
  DE: '德国',
  FR: '法国',
  GB: '英国',
  US: '美国',
  IT: '意大利',
  ES: '西班牙',
  NL: '荷兰',
  BE: '比利时',
  AT: '奥地利',
  CH: '瑞士',
  unknown: '未知',
}

// 格式化货币
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// 格式化百分比
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

// 格式化数字
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(Math.round(value))
}

// 广告国家代码 → 站点映射
export const COUNTRY_TO_SITE: Record<string, string> = {
  DE: 'de',
  FR: 'fr',
  GB: 'uk',
  US: 'com',
}

// 站点 → 货币映射
export const SITE_CURRENCIES: Record<string, string> = {
  com: 'USD',
  uk: 'GBP',
  de: 'EUR',
  fr: 'EUR',
}

// 汇率转换到 USD
export function convertToUSD(amount: number, currency: string, rates: ExchangeRate[]): number {
  if (currency === 'USD') return amount
  const rate = rates.find(r => r.from_currency === currency)
  return amount * (rate?.rate || 1)
}

// ROAS 数据接口
export interface RoasData {
  totalSpend: number      // USD
  totalRevenue: number    // USD
  roas: number            // 比率
  byCountry: Array<{
    country: string
    site: string
    spend: number         // USD
    revenue: number       // USD (converted)
    roas: number
  }>
}

// Campaign 每日趋势数据接口
export interface CampaignDailyData {
  date: string
  spend: number
  impressions: number
  clicks: number
  reach: number
  purchases: number
  add_to_cart: number
  initiate_checkout: number
  fb_purchase_value: number
  // 计算指标
  roas: number
  cpc: number
  cpm: number
  ctr: number
  cvr: number
  add_to_cart_rate: number
  checkout_rate: number
}

// 获取 Campaign 每日趋势数据
export async function getCampaignDailyTrend(params: {
  campaignId: string
  dateFrom: string
  dateTo: string
}): Promise<CampaignDailyData[]> {
  const { campaignId, dateFrom, dateTo } = params

  const { data, error } = await supabase
    .from('fb_ads_daily')
    .select('date, spend, impressions, clicks, reach, purchases, add_to_cart, initiate_checkout, fb_purchase_value')
    .eq('campaign_id', campaignId)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true })

  if (error) throw error

  // 按日期聚合 (同一 campaign 可能有多个国家/ad)
  const dailyMap = new Map<string, CampaignDailyData>()

  for (const row of data || []) {
    const date = row.date
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        purchases: 0,
        add_to_cart: 0,
        initiate_checkout: 0,
        fb_purchase_value: 0,
        roas: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
        cvr: 0,
        add_to_cart_rate: 0,
        checkout_rate: 0,
      })
    }
    const day = dailyMap.get(date)!
    day.spend += Number(row.spend) || 0
    day.impressions += row.impressions || 0
    day.clicks += row.clicks || 0
    day.reach += row.reach || 0
    day.purchases += row.purchases || 0
    day.add_to_cart += row.add_to_cart || 0
    day.initiate_checkout += row.initiate_checkout || 0
    day.fb_purchase_value += Number(row.fb_purchase_value) || 0
  }

  // 计算率指标
  return Array.from(dailyMap.values())
    .map(day => ({
      ...day,
      roas: day.spend > 0 ? day.fb_purchase_value / day.spend : 0,
      cpc: day.clicks > 0 ? day.spend / day.clicks : 0,
      cpm: day.impressions > 0 ? (day.spend / day.impressions) * 1000 : 0,
      ctr: day.impressions > 0 ? (day.clicks / day.impressions) * 100 : 0,
      cvr: day.clicks > 0 ? (day.purchases / day.clicks) * 100 : 0,
      add_to_cart_rate: day.clicks > 0 ? (day.add_to_cart / day.clicks) * 100 : 0,
      checkout_rate: day.add_to_cart > 0 ? (day.initiate_checkout / day.add_to_cart) * 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// 获取 ROAS 数据 (关联广告花费和订单收入)
export async function getRoasData(params: {
  dateFrom: string
  dateTo: string
  accountIds?: string[]
}): Promise<RoasData> {
  const { dateFrom, dateTo, accountIds } = params

  // 1. 获取广告花费 (按国家)
  let adsQuery = supabase
    .from('fb_ads_daily')
    .select('country, spend, currency')
    .gte('date', dateFrom)
    .lte('date', dateTo)

  if (accountIds && accountIds.length > 0) {
    adsQuery = adsQuery.in('account_id', accountIds)
  }

  const { data: adsData, error: adsError } = await adsQuery
  if (adsError) throw adsError

  // 2. 获取订单收入 (按站点)
  const { data: ordersData, error: ordersError } = await supabase
    .from('orders')
    .select('site, currency, total')
    .gte('date_created', dateFrom)
    .lte('date_created', dateTo + 'T23:59:59')
    .in('status', ['completed', 'processing'])

  if (ordersError) throw ordersError

  // 3. 获取汇率
  const rates = await getExchangeRates()

  // 4. 按国家聚合广告花费 (转换为 USD)
  const spendByCountry = new Map<string, number>()
  for (const row of adsData || []) {
    const country = row.country || 'unknown'
    const spendUSD = convertToUSD(Number(row.spend) || 0, row.currency || 'USD', rates)
    spendByCountry.set(country, (spendByCountry.get(country) || 0) + spendUSD)
  }

  // 5. 按站点聚合订单收入 (转换为 USD)
  const revenueBySite = new Map<string, number>()
  for (const row of ordersData || []) {
    const site = row.site
    const revenueUSD = convertToUSD(Number(row.total) || 0, row.currency || 'USD', rates)
    revenueBySite.set(site, (revenueBySite.get(site) || 0) + revenueUSD)
  }

  // 6. 关联国家和站点计算 ROAS
  const byCountry: RoasData['byCountry'] = []
  let totalSpend = 0
  let totalRevenue = 0

  for (const [country, spend] of spendByCountry.entries()) {
    if (country === 'unknown') continue

    const site = COUNTRY_TO_SITE[country]
    const revenue = site ? (revenueBySite.get(site) || 0) : 0

    totalSpend += spend
    totalRevenue += revenue

    byCountry.push({
      country,
      site: site || '-',
      spend,
      revenue,
      roas: spend > 0 ? revenue / spend : 0,
    })
  }

  // 添加没有广告但有收入的站点
  for (const [site, revenue] of revenueBySite.entries()) {
    const hasAds = byCountry.some(c => c.site === site)
    if (!hasAds) {
      totalRevenue += revenue
      byCountry.push({
        country: '-',
        site,
        spend: 0,
        revenue,
        roas: 0,
      })
    }
  }

  // 排序
  byCountry.sort((a, b) => b.spend - a.spend)

  return {
    totalSpend,
    totalRevenue,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    byCountry,
  }
}

// ============ 产品广告数据 ============

// 国家到站点的映射
export const COUNTRY_TO_SITE_MAP: Record<string, string> = {
  DE: 'de',
  FR: 'fr',
  GB: 'uk',
  US: 'com',
}

export interface ProductAdPerformance {
  sku: string
  product_name: string
  image: string | null
  spend: number
  impressions: number
  clicks: number
  cpc: number
  cpm: number
  ctr: number
  // 销售数据
  revenue: number
  quantity: number      // 销量（件数）
  order_count: number   // 订单数
  roas: number
}

// 获取产品广告数据（维度：SKU，筛选：日期、国家）
// 关联 products 表获取图片，关联 orders 表获取销售数据
export async function getProductAdsPerformance(params: {
  dateFrom: string
  dateTo: string
  country?: string
  sortBy?: 'spend' | 'cpc' | 'ctr' | 'impressions' | 'clicks' | 'revenue' | 'quantity' | 'order_count' | 'roas'
  sortOrder?: 'asc' | 'desc'
  limit?: number
}): Promise<ProductAdPerformance[]> {
  const { dateFrom, dateTo, country, sortBy = 'spend', sortOrder = 'desc', limit = 500 } = params

  // 直接调用后端 RPC 函数，所有聚合和关联都在数据库完成
  const { data, error } = await supabase.rpc('get_product_ads_performance', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_country: country === 'all' ? null : country
  })
  
  if (error) throw error

  // 转换为前端格式
  const result: ProductAdPerformance[] = (data || []).map((row: any) => ({
    sku: row.sku,
    product_name: row.product_name || row.sku,
    image: row.image_url || null,
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    cpc: Number(row.cpc) || 0,
    cpm: 0,
    ctr: Number(row.ctr) || 0,
    revenue: Number(row.revenue) || 0,
    quantity: Number(row.quantity) || 0,       // 销量
    order_count: Number(row.order_count) || 0, // 订单数
    roas: Number(row.roas) || 0,
  }))

  // 前端排序（数据库已按 spend DESC 排序，如果需要其他排序再处理）
  if (sortBy !== 'spend' || sortOrder !== 'desc') {
    result.sort((a, b) => {
      const aVal = a[sortBy] ?? 0
      const bVal = b[sortBy] ?? 0
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
    })
  }

  return result.slice(0, limit)
}

// 获取产品广告汇总统计
export async function getProductAdsSummary(params: {
  dateFrom: string
  dateTo: string
  country?: string
}): Promise<{
  totalSpend: number
  totalImpressions: number
  totalClicks: number
  totalRevenue: number
  avgCpc: number
  avgCtr: number
  avgRoas: number
  productCount: number
}> {
  const { dateFrom, dateTo, country } = params

  // 直接调用后端 RPC 函数，所有聚合都在数据库完成
  const { data, error } = await supabase.rpc('get_product_ads_summary', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_country: country === 'all' ? null : country
  })
  
  if (error) throw error

  const summary = data?.[0] || {}

  return {
    totalSpend: Number(summary.total_spend) || 0,
    totalImpressions: Number(summary.total_impressions) || 0,
    totalClicks: Number(summary.total_clicks) || 0,
    totalRevenue: Number(summary.total_revenue) || 0,
    avgCpc: Number(summary.avg_cpc) || 0,
    avgCtr: Number(summary.avg_ctr) || 0,
    avgRoas: Number(summary.avg_roas) || 0,
    productCount: Number(summary.product_count) || 0,
  }
}
