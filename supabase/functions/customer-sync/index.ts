/**
 * Supabase Edge Function: customer-sync
 * 客户同步服务
 *
 * 支持的 actions:
 * - extract-from-orders: 从订单表提取客户数据到 customers 表
 * - sync-from-woocommerce: 从 WooCommerce /customers API 补充客户数据
 * - get-customers: 列表查询（分页、筛选）
 * - get-customer: 获取单个客户详情
 * - get-stats: 获取客户统计数据
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== 类型定义 ====================

type SiteKey = 'com' | 'uk' | 'de' | 'fr';

interface ExtractFromOrdersRequest {
  action: 'extract-from-orders';
  batchSize?: number; // 每批处理数量，默认 500
}

interface SyncFromWooCommerceRequest {
  action: 'sync-from-woocommerce';
  site: SiteKey;
  emails?: string[]; // 指定邮箱，不传则同步所有
  batchSize?: number;
  startPage?: number; // 从第几页开始（用于断点续传）
  maxPages?: number;  // 最多处理几页（默认 50 页 = 5000 客户）
}

interface GetCustomersRequest {
  action: 'get-customers';
  page?: number;
  perPage?: number;
  search?: string;
  assignedSite?: SiteKey | 'unassigned';
  migrationStatus?: 'pending' | 'migrated' | 'skipped' | 'error';
  assignmentMethod?: 'address' | 'email_domain' | 'ai_analysis' | 'manual';
  sortField?: 'valid_spent' | 'invalid_spent' | 'valid_orders' | 'total_spent';
  sortOrder?: 'asc' | 'desc';
}

interface GetCustomerRequest {
  action: 'get-customer';
  email: string;
}

interface GetStatsRequest {
  action: 'get-stats';
}

type RequestBody = ExtractFromOrdersRequest | SyncFromWooCommerceRequest | GetCustomersRequest | GetCustomerRequest | GetStatsRequest;

// ==================== 配置 ====================

const SITE_CONFIGS: Record<SiteKey, { domain: string; keyEnv: string; secretEnv: string }> = {
  com: { domain: 'jerseysfever.com', keyEnv: 'WOO_COM_KEY', secretEnv: 'WOO_COM_SECRET' },
  uk: { domain: 'jerseysfever.uk', keyEnv: 'WOO_UK_KEY', secretEnv: 'WOO_UK_SECRET' },
  de: { domain: 'jerseysfever.de', keyEnv: 'WOO_DE_KEY', secretEnv: 'WOO_DE_SECRET' },
  fr: { domain: 'jerseysfever.fr', keyEnv: 'WOO_FR_KEY', secretEnv: 'WOO_FR_SECRET' },
};

// ==================== WooCommerce API ====================

function getWooAuth(site: SiteKey): string {
  const config = SITE_CONFIGS[site];
  const key = Deno.env.get(config.keyEnv) || '';
  const secret = Deno.env.get(config.secretEnv) || '';
  return btoa(`${key}:${secret}`);
}

function getWooBaseUrl(site: SiteKey): string {
  const domain = SITE_CONFIGS[site].domain;
  return `https://${domain}/wp-json/wc/v3`;
}

async function fetchWooCustomers(site: SiteKey, params: Record<string, string> = {}): Promise<any[]> {
  const baseUrl = getWooBaseUrl(site);
  const auth = getWooAuth(site);

  const searchParams = new URLSearchParams({
    per_page: '100',
    ...params,
  });

  const response = await fetch(`${baseUrl}/customers?${searchParams}`, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${error}`);
  }

  return response.json();
}

async function fetchWooCustomerByEmail(site: SiteKey, email: string): Promise<any | null> {
  try {
    const customers = await fetchWooCustomers(site, { email });
    return customers.length > 0 ? customers[0] : null;
  } catch {
    return null;
  }
}

// ==================== 主处理函数 ====================

Deno.serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 创建 Supabase Admin 客户端
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: RequestBody = await req.json();

    switch (body.action) {
      case 'extract-from-orders':
        return await handleExtractFromOrders(supabase, body);

      case 'sync-from-woocommerce':
        return await handleSyncFromWooCommerce(supabase, body);

      case 'get-customers':
        return await handleGetCustomers(supabase, body);

      case 'get-customer':
        return await handleGetCustomer(supabase, body);

      case 'get-stats':
        return await handleGetStats(supabase);

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ==================== Action Handlers ====================

/**
 * 从订单表提取客户数据
 * 使用数据库存储过程直接在 PostgreSQL 中完成提取和插入，避免行数限制
 */
async function handleExtractFromOrders(
  supabase: ReturnType<typeof createClient>,
  _body: ExtractFromOrdersRequest
): Promise<Response> {
  // 调用数据库存储过程，在数据库端完成所有操作
  const { data, error } = await supabase.rpc('upsert_customers_from_orders');

  if (error) {
    console.error('RPC error:', error);
    return new Response(
      JSON.stringify({ error: `Failed to extract customers: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const result = data?.[0] || { extracted: 0, inserted: 0, assigned: 0 };

  return new Response(
    JSON.stringify({
      success: true,
      extracted: result.extracted,
      inserted: result.inserted,
      assigned: result.assigned,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 插入或更新 WooCommerce 客户
 */
async function upsertWooCustomer(
  supabase: ReturnType<typeof createClient>,
  wooCustomer: any,
  site: SiteKey,
  countryToSite: Record<string, SiteKey>
): Promise<{ created: boolean; updated: boolean }> {
  const email = wooCustomer.email?.toLowerCase().trim();
  if (!email) return { created: false, updated: false };

  // 检查本地是否存在该客户
  const { data: existing } = await supabase
    .from('customers')
    .select('email, woo_ids, assigned_site')
    .eq('email', email)
    .single();

  const billing = wooCustomer.billing || {};
  const shipping = wooCustomer.shipping || {};
  const country = shipping.country || billing.country;

  if (existing) {
    // 更新现有客户
    const currentWooIds = existing.woo_ids || {};
    const { error } = await supabase
      .from('customers')
      .update({
        woo_ids: { ...currentWooIds, [site]: wooCustomer.id },
        phone: billing.phone || null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('email', email);

    return { created: false, updated: !error };
  } else {
    // 创建新客户
    const assignedSite = country ? countryToSite[country] || null : null;

    const { error } = await supabase
      .from('customers')
      .insert({
        email,
        first_name: wooCustomer.first_name || billing.first_name || '',
        last_name: wooCustomer.last_name || billing.last_name || '',
        phone: billing.phone || null,
        woo_ids: { [site]: wooCustomer.id },
        billing_address: billing,
        shipping_address: shipping,
        assigned_site: assignedSite,
        assignment_method: assignedSite ? 'address' : null,
        assignment_confidence: assignedSite ? 0.85 : null,
        assignment_reason: assignedSite ? `Based on WooCommerce address country: ${country}` : null,
        order_stats: {
          total_orders: 0,
          total_spent: 0,
          valid_orders: 0,
          valid_spent: 0,
          invalid_orders: 0,
          invalid_spent: 0,
          first_order_date: null,
          last_order_date: null,
          by_site: {},
        },
        last_synced_at: new Date().toISOString(),
      });

    return { created: !error, updated: false };
  }
}

/**
 * 从 WooCommerce 同步客户数据（包括新增客户）
 */
async function handleSyncFromWooCommerce(
  supabase: ReturnType<typeof createClient>,
  body: SyncFromWooCommerceRequest
): Promise<Response> {
  const { site, emails, batchSize = 100, startPage = 1, maxPages = 50 } = body;

  // 获取国家到站点的映射
  const { data: countryMappings } = await supabase
    .from('country_site_mapping')
    .select('country_code, assigned_site');

  const countryToSite: Record<string, SiteKey> = {};
  (countryMappings || []).forEach((m: any) => {
    countryToSite[m.country_code] = m.assigned_site;
  });

  let synced = 0;
  let created = 0;
  let errors: string[] = [];
  let lastPage = startPage;
  let hasMore = true;

  if (emails && emails.length > 0) {
    // 同步指定邮箱
    for (const email of emails) {
      try {
        const wooCustomer = await fetchWooCustomerByEmail(site, email);
        if (wooCustomer) {
          const result = await upsertWooCustomer(supabase, wooCustomer, site, countryToSite);
          if (result.created) created++;
          else if (result.updated) synced++;
        }
      } catch (e) {
        errors.push(`${email}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }
  } else {
    // 分页获取 WooCommerce 客户（支持断点续传）
    let page = startPage;
    let pagesProcessed = 0;

    while (hasMore && pagesProcessed < maxPages) {
      try {
        const customers = await fetchWooCustomers(site, {
          page: String(page),
          per_page: String(batchSize),
        });

        if (customers.length === 0) {
          hasMore = false;
          break;
        }

        // 批量处理
        for (const wooCustomer of customers) {
          const email = wooCustomer.email?.toLowerCase().trim();
          if (!email) continue;

          try {
            const result = await upsertWooCustomer(supabase, wooCustomer, site, countryToSite);
            if (result.created) created++;
            else if (result.updated) synced++;
          } catch (e) {
            // 忽略单个客户错误，继续处理
          }
        }

        console.log(`[${site}] Page ${page}: processed ${customers.length} customers`);
        lastPage = page;
        page++;
        pagesProcessed++;

        if (customers.length < batchSize) {
          hasMore = false;
        }
      } catch (e) {
        errors.push(`Page ${page}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        hasMore = false;
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      site,
      synced,
      created,
      lastPage,
      hasMore,
      nextPage: hasMore ? lastPage + 1 : null,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 获取客户列表（支持按 JSONB 字段排序）
 */
async function handleGetCustomers(
  supabase: ReturnType<typeof createClient>,
  body: GetCustomersRequest
): Promise<Response> {
  const {
    page = 1,
    perPage = 50,
    search,
    assignedSite,
    migrationStatus,
    assignmentMethod,
    sortField,
    sortOrder = 'desc',
  } = body;

  // 使用数据库函数支持 JSONB 字段排序
  const { data, error } = await supabase.rpc('get_customers_sorted', {
    p_page: page,
    p_per_page: perPage,
    p_search: search || null,
    p_assigned_site: assignedSite || null,
    p_migration_status: migrationStatus || null,
    p_assignment_method: assignmentMethod || null,
    p_sort_field: sortField || null,
    p_sort_order: sortOrder,
  });

  const result = data?.[0] || { customers: [], total: 0 };
  const customers = result.customers || [];
  const count = result.total || 0;

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      customers,
      total: count,
      page,
      perPage,
      totalPages: Math.ceil((count || 0) / perPage),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 获取单个客户
 */
async function handleGetCustomer(
  supabase: ReturnType<typeof createClient>,
  body: GetCustomerRequest
): Promise<Response> {
  const { email } = body;

  // 获取客户基本信息
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !customer) {
    return new Response(
      JSON.stringify({ error: 'Customer not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 获取相关订单
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, site, status, total, date_created')
    .eq('customer_email', email)
    .order('date_created', { ascending: false })
    .limit(20);

  return new Response(
    JSON.stringify({
      customer,
      orders: orders || [],
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 获取客户统计数据
 * 使用数据库函数避免行数限制
 */
async function handleGetStats(
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  const { data, error } = await supabase.rpc('get_customer_stats');

  if (error) {
    console.error('Stats error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const stats = data?.[0] || {};

  return new Response(
    JSON.stringify({
      totalCustomers: Number(stats.total_customers) || 0,
      siteDistribution: {
        de: Number(stats.site_de) || 0,
        com: Number(stats.site_com) || 0,
        uk: Number(stats.site_uk) || 0,
        fr: Number(stats.site_fr) || 0,
        unassigned: Number(stats.site_unassigned) || 0,
      },
      methodDistribution: {
        address: Number(stats.method_address) || 0,
        email_domain: Number(stats.method_email_domain) || 0,
        ai_analysis: Number(stats.method_ai_analysis) || 0,
        manual: Number(stats.method_manual) || 0,
        unassigned: Number(stats.method_unassigned) || 0,
      },
      migrationDistribution: {
        pending: Number(stats.migration_pending) || 0,
        migrated: Number(stats.migration_migrated) || 0,
        skipped: Number(stats.migration_skipped) || 0,
        error: Number(stats.migration_error) || 0,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
