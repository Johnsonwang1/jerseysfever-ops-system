/**
 * Supabase Edge Function: customer-migration
 * 客户数据迁移服务 - 将客户迁移到对应 WooCommerce 站点
 *
 * 支持的 actions:
 * - migrate-customer: 迁移单个客户到目标站点
 * - batch-migrate: 批量迁移客户
 * - validate-migration: 验证迁移状态
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== 类型定义 ====================

type SiteKey = 'com' | 'uk' | 'de' | 'fr';

interface MigrateCustomerRequest {
  action: 'migrate-customer';
  email: string;
  targetSite?: SiteKey; // 不传则使用 assigned_site
  createAccount?: boolean; // 是否在 WooCommerce 创建账号，默认 true
}

interface BatchMigrateRequest {
  action: 'batch-migrate';
  emails?: string[]; // 不传则迁移所有已分配但未迁移的
  batchSize?: number;
}

interface ValidateMigrationRequest {
  action: 'validate-migration';
  emails?: string[];
}

interface SkipMigrationRequest {
  action: 'skip-migration';
  email: string;
  reason?: string;
}

interface CleanupWrongSitesRequest {
  action: 'cleanup-wrong-sites';
  site: SiteKey;  // 要清理的站点（删除非分配到此站点的客户）
  batchSize?: number;
  dryRun?: boolean;
}

interface CreateMissingRequest {
  action: 'create-missing';
  site: SiteKey;  // 在此站点创建缺失的客户
  batchSize?: number;
  dryRun?: boolean;
}

type RequestBody = MigrateCustomerRequest | BatchMigrateRequest | ValidateMigrationRequest | SkipMigrationRequest | CleanupWrongSitesRequest | CreateMissingRequest;

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

async function getWooCustomerByEmail(site: SiteKey, email: string): Promise<any | null> {
  const baseUrl = getWooBaseUrl(site);
  const auth = getWooAuth(site);

  const response = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(email)}`, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const customers = await response.json();
  return customers.length > 0 ? customers[0] : null;
}

async function createWooCustomer(site: SiteKey, customerData: any): Promise<{ id: number } | null> {
  const baseUrl = getWooBaseUrl(site);
  const auth = getWooAuth(site);

  const response = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(customerData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create customer: ${error}`);
  }

  return response.json();
}

async function updateWooCustomer(site: SiteKey, customerId: number, customerData: any): Promise<any> {
  const baseUrl = getWooBaseUrl(site);
  const auth = getWooAuth(site);

  const response = await fetch(`${baseUrl}/customers/${customerId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(customerData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update customer: ${error}`);
  }

  return response.json();
}

async function deleteWooCustomer(site: SiteKey, customerId: number): Promise<boolean> {
  const baseUrl = getWooBaseUrl(site);
  const auth = getWooAuth(site);

  const response = await fetch(`${baseUrl}/customers/${customerId}?force=true`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  // 200 = deleted, 404 = already gone
  return response.ok || response.status === 404;
}

// ==================== 主处理函数 ====================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: RequestBody = await req.json();

    switch (body.action) {
      case 'migrate-customer':
        return await handleMigrateCustomer(supabase, body);

      case 'batch-migrate':
        return await handleBatchMigrate(supabase, body);

      case 'validate-migration':
        return await handleValidateMigration(supabase, body);

      case 'skip-migration':
        return await handleSkipMigration(supabase, body);

      case 'cleanup-wrong-sites':
        return await handleCleanupWrongSites(supabase, body);

      case 'create-missing':
        return await handleCreateMissing(supabase, body);

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
 * 迁移单个客户
 */
async function handleMigrateCustomer(
  supabase: ReturnType<typeof createClient>,
  body: MigrateCustomerRequest
): Promise<Response> {
  const { email, targetSite, createAccount = true } = body;

  // 获取客户数据
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

  const site = targetSite || customer.assigned_site;
  if (!site) {
    return new Response(
      JSON.stringify({ error: 'No target site specified and customer has no assigned site' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 检查客户是否已存在于目标站点
    const existingCustomer = await getWooCustomerByEmail(site, customer.email);

    let wooCustomerId: number;
    const currentWooIds = customer.woo_ids || {};

    if (existingCustomer) {
      // 更新现有客户
      wooCustomerId = existingCustomer.id;

      if (createAccount) {
        await updateWooCustomer(site, wooCustomerId, {
          first_name: customer.first_name || '',
          last_name: customer.last_name || '',
          billing: customer.billing_address || {},
          shipping: customer.shipping_address || {},
        });
      }
    } else if (createAccount) {
      // 创建新客户
      const newCustomer = await createWooCustomer(site, {
        email: customer.email,
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        billing: {
          ...customer.billing_address,
          email: customer.email,
          first_name: customer.first_name || customer.billing_address?.first_name || '',
          last_name: customer.last_name || customer.billing_address?.last_name || '',
        },
        shipping: {
          ...customer.shipping_address,
          first_name: customer.first_name || customer.shipping_address?.first_name || '',
          last_name: customer.last_name || customer.shipping_address?.last_name || '',
        },
      });

      if (!newCustomer) {
        throw new Error('Failed to create customer in WooCommerce');
      }

      wooCustomerId = newCustomer.id;
    } else {
      // 不创建账号，只标记为已迁移
      wooCustomerId = 0;
    }

    // 更新本地数据库
    await supabase
      .from('customers')
      .update({
        woo_ids: { ...currentWooIds, [site]: wooCustomerId },
        migration_status: 'migrated',
        migrated_at: new Date().toISOString(),
        migration_error: null,
      })
      .eq('email', customer.email);

    return new Response(
      JSON.stringify({
        success: true,
        email: customer.email,
        site,
        wooCustomerId,
        action: existingCustomer ? 'updated' : (createAccount ? 'created' : 'marked'),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    // 记录错误
    await supabase
      .from('customers')
      .update({
        migration_status: 'error',
        migration_error: e instanceof Error ? e.message : 'Unknown error',
      })
      .eq('email', customer.email);

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Migration failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * 批量迁移客户
 */
async function handleBatchMigrate(
  supabase: ReturnType<typeof createClient>,
  body: BatchMigrateRequest
): Promise<Response> {
  const { emails, batchSize = 20 } = body;

  let query = supabase
    .from('customers')
    .select('email, assigned_site')
    .eq('migration_status', 'pending')
    .not('assigned_site', 'is', null);

  if (emails && emails.length > 0) {
    query = query.in('email', emails.map(e => e.toLowerCase()));
  }

  const { data: customers, error } = await query.limit(batchSize);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const results: { email: string; success: boolean; site?: SiteKey; error?: string }[] = [];

  for (const customer of customers || []) {
    try {
      const migrateResponse = await handleMigrateCustomer(supabase, {
        action: 'migrate-customer',
        email: customer.email,
      });

      const migrateResult = await migrateResponse.json();

      if (migrateResult.success) {
        results.push({
          email: customer.email,
          success: true,
          site: customer.assigned_site,
        });
      } else {
        results.push({
          email: customer.email,
          success: false,
          error: migrateResult.error,
        });
      }

      // 避免 API 限速
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
      results.push({
        email: customer.email,
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return new Response(
    JSON.stringify({
      success: true,
      total: customers?.length || 0,
      migrated: successCount,
      failed: results.length - successCount,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 验证迁移状态
 */
async function handleValidateMigration(
  supabase: ReturnType<typeof createClient>,
  body: ValidateMigrationRequest
): Promise<Response> {
  const { emails } = body;

  let query = supabase
    .from('customers')
    .select('email, assigned_site, woo_ids, migration_status')
    .eq('migration_status', 'migrated');

  if (emails && emails.length > 0) {
    query = query.in('email', emails.map(e => e.toLowerCase()));
  }

  const { data: customers, error } = await query.limit(100);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const results: { email: string; site: SiteKey; valid: boolean; wooCustomerId?: number }[] = [];

  for (const customer of customers || []) {
    const site = customer.assigned_site as SiteKey;
    const wooId = customer.woo_ids?.[site];

    if (!site || !wooId) {
      results.push({ email: customer.email, site, valid: false });
      continue;
    }

    try {
      const wooCustomer = await getWooCustomerByEmail(site, customer.email);
      results.push({
        email: customer.email,
        site,
        valid: !!wooCustomer,
        wooCustomerId: wooCustomer?.id,
      });
    } catch {
      results.push({ email: customer.email, site, valid: false });
    }

    // 避免 API 限速
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const validCount = results.filter(r => r.valid).length;

  return new Response(
    JSON.stringify({
      success: true,
      total: customers?.length || 0,
      valid: validCount,
      invalid: results.length - validCount,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 跳过迁移
 */
async function handleSkipMigration(
  supabase: ReturnType<typeof createClient>,
  body: SkipMigrationRequest
): Promise<Response> {
  const { email, reason } = body;

  const { error } = await supabase
    .from('customers')
    .update({
      migration_status: 'skipped',
      migration_error: reason || 'Skipped by user',
    })
    .eq('email', email.toLowerCase());

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, email }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 清理错误站点的客户
 * 删除分配到其他站点但在当前站点有 woo_id 的客户
 */
async function handleCleanupWrongSites(
  supabase: ReturnType<typeof createClient>,
  body: CleanupWrongSitesRequest
): Promise<Response> {
  const { site, batchSize = 50, dryRun = false } = body;

  // 使用 RPC 或直接 SQL 查询更高效
  // 获取分配到其他站点但在当前站点有 woo_id 的客户
  const { data: customers, error } = await supabase
    .rpc('get_customers_to_cleanup', {
      target_site: site,
      batch_limit: batchSize
    });

  if (error) {
    // 如果 RPC 不存在，回退到普通查询（效率较低）
    console.log('RPC not available, falling back to standard query');
    const { data: fallbackCustomers, error: fallbackError } = await supabase
      .from('customers')
      .select('email, assigned_site, woo_ids')
      .neq('assigned_site', site)
      .not('woo_ids', 'is', null)
      .limit(batchSize * 10);  // 取更多记录来补偿过滤损失

    if (fallbackError) {
      return new Response(
        JSON.stringify({ error: fallbackError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 过滤出在当前站点有 woo_id 的客户
    const filtered = (fallbackCustomers || [])
      .filter(c => {
        const wooIds = c.woo_ids || {};
        return site in wooIds;
      })
      .slice(0, batchSize);

    return await processCleanup(supabase, site, filtered, dryRun);
  }

  // RPC 直接返回需要处理的客户
  return await processCleanup(supabase, site, customers || [], dryRun);
}

async function processCleanup(
  supabase: ReturnType<typeof createClient>,
  site: SiteKey,
  toDelete: any[],
  dryRun: boolean
): Promise<Response> {
  const results: { email: string; success: boolean; error?: string }[] = [];

  for (const customer of toDelete) {
    const wooId = customer.woo_ids[site];

    if (dryRun) {
      results.push({ email: customer.email, success: true });
      continue;
    }

    try {
      // 删除 WooCommerce 客户
      const deleted = await deleteWooCustomer(site, wooId);

      if (deleted) {
        // 更新 Supabase，移除该站点的 woo_id
        const newWooIds = { ...customer.woo_ids };
        delete newWooIds[site];

        await supabase
          .from('customers')
          .update({ woo_ids: newWooIds })
          .eq('email', customer.email);

        results.push({ email: customer.email, success: true });
      } else {
        results.push({ email: customer.email, success: false, error: 'Failed to delete' });
      }

      // 避免 API 限速
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
      results.push({
        email: customer.email,
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return new Response(
    JSON.stringify({
      success: true,
      site,
      dryRun,
      total: toDelete.length,
      deleted: successCount,
      failed: results.length - successCount,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 在分配站点创建缺失的客户
 */
async function handleCreateMissing(
  supabase: ReturnType<typeof createClient>,
  body: CreateMissingRequest
): Promise<Response> {
  const { site, batchSize = 50, dryRun = false } = body;

  // 获取分配到当前站点但没有 woo_id 的客户
  const { data: customers, error } = await supabase
    .from('customers')
    .select('email, first_name, last_name, assigned_site, woo_ids, billing_address, shipping_address')
    .eq('assigned_site', site)
    .limit(batchSize * 2);  // 多取一些，因为要过滤

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 过滤出在当前站点没有 woo_id 的客户
  const toCreate = (customers || [])
    .filter(c => {
      const wooIds = c.woo_ids || {};
      return !(site in wooIds);
    })
    .slice(0, batchSize);

  const results: { email: string; success: boolean; wooId?: number; error?: string }[] = [];

  for (const customer of toCreate) {
    if (dryRun) {
      results.push({ email: customer.email, success: true });
      continue;
    }

    try {
      // 先检查是否已存在（可能之前创建过）
      const existing = await getWooCustomerByEmail(site, customer.email);

      let wooId: number;

      if (existing) {
        wooId = existing.id;
      } else {
        // 创建新客户
        const created = await createWooCustomer(site, {
          email: customer.email,
          first_name: customer.first_name || '',
          last_name: customer.last_name || '',
          billing: {
            ...customer.billing_address,
            email: customer.email,
            first_name: customer.first_name || customer.billing_address?.first_name || '',
            last_name: customer.last_name || customer.billing_address?.last_name || '',
          },
          shipping: {
            ...customer.shipping_address,
            first_name: customer.first_name || customer.shipping_address?.first_name || '',
            last_name: customer.last_name || customer.shipping_address?.last_name || '',
          },
        });

        if (!created) {
          throw new Error('Failed to create customer');
        }

        wooId = created.id;
      }

      // 更新 Supabase
      const newWooIds = { ...customer.woo_ids, [site]: wooId };
      await supabase
        .from('customers')
        .update({ woo_ids: newWooIds })
        .eq('email', customer.email);

      results.push({ email: customer.email, success: true, wooId });

      // 避免 API 限速
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
      results.push({
        email: customer.email,
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return new Response(
    JSON.stringify({
      success: true,
      site,
      dryRun,
      total: toCreate.length,
      created: successCount,
      failed: results.length - successCount,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
