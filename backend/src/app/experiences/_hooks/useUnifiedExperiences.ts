'use client';

import { useMemo } from 'react';
import { useAIExperiences } from '@/app/ai-experiences/_lib/hooks/useAIExperiences';
import { useSearchExperiences } from '@/app/search-experiences/_lib/hooks';
import type { AIExperienceWithTools } from '@/app/ai-experiences/_lib/api-client';
import type { SearchExperienceSummary } from '@/features/search-experience/search-experience.types';

// Discriminated union type
export type UnifiedExperience =
  | ({ _type: 'ai' } & AIExperienceWithTools)
  | ({ _type: 'search' } & SearchExperienceSummary);

export interface UseUnifiedExperiencesParams {
  typeFilter: 'all' | 'ai' | 'search';
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export function useUnifiedExperiences(params: UseUnifiedExperiencesParams) {
  const { typeFilter, search, isActive, page = 1, pageSize = 12 } = params;

  const skipAI = typeFilter === 'search';
  const skipSearch = typeFilter === 'ai';

  // AI experiences hook
  const ai = useAIExperiences(
    skipAI ? undefined : {
      page: typeFilter === 'all' ? 1 : page,
      pageSize: typeFilter === 'all' ? 100 : pageSize, // fetch more when merging
      search: search || undefined,
      isActive,
    }
  );

  // Search experiences hook
  const search_ = useSearchExperiences(
    skipSearch ? undefined : {
      page: typeFilter === 'all' ? 1 : page,
      pageSize: typeFilter === 'all' ? 100 : pageSize,
      search: search || undefined,
      isActive,
    }
  );

  // Merge and sort
  const { items, pagination } = useMemo(() => {
    if (typeFilter === 'ai') {
      const items: UnifiedExperience[] = (ai.experiences ?? []).map((e) => ({ _type: 'ai' as const, ...e }));
      return {
        items,
        pagination: ai.pagination ?? { page, pageSize, totalItems: 0, totalPages: 0 },
      };
    }
    if (typeFilter === 'search') {
      const items: UnifiedExperience[] = (search_.experiences ?? []).map((e) => ({ _type: 'search' as const, ...e }));
      return {
        items,
        pagination: search_.pagination ?? { page, pageSize, totalItems: 0, totalPages: 0 },
      };
    }

    // "all" - merge both, sort by createdAt desc, paginate client-side
    const allItems: UnifiedExperience[] = [
      ...(ai.experiences ?? []).map((e) => ({ _type: 'ai' as const, ...e })),
      ...(search_.experiences ?? []).map((e) => ({ _type: 'search' as const, ...e })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const start = (page - 1) * pageSize;
    const paginatedItems = allItems.slice(start, start + pageSize);

    return {
      items: paginatedItems,
      pagination: { page, pageSize, totalItems, totalPages },
    };
  }, [typeFilter, ai.experiences, search_.experiences, ai.pagination, search_.pagination, page, pageSize]);

  // Metrics computed from all data
  const metrics = useMemo(() => {
    const aiList = ai.experiences ?? [];
    const searchList = search_.experiences ?? [];
    const aiTotal = ai.pagination?.totalItems ?? aiList.length;
    const searchTotal = search_.pagination?.totalItems ?? searchList.length;
    const aiActive = aiList.filter((e) => e.isActive).length;
    const searchActive = searchList.filter((e) => e.isActive).length;

    return {
      total: aiTotal + searchTotal,
      active: aiActive + searchActive,
      aiCount: aiTotal,
      searchCount: searchTotal,
    };
  }, [ai.experiences, search_.experiences, ai.pagination, search_.pagination]);

  return {
    items,
    pagination,
    metrics,
    isLoading: (!skipAI && ai.isLoading) || (!skipSearch && search_.isLoading),
    isRefetching: ai.isRefetching || search_.isRefetching,
    refetch: () => {
      if (!skipAI) ai.refetch();
      if (!skipSearch) search_.refetch();
    },
    deleteAIExperience: ai.deleteExperience,
    deleteSearchExperience: search_.deleteExperience,
    isDeletingAI: ai.isDeleting,
    isDeletingSearch: search_.isDeleting,
  };
}
