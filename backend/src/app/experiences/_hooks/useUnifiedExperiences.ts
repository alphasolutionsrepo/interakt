'use client';

import { useMemo } from 'react';
import { useAIExperiences } from '@/app/ai-experiences/_lib/hooks/useAIExperiences';
import { useSearchExperiences } from '@/app/search-experiences/_lib/hooks';
import type { AIExperienceWithTools } from '@/app/ai-experiences/_lib/api-client';
import type { Permission } from '@/features/access/permissions';
import type { SearchExperienceSummary } from '@/features/search-experience/search-experience.types';
import { useAccess } from '@/shared/access/useAccess';

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

/**
 * Which lists the hub loads: each kind the user may view, whatever the tab (the counts at the
 * top show both kinds). A list the server would refuse is never requested.
 */
export function listsToLoad(can: (p: Permission) => boolean) {
  return {
    skipAI: !can('ai-experiences:view'),
    skipSearch: !can('search-experiences:view'),
  };
}

/** The hub's type tabs a user may use: one per kind they can view, and "All" when they can view both. */
export function viewableTypes(can: (p: Permission) => boolean): Array<'all' | 'ai' | 'search'> {
  const ai = can('ai-experiences:view');
  const search = can('search-experiences:view');
  return [...(ai && search ? ['all' as const] : []), ...(ai ? ['ai' as const] : []), ...(search ? ['search' as const] : [])];
}

export function useUnifiedExperiences(params: UseUnifiedExperiencesParams) {
  const { typeFilter, search, isActive, page = 1, pageSize = 12 } = params;

  // While access is loading neither list is requested
  const { can, isLoading: accessLoading } = useAccess();
  const { skipAI, skipSearch } = listsToLoad(can);
  const listParams = {
    page: typeFilter === 'all' ? 1 : page,
    pageSize: typeFilter === 'all' ? 100 : pageSize, // fetch more when merging
    search: search || undefined,
    isActive,
  };

  const ai = useAIExperiences(listParams, { enabled: !skipAI });
  const search_ = useSearchExperiences(listParams, { enabled: !skipSearch });

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
    isLoading: accessLoading || (!skipAI && ai.isLoading) || (!skipSearch && search_.isLoading),
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
