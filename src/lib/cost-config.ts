/**
 * 成本配置 & 汇率 API
 */
import { supabase } from './supabase';

// 成本规则类型
export interface CostRule {
  id: string;
  name: string;
  cost: number;
  is_hot_team: boolean | null;
  gender: string[] | null;
  version: string[] | null;
  sleeve: string[] | null;
  type: string[] | null;
  season: string[] | null;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// 热门球队类型
export interface HotTeam {
  id: string;
  team_name: string;
  created_at: string;
}

// 获取所有成本规则
export async function getCostRules(): Promise<CostRule[]> {
  const { data, error } = await supabase
    .from('cost_config')
    .select('*')
    .order('priority', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 获取启用的成本规则
export async function getEnabledCostRules(): Promise<CostRule[]> {
  const { data, error } = await supabase
    .from('cost_config')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 更新成本规则
export async function updateCostRule(id: string, updates: Partial<CostRule>): Promise<CostRule> {
  const { data, error } = await supabase
    .from('cost_config')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 创建成本规则
export async function createCostRule(rule: Omit<CostRule, 'id' | 'created_at' | 'updated_at'>): Promise<CostRule> {
  const { data, error } = await supabase
    .from('cost_config')
    .insert(rule)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 删除成本规则
export async function deleteCostRule(id: string): Promise<void> {
  const { error } = await supabase
    .from('cost_config')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// 获取热门球队
export async function getHotTeams(): Promise<HotTeam[]> {
  const { data, error } = await supabase
    .from('hot_teams')
    .select('*')
    .order('team_name');

  if (error) throw error;
  return data || [];
}

// 添加热门球队
export async function addHotTeam(teamName: string): Promise<HotTeam> {
  const { data, error } = await supabase
    .from('hot_teams')
    .insert({ team_name: teamName })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 删除热门球队
export async function removeHotTeam(id: string): Promise<void> {
  const { error } = await supabase
    .from('hot_teams')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// 判断球队是否热门
export async function isHotTeam(team: string): Promise<boolean> {
  const hotTeams = await getHotTeams();
  return hotTeams.some(hot => 
    team.toLowerCase().includes(hot.team_name.toLowerCase()) || 
    hot.team_name.toLowerCase().includes(team.toLowerCase())
  );
}

// 根据商品属性计算成本
export async function calculateCost(product: {
  team?: string;
  gender?: string;
  version?: string;
  sleeve?: string;
  type?: string;
  season?: string;
  categories?: string[];
}): Promise<{ cost: number; ruleName: string }> {
  const rules = await getEnabledCostRules();
  const hotTeams = await getHotTeams();
  
  // 从 categories 提取球队
  const team = product.team || (product.categories?.find(c => 
    !['Best Sellers', 'Retro', 'Regular', 'Uncategorized'].includes(c)
  ) ?? '');
  
  const teamIsHot = hotTeams.some(hot => 
    team.toLowerCase().includes(hot.team_name.toLowerCase()) || 
    hot.team_name.toLowerCase().includes(team.toLowerCase())
  );

  for (const rule of rules) {
    let matches = true;

    // 检查热门/冷门
    if (rule.is_hot_team !== null) {
      if (rule.is_hot_team !== teamIsHot) {
        matches = false;
      }
    }

    // 检查性别
    if (rule.gender && rule.gender.length > 0) {
      if (!product.gender || !rule.gender.includes(product.gender)) {
        matches = false;
      }
    }

    // 检查版本
    if (rule.version && rule.version.length > 0) {
      if (!product.version || !rule.version.includes(product.version)) {
        matches = false;
      }
    }

    // 检查袖长
    if (rule.sleeve && rule.sleeve.length > 0) {
      if (!product.sleeve || !rule.sleeve.includes(product.sleeve)) {
        matches = false;
      }
    }

    // 检查类型
    if (rule.type && rule.type.length > 0) {
      if (!product.type || !rule.type.includes(product.type)) {
        matches = false;
      }
    }

    // 检查赛季
    if (rule.season && rule.season.length > 0) {
      if (!product.season || !rule.season.includes(product.season)) {
        matches = false;
      }
    }

    if (matches) {
      return { cost: Number(rule.cost), ruleName: rule.name };
    }
  }

  // 兜底
  return { cost: 28, ruleName: '默认成本' };
}

// ============ 汇率 API ============

// 汇率类型
export interface ExchangeRate {
  id: string;
  month: string;      // 格式: '2025-01'
  usd_cny: number;    // 美元兑人民币
  usd_eur: number;    // 美元兑欧元
  usd_gbp: number;    // 美元兑英镑
  created_at: string;
}

// 获取所有汇率
export async function getExchangeRates(): Promise<ExchangeRate[]> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .order('month', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 获取最新汇率（当前月份）
export async function getLatestExchangeRate(): Promise<ExchangeRate | null> {
  const currentMonth = new Date().toISOString().slice(0, 7); // '2025-12'
  
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('month', currentMonth)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

// 获取指定月份的汇率
export async function getExchangeRateByMonth(month: string): Promise<ExchangeRate | null> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('month', month)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

// 更新汇率
export async function updateExchangeRate(id: string, updates: Partial<ExchangeRate>): Promise<ExchangeRate> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 创建汇率
export async function createExchangeRate(rate: Omit<ExchangeRate, 'id' | 'created_at'>): Promise<ExchangeRate> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .insert(rate)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ 汇率转换工具 ============

// 站点对应的货币
export const SITE_CURRENCY: Record<string, string> = {
  com: 'USD',
  uk: 'GBP',
  de: 'EUR',
  fr: 'EUR',
};

// 缓存汇率数据
let cachedRates: ExchangeRate[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

// 获取缓存的汇率
async function getCachedRates(): Promise<ExchangeRate[]> {
  const now = Date.now();
  if (cachedRates && now - cacheTime < CACHE_DURATION) {
    return cachedRates;
  }
  cachedRates = await getExchangeRates();
  cacheTime = now;
  return cachedRates;
}

// 根据日期获取汇率（用于订单分析）
export async function getRateForDate(date: string): Promise<ExchangeRate | null> {
  const month = date.slice(0, 7); // '2024-01-15' -> '2024-01'
  const rates = await getCachedRates();
  return rates.find(r => r.month === month) || rates[0] || null; // 默认用最新
}

// 将金额从站点货币转换为 USD
export async function convertToUSD(amount: number, site: string, date?: string): Promise<number> {
  const currency = SITE_CURRENCY[site] || 'USD';
  if (currency === 'USD') return amount;

  const rate = date ? await getRateForDate(date) : await getLatestExchangeRate();
  if (!rate) return amount;

  // 数据库存的是 USD 兑其他货币的汇率，所以要除以汇率
  // 比如 usd_eur = 0.85，表示 1 USD = 0.85 EUR
  // 所以 100 EUR = 100 / 0.85 = 117.6 USD
  if (currency === 'EUR') {
    return amount / rate.usd_eur;
  } else if (currency === 'GBP') {
    return amount / rate.usd_gbp;
  }
  return amount;
}

// 将金额从站点货币转换为 CNY
export async function convertToCNY(amount: number, site: string, date?: string): Promise<number> {
  const usdAmount = await convertToUSD(amount, site, date);
  const rate = date ? await getRateForDate(date) : await getLatestExchangeRate();
  if (!rate) return usdAmount * 7.2; // 默认汇率
  return usdAmount * rate.usd_cny;
}

// 批量转换订单金额为 USD（按各自日期的汇率）
export async function convertOrdersToUSD(orders: Array<{ total: string; site: string; date_created: string }>): Promise<number> {
  let totalUSD = 0;
  for (const order of orders) {
    const amount = parseFloat(order.total) || 0;
    const usd = await convertToUSD(amount, order.site, order.date_created);
    totalUSD += usd;
  }
  return totalUSD;
}

// ============ 物流成本 API ============

// 物流成本类型
export interface ShippingCost {
  id: string;
  name: string;             // 线路名称，如 "欧美专线小包-P特价"
  country_code: string;     // 国家代码: UK, DE, FR, etc.
  country_name: string;     // 国家名称: 英国, 德国, 法国, etc.
  weight_min: number;       // 重量下限 (kg)
  weight_max: number;       // 重量上限 (kg)
  price_per_kg: number;     // 单价 (元/kg)
  registration_fee: number; // 挂号费 (元/件)
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// 获取所有物流成本
export async function getShippingCosts(): Promise<ShippingCost[]> {
  const { data, error } = await supabase
    .from('shipping_costs')
    .select('*')
    .order('country_code');

  if (error) throw error;
  return data || [];
}

// 获取启用的物流成本
export async function getEnabledShippingCosts(): Promise<ShippingCost[]> {
  const { data, error } = await supabase
    .from('shipping_costs')
    .select('*')
    .eq('enabled', true)
    .order('country_code');

  if (error) throw error;
  return data || [];
}

// 更新物流成本
export async function updateShippingCost(id: string, updates: Partial<ShippingCost>): Promise<ShippingCost> {
  const { data, error } = await supabase
    .from('shipping_costs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 创建物流成本
export async function createShippingCost(cost: Omit<ShippingCost, 'id' | 'created_at' | 'updated_at'>): Promise<ShippingCost> {
  const { data, error } = await supabase
    .from('shipping_costs')
    .insert(cost)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 删除物流成本
export async function deleteShippingCost(id: string): Promise<void> {
  const { error } = await supabase
    .from('shipping_costs')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// 站点对应的国家代码映射
export const SITE_COUNTRY_MAP: Record<string, string> = {
  com: 'US',
  uk: 'UK',
  de: 'DE',
  fr: 'FR',
};

// 根据国家代码获取物流成本
export async function getShippingCostByCountry(countryCode: string): Promise<ShippingCost | null> {
  const costs = await getEnabledShippingCosts();
  return costs.find(c => c.country_code === countryCode) || null;
}

// 计算单件商品的物流成本（按重量估算）
// 默认每件球衣重量 0.25kg
export async function calculateShippingCost(
  countryCode: string, 
  quantity: number = 1,
  weightPerItem: number = 0.25  // 默认每件0.25kg
): Promise<number> {
  const cost = await getShippingCostByCountry(countryCode);
  if (!cost) {
    // 默认物流成本
    return quantity * 10; // 每件10元
  }
  
  const totalWeight = weightPerItem * quantity;
  // 物流成本 = 重量 * 单价 + 挂号费
  return totalWeight * cost.price_per_kg + cost.registration_fee;
}
