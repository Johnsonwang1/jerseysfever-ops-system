import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  loadDrafts, 
  saveDraft, 
  deleteDraft, 
  createEmptyDraft,
  type ProductDraft 
} from '../lib/drafts';
import { getLeafCategories } from '../lib/products';
import { setAvailableCategories } from '../lib/ai';

// Query Keys
export const draftKeys = {
  all: ['drafts'] as const,
  list: () => ['drafts', 'list'] as const,
  detail: (id: string) => ['drafts', 'detail', id] as const,
  leafCategories: () => ['drafts', 'leafCategories'] as const,
};

/**
 * 获取所有草稿
 */
export function useDrafts() {
  return useQuery({
    queryKey: draftKeys.list(),
    queryFn: loadDrafts,
    staleTime: Infinity, // 草稿数据不会自动过期
  });
}

/**
 * 获取叶子分类（用于 AI 识别）
 */
export function useLeafCategories() {
  return useQuery({
    queryKey: draftKeys.leafCategories(),
    queryFn: async () => {
      const categories = await getLeafCategories();
      // 设置到 AI 模块
      setAvailableCategories(categories);
      return categories;
    },
    staleTime: 5 * 60 * 1000, // 5 分钟
  });
}

/**
 * 创建新草稿
 */
export function useCreateDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const newDraft = createEmptyDraft();
      const saved = await saveDraft(newDraft);
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.list() });
    },
  });
}

/**
 * 更新草稿
 */
export function useUpdateDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draft: ProductDraft) => {
      return saveDraft(draft);
    },
    onMutate: async (draft) => {
      // 乐观更新
      await queryClient.cancelQueries({ queryKey: draftKeys.list() });
      const previousDrafts = queryClient.getQueryData<ProductDraft[]>(draftKeys.list());
      
      queryClient.setQueryData<ProductDraft[]>(draftKeys.list(), (old) => {
        if (!old) return [draft];
        return old.map(d => d.id === draft.id ? draft : d);
      });

      return { previousDrafts };
    },
    onError: (_err, _draft, context) => {
      if (context?.previousDrafts) {
        queryClient.setQueryData(draftKeys.list(), context.previousDrafts);
      }
    },
  });
}

/**
 * 删除草稿
 */
export function useDeleteDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDraft,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.list() });
    },
  });
}

