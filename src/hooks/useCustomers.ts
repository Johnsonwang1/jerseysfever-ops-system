import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type {
  Customer,
  CustomerQueryParams,
  CustomerListResponse,
  CustomerStats,
  SiteKey,
} from '../lib/types';

// ==================== Query Keys ====================

export const customerKeys = {
  all: ['customers'] as const,
  list: (filters: CustomerQueryParams) => ['customers', 'list', filters] as const,
  detail: (email: string) => ['customers', 'detail', email] as const,
  stats: () => ['customers', 'stats'] as const,
};

// ==================== Edge Function 调用 ====================

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL;
const EDGE_FUNCTION_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callEdgeFunction<T>(functionName: string, body: object): Promise<T> {
  const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EDGE_FUNCTION_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Edge function error: ${response.status}`);
  }

  return response.json();
}

// ==================== Customer Sync API ====================

async function getCustomers(params: CustomerQueryParams): Promise<CustomerListResponse> {
  return callEdgeFunction('customer-sync', {
    action: 'get-customers',
    ...params,
  });
}

async function getCustomer(email: string): Promise<{ customer: Customer; orders: any[] }> {
  return callEdgeFunction('customer-sync', {
    action: 'get-customer',
    email,
  });
}

async function getCustomerStats(): Promise<CustomerStats> {
  return callEdgeFunction('customer-sync', {
    action: 'get-stats',
  });
}

async function extractCustomersFromOrders(batchSize?: number): Promise<{
  success: boolean;
  extracted: number;
  inserted: number;
  errors?: string[];
}> {
  return callEdgeFunction('customer-sync', {
    action: 'extract-from-orders',
    batchSize,
  });
}

async function syncCustomersFromWooCommerce(site: SiteKey, emails?: string[]): Promise<{
  success: boolean;
  synced: number;
  errors?: string[];
}> {
  return callEdgeFunction('customer-sync', {
    action: 'sync-from-woocommerce',
    site,
    emails,
  });
}

// ==================== Customer Assignment API ====================

async function assignCustomersByAddress(emails?: string[], overwrite?: boolean): Promise<{
  success: boolean;
  total: number;
  assigned: number;
  skipped: number;
  results: { email: string; site: SiteKey | null; method: string }[];
}> {
  return callEdgeFunction('customer-assignment', {
    action: 'assign-by-address',
    emails,
    overwrite,
  });
}

async function analyzeCustomerWithAI(email: string): Promise<{
  success: boolean;
  email: string;
  analysis: any;
}> {
  return callEdgeFunction('customer-assignment', {
    action: 'analyze-with-ai',
    email,
  });
}

async function batchAnalyzeWithAI(emails?: string[], batchSize?: number): Promise<{
  success: boolean;
  total: number;
  analyzed: number;
  failed: number;
  results: { email: string; success: boolean; site?: SiteKey; error?: string }[];
}> {
  return callEdgeFunction('customer-assignment', {
    action: 'batch-analyze-with-ai',
    emails,
    batchSize,
  });
}

async function assignCustomerManually(email: string, site: SiteKey, reason?: string): Promise<{
  success: boolean;
  email: string;
  site: SiteKey;
}> {
  return callEdgeFunction('customer-assignment', {
    action: 'assign-manual',
    email,
    site,
    reason,
  });
}

async function batchAssignCustomers(emails: string[], site: SiteKey, reason?: string): Promise<{
  success: boolean;
  assigned: number;
  site: SiteKey;
}> {
  return callEdgeFunction('customer-assignment', {
    action: 'batch-assign',
    emails,
    site,
    reason,
  });
}

// ==================== Customer Migration API ====================

async function migrateCustomer(email: string, targetSite?: SiteKey, createAccount?: boolean): Promise<{
  success: boolean;
  email: string;
  site: SiteKey;
  wooCustomerId: number;
  action: 'created' | 'updated' | 'marked';
}> {
  return callEdgeFunction('customer-migration', {
    action: 'migrate-customer',
    email,
    targetSite,
    createAccount,
  });
}

async function batchMigrateCustomers(emails?: string[], batchSize?: number): Promise<{
  success: boolean;
  total: number;
  migrated: number;
  failed: number;
  results: { email: string; success: boolean; site?: SiteKey; error?: string }[];
}> {
  return callEdgeFunction('customer-migration', {
    action: 'batch-migrate',
    emails,
    batchSize,
  });
}

async function skipCustomerMigration(email: string, reason?: string): Promise<{
  success: boolean;
  email: string;
}> {
  return callEdgeFunction('customer-migration', {
    action: 'skip-migration',
    email,
    reason,
  });
}

// ==================== React Query Hooks ====================

/**
 * 获取客户列表
 */
export function useCustomers(params: CustomerQueryParams = {}) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => getCustomers(params),
    staleTime: 30 * 1000, // 30 秒
  });
}

/**
 * 获取单个客户详情
 */
export function useCustomer(email: string) {
  return useQuery({
    queryKey: customerKeys.detail(email),
    queryFn: () => getCustomer(email),
    enabled: !!email,
    staleTime: 60 * 1000, // 1 分钟
  });
}

/**
 * 获取客户统计
 */
export function useCustomerStats() {
  return useQuery({
    queryKey: customerKeys.stats(),
    queryFn: () => getCustomerStats(),
    staleTime: 60 * 1000, // 1 分钟
  });
}

/**
 * 从订单提取客户
 */
export function useExtractCustomers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (batchSize?: number) => extractCustomersFromOrders(batchSize),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * 从 WooCommerce 同步客户
 */
export function useSyncFromWooCommerce() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ site, emails }: { site: SiteKey; emails?: string[] }) =>
      syncCustomersFromWooCommerce(site, emails),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * 基于地址分配客户
 */
export function useAssignByAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ emails, overwrite }: { emails?: string[]; overwrite?: boolean }) =>
      assignCustomersByAddress(emails, overwrite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * AI 分析单个客户
 */
export function useAnalyzeWithAI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) => analyzeCustomerWithAI(email),
    onSuccess: (_, email) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(email) });
      queryClient.invalidateQueries({ queryKey: customerKeys.list({}) });
    },
  });
}

/**
 * 批量 AI 分析
 */
export function useBatchAnalyzeWithAI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ emails, batchSize }: { emails?: string[]; batchSize?: number }) =>
      batchAnalyzeWithAI(emails, batchSize),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * 手动分配客户
 */
export function useAssignManually() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, site, reason }: { email: string; site: SiteKey; reason?: string }) =>
      assignCustomerManually(email, site, reason),
    onSuccess: (_, { email }) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(email) });
      queryClient.invalidateQueries({ queryKey: customerKeys.list({}) });
    },
  });
}

/**
 * 批量手动分配
 */
export function useBatchAssign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ emails, site, reason }: { emails: string[]; site: SiteKey; reason?: string }) =>
      batchAssignCustomers(emails, site, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * 迁移单个客户
 */
export function useMigrateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, targetSite, createAccount }: { email: string; targetSite?: SiteKey; createAccount?: boolean }) =>
      migrateCustomer(email, targetSite, createAccount),
    onSuccess: (_, { email }) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(email) });
      queryClient.invalidateQueries({ queryKey: customerKeys.list({}) });
    },
  });
}

/**
 * 批量迁移客户
 */
export function useBatchMigrate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ emails, batchSize }: { emails?: string[]; batchSize?: number }) =>
      batchMigrateCustomers(emails, batchSize),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * 跳过迁移
 */
export function useSkipMigration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, reason }: { email: string; reason?: string }) =>
      skipCustomerMigration(email, reason),
    onSuccess: (_, { email }) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(email) });
      queryClient.invalidateQueries({ queryKey: customerKeys.list({}) });
    },
  });
}

/**
 * 订阅客户实时更新
 */
export function useCustomersRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('customers-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        (payload) => {
          console.log('👤 客户实时更新:', payload.eventType);
          queryClient.invalidateQueries({ queryKey: customerKeys.all });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);
}

/**
 * 刷新客户数据
 */
export function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: customerKeys.all });
}
