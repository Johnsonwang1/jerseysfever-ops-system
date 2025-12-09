import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getPromptTemplates, 
  createPromptTemplate, 
  updatePromptTemplate, 
  deletePromptTemplate,
  togglePromptTemplate,
  reorderPromptTemplates,
  getAISettings,
  updateAISettings,
  type PromptTemplate,
  type AISettings
} from '../lib/ai-prompts';
import type { AIModelId, AspectRatioId } from '../lib/ai-image';

// Query Keys
export const settingsKeys = {
  all: ['settings'] as const,
  aiSettings: () => ['settings', 'ai'] as const,
  promptTemplates: () => ['settings', 'templates'] as const,
};

/**
 * 获取 AI 设置
 */
export function useAISettings() {
  return useQuery({
    queryKey: settingsKeys.aiSettings(),
    queryFn: getAISettings,
    staleTime: 5 * 60 * 1000, // 5 分钟
  });
}

/**
 * 更新 AI 设置
 */
export function useUpdateAISettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      defaultModel?: AIModelId;
      defaultAspectRatio?: AspectRatioId;
    }) => {
      return updateAISettings(data);
    },
    // 乐观更新
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.aiSettings() });
      
      const previousSettings = queryClient.getQueryData<AISettings>(settingsKeys.aiSettings());
      
      queryClient.setQueryData<AISettings>(settingsKeys.aiSettings(), (old) => {
        if (!old) return old;
        return {
          ...old,
          defaultModel: newSettings.defaultModel ?? old.defaultModel,
          defaultAspectRatio: newSettings.defaultAspectRatio ?? old.defaultAspectRatio,
        };
      });
      
      return { previousSettings };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(settingsKeys.aiSettings(), context.previousSettings);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.aiSettings() });
    },
  });
}

/**
 * 获取 Prompt 模板列表
 */
export function usePromptTemplates() {
  return useQuery({
    queryKey: settingsKeys.promptTemplates(),
    queryFn: getPromptTemplates,
    staleTime: 5 * 60 * 1000, // 5 分钟
  });
}

/**
 * 创建 Prompt 模板
 */
export function useCreatePromptTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; prompt: string }) => {
      return createPromptTemplate(data.name, data.prompt);
    },
    // 乐观更新：立即显示新模板
    onMutate: async (newTemplate) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.promptTemplates() });
      
      const previousTemplates = queryClient.getQueryData<PromptTemplate[]>(settingsKeys.promptTemplates());
      
      const tempTemplate: PromptTemplate = {
        id: `temp-${Date.now()}`,
        name: newTemplate.name,
        prompt: newTemplate.prompt,
        enabled: true,
        sort_order: (previousTemplates?.length || 0) + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      queryClient.setQueryData<PromptTemplate[]>(settingsKeys.promptTemplates(), (old) => {
        return old ? [...old, tempTemplate] : [tempTemplate];
      });
      
      return { previousTemplates };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(settingsKeys.promptTemplates(), context.previousTemplates);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.promptTemplates() });
    },
  });
}

/**
 * 更新 Prompt 模板
 */
export function useUpdatePromptTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; prompt?: string } }) => {
      return updatePromptTemplate(id, data);
    },
    // 乐观更新
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.promptTemplates() });
      
      const previousTemplates = queryClient.getQueryData<PromptTemplate[]>(settingsKeys.promptTemplates());
      
      queryClient.setQueryData<PromptTemplate[]>(settingsKeys.promptTemplates(), (old) => {
        if (!old) return old;
        return old.map(template => 
          template.id === id 
            ? { ...template, ...data, updated_at: new Date().toISOString() }
            : template
        );
      });
      
      return { previousTemplates };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(settingsKeys.promptTemplates(), context.previousTemplates);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.promptTemplates() });
    },
  });
}

/**
 * 删除 Prompt 模板
 */
export function useDeletePromptTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return deletePromptTemplate(id);
    },
    // 乐观更新：立即移除
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.promptTemplates() });
      
      const previousTemplates = queryClient.getQueryData<PromptTemplate[]>(settingsKeys.promptTemplates());
      
      queryClient.setQueryData<PromptTemplate[]>(settingsKeys.promptTemplates(), (old) => {
        if (!old) return old;
        return old.filter(template => template.id !== id);
      });
      
      return { previousTemplates };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(settingsKeys.promptTemplates(), context.previousTemplates);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.promptTemplates() });
    },
  });
}

/**
 * 切换 Prompt 模板启用状态
 */
export function useTogglePromptTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return togglePromptTemplate(id, enabled);
    },
    // 乐观更新：立即切换状态
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.promptTemplates() });
      
      const previousTemplates = queryClient.getQueryData<PromptTemplate[]>(settingsKeys.promptTemplates());
      
      queryClient.setQueryData<PromptTemplate[]>(settingsKeys.promptTemplates(), (old) => {
        if (!old) return old;
        return old.map(template => 
          template.id === id 
            ? { ...template, enabled, updated_at: new Date().toISOString() }
            : template
        );
      });
      
      return { previousTemplates };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(settingsKeys.promptTemplates(), context.previousTemplates);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.promptTemplates() });
    },
  });
}

/**
 * 重新排序 Prompt 模板
 */
export function useReorderPromptTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      return reorderPromptTemplates(orderedIds);
    },
    // 乐观更新：立即更新顺序
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.promptTemplates() });
      
      const previousTemplates = queryClient.getQueryData<PromptTemplate[]>(settingsKeys.promptTemplates());
      
      queryClient.setQueryData<PromptTemplate[]>(settingsKeys.promptTemplates(), (old) => {
        if (!old) return old;
        // 按 orderedIds 的顺序排列
        return orderedIds
          .map((id, index) => {
            const template = old.find(t => t.id === id);
            return template ? { ...template, sort_order: index + 1 } : null;
          })
          .filter((t): t is PromptTemplate => t !== null);
      });
      
      return { previousTemplates };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(settingsKeys.promptTemplates(), context.previousTemplates);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.promptTemplates() });
    },
  });
}
