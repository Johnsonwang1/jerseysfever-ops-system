import { useQuery } from '@tanstack/react-query';
import { getPublishHistory, type PublishRecord } from '../lib/history';

// Query Keys
export const historyKeys = {
  all: ['history'] as const,
  list: () => ['history', 'list'] as const,
};

/**
 * 获取发布历史
 */
export function usePublishHistory() {
  return useQuery({
    queryKey: historyKeys.list(),
    queryFn: async (): Promise<PublishRecord[]> => {
      return getPublishHistory();
    },
    staleTime: 30 * 1000, // 30 秒
  });
}



