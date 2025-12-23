import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 数据在 5 分钟内视为新鲜
      staleTime: 5 * 60 * 1000,
      // 缓存 30 分钟
      gcTime: 30 * 60 * 1000,
      // 窗口聚焦时不自动刷新（我们用 Realtime）
      refetchOnWindowFocus: false,
      // 重连时刷新
      refetchOnReconnect: true,
      // 失败重试 1 次
      retry: 1,
    },
    mutations: {
      // mutation 失败重试 0 次
      retry: 0,
    },
  },
});

// Query Keys 常量
export const queryKeys = {
  products: {
    all: ['products'] as const,
    list: (filters: {
      page?: number;
      perPage?: number;
      search?: string;
      categories?: string[];
      specialFilters?: string[];
      types?: string[];
      versions?: string[];
      sleeves?: string[];
      genders?: string[];
    }) => ['products', 'list', filters] as const,
    detail: (sku: string) => ['products', 'detail', sku] as const,
    stats: () => ['products', 'stats'] as const,
  },
  categories: {
    all: ['categories'] as const,
    bySite: (site: string) => ['categories', site] as const,
  },
  aiTasks: {
    all: ['aiTasks'] as const,
    bySku: (sku: string) => ['aiTasks', sku] as const,
    pending: () => ['aiTasks', 'pending'] as const,
  },
  aiSettings: {
    all: ['aiSettings'] as const,
    templates: () => ['aiSettings', 'templates'] as const,
    config: () => ['aiSettings', 'config'] as const,
  },
};



