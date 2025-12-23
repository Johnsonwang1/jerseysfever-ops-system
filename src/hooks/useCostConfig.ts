/**
 * 成本配置 & 汇率 React Query Hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCostRules,
  updateCostRule,
  createCostRule,
  deleteCostRule,
  getHotTeams,
  addHotTeam,
  removeHotTeam,
  getExchangeRates,
  getLatestExchangeRate,
  updateExchangeRate,
  createExchangeRate,
  getShippingCosts,
  updateShippingCost,
  createShippingCost,
  deleteShippingCost,
  type CostRule,
  type ExchangeRate,
  type ShippingCost,
} from '../lib/cost-config';

// Query Keys
export const costConfigKeys = {
  rules: ['cost-rules'] as const,
  hotTeams: ['hot-teams'] as const,
  exchangeRates: ['exchange-rates'] as const,
  latestRate: ['exchange-rates', 'latest'] as const,
  shippingCosts: ['shipping-costs'] as const,
};

// 获取成本规则
export function useCostRules() {
  return useQuery({
    queryKey: costConfigKeys.rules,
    queryFn: getCostRules,
  });
}

// 获取热门球队
export function useHotTeams() {
  return useQuery({
    queryKey: costConfigKeys.hotTeams,
    queryFn: getHotTeams,
  });
}

// 更新成本规则
export function useUpdateCostRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CostRule> }) =>
      updateCostRule(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.rules });
    },
  });
}

// 创建成本规则
export function useCreateCostRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (rule: Omit<CostRule, 'id' | 'created_at' | 'updated_at'>) =>
      createCostRule(rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.rules });
    },
  });
}

// 删除成本规则
export function useDeleteCostRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteCostRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.rules });
    },
  });
}

// 添加热门球队
export function useAddHotTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addHotTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.hotTeams });
    },
  });
}

// 删除热门球队
export function useRemoveHotTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: removeHotTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.hotTeams });
    },
  });
}

// ============ 汇率 Hooks ============

// 获取所有汇率
export function useExchangeRates() {
  return useQuery({
    queryKey: costConfigKeys.exchangeRates,
    queryFn: getExchangeRates,
  });
}

// 获取最新汇率
export function useLatestExchangeRate() {
  return useQuery({
    queryKey: costConfigKeys.latestRate,
    queryFn: getLatestExchangeRate,
  });
}

// 更新汇率
export function useUpdateExchangeRate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ExchangeRate> }) =>
      updateExchangeRate(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.exchangeRates });
      queryClient.invalidateQueries({ queryKey: costConfigKeys.latestRate });
    },
  });
}

// 创建汇率
export function useCreateExchangeRate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (rate: Omit<ExchangeRate, 'id' | 'created_at'>) =>
      createExchangeRate(rate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.exchangeRates });
      queryClient.invalidateQueries({ queryKey: costConfigKeys.latestRate });
    },
  });
}

// ============ 物流成本 Hooks ============

// 获取物流成本
export function useShippingCosts() {
  return useQuery({
    queryKey: costConfigKeys.shippingCosts,
    queryFn: getShippingCosts,
  });
}

// 创建物流成本
export function useCreateShippingCost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (cost: Omit<ShippingCost, 'id' | 'created_at' | 'updated_at'>) =>
      createShippingCost(cost),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.shippingCosts });
    },
  });
}

// 更新物流成本
export function useUpdateShippingCost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ShippingCost> }) =>
      updateShippingCost(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.shippingCosts });
    },
  });
}

// 删除物流成本
export function useDeleteShippingCost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteShippingCost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costConfigKeys.shippingCosts });
    },
  });
}

