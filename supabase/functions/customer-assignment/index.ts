/**
 * Supabase Edge Function: customer-assignment
 * 客户站点分配服务
 *
 * 支持的 actions:
 * - assign-by-address: 基于地址国家分配客户到站点
 * - analyze-with-ai: 使用 AI 分析客户数据进行分配
 * - assign-manual: 手动分配客户到站点
 * - batch-assign: 批量分配客户
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== 类型定义 ====================

type SiteKey = 'com' | 'uk' | 'de' | 'fr';

interface AssignByAddressRequest {
  action: 'assign-by-address';
  emails?: string[]; // 指定邮箱，不传则处理所有未分配的
  overwrite?: boolean; // 是否覆盖已有分配，默认 false
}

interface AnalyzeWithAIRequest {
  action: 'analyze-with-ai';
  email: string;
}

interface BatchAnalyzeWithAIRequest {
  action: 'batch-analyze-with-ai';
  emails?: string[]; // 指定邮箱，不传则处理所有未分配且无地址的
  batchSize?: number;
}

interface AssignManualRequest {
  action: 'assign-manual';
  email: string;
  site: SiteKey;
  reason?: string;
}

interface BatchAssignRequest {
  action: 'batch-assign';
  emails: string[];
  site: SiteKey;
  reason?: string;
}

type RequestBody = AssignByAddressRequest | AnalyzeWithAIRequest | BatchAnalyzeWithAIRequest | AssignManualRequest | BatchAssignRequest;

// ==================== Gemini AI 配置 ====================

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// 使用和商品识别相同的模型
type GeminiModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview';
const DEFAULT_MODEL: GeminiModel = 'gemini-3-flash-preview';

// ==================== AI 分析 Prompt ====================

const AI_ANALYSIS_PROMPT = `You are a customer segmentation analyst for a European sports jersey e-commerce business with 4 regional websites:
- jerseysfever.de (German market: Germany, Austria, Switzerland)
- jerseysfever.fr (French market: France, Belgium, Luxembourg, Monaco)
- jerseysfever.uk (UK market: United Kingdom, Ireland)
- jerseysfever.com (International/Other markets)

Analyze the following customer data and determine the most appropriate website for this customer:

Customer Email: {email}
Customer Name: {name}
Phone: {phone}
Order History by Site: {orderHistory}

Based on the available information, analyze:
1. Name patterns (German names like Hans, Klaus, Müller; French names like Jean, Pierre, Dupont; British names like James, William, Smith)
2. Email domain (.de, .fr, .uk, .co.uk suggest specific countries)
3. Phone number country code if present
4. Which site they have ordered from most

Respond with a JSON object only (no markdown, no explanation):
{
  "name_analysis": {
    "detected_origin": "German|French|British|International|Unknown",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation"
  },
  "email_analysis": {
    "domain": "the email domain",
    "domain_country": "DE|FR|GB|null",
    "confidence": 0.0-1.0
  },
  "order_history_analysis": {
    "primary_site": "de|com|uk|fr|null",
    "confidence": 0.0-1.0
  },
  "recommended_site": "de|com|uk|fr",
  "overall_confidence": 0.0-1.0,
  "reasoning": "Overall explanation for the recommendation"
}`;

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
      case 'assign-by-address':
        return await handleAssignByAddress(supabase, body);

      case 'analyze-with-ai':
        return await handleAnalyzeWithAI(supabase, body);

      case 'batch-analyze-with-ai':
        return await handleBatchAnalyzeWithAI(supabase, body);

      case 'assign-manual':
        return await handleAssignManual(supabase, body);

      case 'batch-assign':
        return await handleBatchAssign(supabase, body);

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
 * 基于地址国家分配客户
 */
async function handleAssignByAddress(
  supabase: ReturnType<typeof createClient>,
  body: AssignByAddressRequest
): Promise<Response> {
  const { emails, overwrite = false } = body;

  // 获取国家到站点的映射
  const { data: countryMappings } = await supabase
    .from('country_site_mapping')
    .select('country_code, assigned_site');

  const countryToSite: Record<string, SiteKey> = {};
  (countryMappings || []).forEach((m: any) => {
    countryToSite[m.country_code] = m.assigned_site;
  });

  // 构建查询
  let query = supabase.from('customers').select('*');

  if (emails && emails.length > 0) {
    query = query.in('email', emails.map(e => e.toLowerCase()));
  } else if (!overwrite) {
    // 只处理未分配的
    query = query.is('assigned_site', null);
  }

  const { data: customers, error } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let assigned = 0;
  let skipped = 0;
  const results: { email: string; site: SiteKey | null; method: string }[] = [];

  for (const customer of customers || []) {
    // 如果已分配且不覆盖，跳过
    if (customer.assigned_site && !overwrite) {
      skipped++;
      continue;
    }

    // 优先使用收货地址
    const shippingCountry = customer.shipping_address?.country;
    const billingCountry = customer.billing_address?.country;
    const country = shippingCountry || billingCountry;

    if (!country || !countryToSite[country]) {
      // 尝试通过邮箱域名分配
      const emailAssignment = analyzeEmailDomain(customer.email);
      if (emailAssignment) {
        await supabase
          .from('customers')
          .update({
            assigned_site: emailAssignment.site,
            assignment_method: 'email_domain',
            assignment_confidence: emailAssignment.confidence,
            assignment_reason: emailAssignment.reason,
          })
          .eq('email', customer.email);

        assigned++;
        results.push({ email: customer.email, site: emailAssignment.site, method: 'email_domain' });
      } else {
        skipped++;
        results.push({ email: customer.email, site: null, method: 'skipped' });
      }
      continue;
    }

    const assignedSite = countryToSite[country];
    const confidence = shippingCountry ? 0.95 : 0.85;
    const reason = `Based on ${shippingCountry ? 'shipping' : 'billing'} address country: ${country}`;

    await supabase
      .from('customers')
      .update({
        assigned_site: assignedSite,
        assignment_method: 'address',
        assignment_confidence: confidence,
        assignment_reason: reason,
      })
      .eq('email', customer.email);

    assigned++;
    results.push({ email: customer.email, site: assignedSite, method: 'address' });
  }

  return new Response(
    JSON.stringify({
      success: true,
      total: customers?.length || 0,
      assigned,
      skipped,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 分析邮箱域名
 */
function analyzeEmailDomain(email: string): { site: SiteKey; confidence: number; reason: string } | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // 德国域名
  if (domain.endsWith('.de')) {
    return { site: 'de', confidence: 0.75, reason: `Email domain ${domain} suggests German user` };
  }

  // 法国域名
  if (domain.endsWith('.fr')) {
    return { site: 'fr', confidence: 0.75, reason: `Email domain ${domain} suggests French user` };
  }

  // 英国域名
  if (domain.endsWith('.uk') || domain.endsWith('.co.uk')) {
    return { site: 'uk', confidence: 0.75, reason: `Email domain ${domain} suggests UK user` };
  }

  // 比利时可能是法语或荷兰语
  if (domain.endsWith('.be')) {
    return { site: 'fr', confidence: 0.60, reason: `Email domain ${domain} suggests Belgian user (assigned to French site)` };
  }

  // 奥地利
  if (domain.endsWith('.at')) {
    return { site: 'de', confidence: 0.75, reason: `Email domain ${domain} suggests Austrian user` };
  }

  // 瑞士
  if (domain.endsWith('.ch')) {
    return { site: 'de', confidence: 0.70, reason: `Email domain ${domain} suggests Swiss user` };
  }

  return null;
}

/**
 * 使用 AI 分析单个客户
 */
async function handleAnalyzeWithAI(
  supabase: ReturnType<typeof createClient>,
  body: AnalyzeWithAIRequest
): Promise<Response> {
  const { email } = body;

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

  // 准备 AI 分析数据
  const orderHistory = customer.order_stats?.by_site
    ? Object.entries(customer.order_stats.by_site)
        .map(([site, stats]: [string, any]) => `${site}: ${stats.orders} orders, ${stats.spent} spent`)
        .join('; ')
    : 'No order history';

  const prompt = AI_ANALYSIS_PROMPT
    .replace('{email}', customer.email)
    .replace('{name}', customer.full_name || 'Unknown')
    .replace('{phone}', customer.phone || 'Not provided')
    .replace('{orderHistory}', orderHistory);

  try {
    // 使用和商品识别相同的 API 调用方式
    const model = DEFAULT_MODEL;
    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
    console.log('Calling Gemini API for customer analysis, model:', model);

    // 定义响应 schema（和 ai-service 相同的方式）
    const responseSchema = {
      type: 'OBJECT',
      properties: {
        name_analysis: {
          type: 'OBJECT',
          properties: {
            detected_origin: { type: 'STRING' },
            confidence: { type: 'NUMBER' },
            reasoning: { type: 'STRING' },
          },
          required: ['detected_origin', 'confidence', 'reasoning'],
        },
        email_analysis: {
          type: 'OBJECT',
          properties: {
            domain: { type: 'STRING' },
            domain_country: { type: 'STRING' },
            confidence: { type: 'NUMBER' },
          },
          required: ['domain', 'domain_country', 'confidence'],
        },
        order_history_analysis: {
          type: 'OBJECT',
          properties: {
            primary_site: { type: 'STRING' },
            confidence: { type: 'NUMBER' },
          },
          required: ['primary_site', 'confidence'],
        },
        recommended_site: { type: 'STRING' },
        overall_confidence: { type: 'NUMBER' },
        reasoning: { type: 'STRING' },
      },
      required: ['name_analysis', 'email_analysis', 'order_history_analysis', 'recommended_site', 'overall_confidence', 'reasoning'],
    };

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.2,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error response:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 解析 JSON 响应（使用和 ai-service 相同的方式）
    let aiAnalysis;
    try {
      aiAnalysis = JSON.parse(text);
    } catch {
      console.error('Failed to parse Gemini response:', text.substring(0, 500));
      throw new Error(`Failed to parse Gemini response: ${text.substring(0, 200)}`);
    }

    // 更新客户数据
    await supabase
      .from('customers')
      .update({
        ai_analysis: aiAnalysis,
        assigned_site: aiAnalysis.recommended_site,
        assignment_method: 'ai_analysis',
        assignment_confidence: aiAnalysis.overall_confidence,
        assignment_reason: aiAnalysis.reasoning,
      })
      .eq('email', email.toLowerCase());

    return new Response(
      JSON.stringify({
        success: true,
        email,
        analysis: aiAnalysis,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('AI analysis error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'AI analysis failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * 批量 AI 分析
 */
async function handleBatchAnalyzeWithAI(
  supabase: ReturnType<typeof createClient>,
  body: BatchAnalyzeWithAIRequest
): Promise<Response> {
  const { emails, batchSize = 10 } = body;

  let query = supabase.from('customers').select('email');

  if (emails && emails.length > 0) {
    query = query.in('email', emails.map(e => e.toLowerCase()));
  } else {
    // 只处理未分配的
    query = query.is('assigned_site', null);
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
      // 递归调用单个分析
      const analysisResponse = await handleAnalyzeWithAI(supabase, {
        action: 'analyze-with-ai',
        email: customer.email,
      });

      const analysisResult = await analysisResponse.json();

      if (analysisResult.success) {
        results.push({
          email: customer.email,
          success: true,
          site: analysisResult.analysis?.recommended_site,
        });
      } else {
        results.push({
          email: customer.email,
          success: false,
          error: analysisResult.error,
        });
      }

      // 避免 API 限速
      await new Promise(resolve => setTimeout(resolve, 500));
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
      analyzed: successCount,
      failed: results.length - successCount,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 手动分配客户
 */
async function handleAssignManual(
  supabase: ReturnType<typeof createClient>,
  body: AssignManualRequest
): Promise<Response> {
  const { email, site, reason } = body;

  const { error } = await supabase
    .from('customers')
    .update({
      assigned_site: site,
      assignment_method: 'manual',
      assignment_confidence: 1.0,
      assignment_reason: reason || `Manually assigned to ${site}`,
    })
    .eq('email', email.toLowerCase());

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, email, site }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 批量手动分配
 */
async function handleBatchAssign(
  supabase: ReturnType<typeof createClient>,
  body: BatchAssignRequest
): Promise<Response> {
  const { emails, site, reason } = body;

  const { error, count } = await supabase
    .from('customers')
    .update({
      assigned_site: site,
      assignment_method: 'manual',
      assignment_confidence: 1.0,
      assignment_reason: reason || `Manually assigned to ${site}`,
    })
    .in('email', emails.map(e => e.toLowerCase()));

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, assigned: count || emails.length, site }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
