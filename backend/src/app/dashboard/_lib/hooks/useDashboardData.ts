// app/dashboard/_lib/hooks/useDashboardData.ts

/**
 * Dashboard Data Hook
 *
 * Aggregates data from multiple sources for the dashboard:
 * - Search indexes (counts, status)
 * - Search experiences (counts, status)
 * - AI experiences (counts, status)
 * - Analytics (searches, performance)
 * - Recent activity
 */

'use client';

import { useSearchIndexes } from '@/app/search-indexes/_lib/hooks/useSearchIndexes';
import { useSearchExperiences } from '@/app/search-experiences/_lib/hooks';
import { useAIExperiences } from '@/app/ai-experiences/_lib/hooks/useAIExperiences';
import {
  useAnalyticsDashboard,
  useRecentSearches,
  type RecentSearchEvent,
  type SearchTrendPoint,
} from '@/app/analytics/_lib/hooks/useAnalytics';

// ============================================================================
// Types
// ============================================================================

export interface DashboardQuickStats {
  totalSearches24h: number;
  activeIndexes: number;
  activeExperiences: number;
  avgResponseTime: number;
  successRate: number;
}

export interface ResourceCounts {
  indexes: {
    total: number;
    ready: number;
    creating: number;
    indexing: number;
    error: number;
    offline: number;
  };
  experiences: {
    total: number;
    active: number;
    inactive: number;
  };
  aiExperiences: {
    total: number;
    active: number;
    inactive: number;
  };
  searchExperiences: {
    total: number;
    active: number;
    inactive: number;
  };
}

export interface SystemHealth {
  indexes: {
    ready: number;
    creating: number;
    indexing: number;
    error: number;
    offline: number;
  };
  experiences: {
    active: number;
    inactive: number;
  };
  overallStatus: 'healthy' | 'warning' | 'error';
}

export interface AnalyticsSummary {
  totalSearches: number;
  successRate: number;
  avgDurationMs: number;
  zeroResultRate: number;
  trendData: SearchTrendPoint[];
  searchTypes: {
    lexical: number;
    semantic: number;
    hybrid: number;
  };
}

export interface DashboardData {
  quickStats: DashboardQuickStats;
  resourceCounts: ResourceCounts;
  systemHealth: SystemHealth;
  recentActivity: RecentSearchEvent[];
  analytics: AnalyticsSummary;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateOverallStatus(
  indexHealth: SystemHealth['indexes'],
  experienceHealth: SystemHealth['experiences']
): 'healthy' | 'warning' | 'error' {
  if (indexHealth.error > 0) {
    return 'error';
  }

  if (indexHealth.creating > 0 || indexHealth.indexing > 0 || indexHealth.offline > 0) {
    return 'warning';
  }

  if (experienceHealth.active === 0 && experienceHealth.inactive > 0) {
    return 'warning';
  }

  return 'healthy';
}

// ============================================================================
// Default Values (for graceful degradation)
// ============================================================================

const DEFAULT_INDEX_HEALTH: SystemHealth['indexes'] = {
  ready: 0,
  creating: 0,
  indexing: 0,
  error: 0,
  offline: 0,
};

const DEFAULT_EXPERIENCE_HEALTH: SystemHealth['experiences'] = {
  active: 0,
  inactive: 0,
};

// ============================================================================
// Hook
// ============================================================================

export function useDashboardData() {
  const indexesQuery = useSearchIndexes({
    page: 1,
    pageSize: 100,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const searchExperiencesQuery = useSearchExperiences({
    page: 1,
    pageSize: 100,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const aiExperiencesQuery = useAIExperiences({
    page: 1,
    pageSize: 100,
  });
  const analyticsQuery = useAnalyticsDashboard('24h');
  const recentSearchesQuery = useRecentSearches(undefined, 8);

  const isLoading =
    indexesQuery.isLoading &&
    searchExperiencesQuery.isLoading &&
    aiExperiencesQuery.isLoading &&
    analyticsQuery.isLoading;

  const hasAnyError =
    indexesQuery.isError ||
    searchExperiencesQuery.isError ||
    aiExperiencesQuery.isError ||
    analyticsQuery.isError;

  const isError =
    indexesQuery.isError &&
    searchExperiencesQuery.isError &&
    aiExperiencesQuery.isError &&
    analyticsQuery.isError;

  // Index health
  const indexHealth = indexesQuery.isError
    ? DEFAULT_INDEX_HEALTH
    : {
        ready: indexesQuery.indexes.filter(i => i.status === 'ready').length,
        creating: indexesQuery.indexes.filter(i => i.status === 'creating').length,
        indexing: indexesQuery.indexes.filter(i => i.status === 'indexing').length,
        error: indexesQuery.indexes.filter(i => i.status === 'error').length,
        offline: indexesQuery.indexes.filter(i => i.status === 'offline').length,
      };

  // Search experience counts
  const searchExpActive = searchExperiencesQuery.isError
    ? 0
    : searchExperiencesQuery.experiences.filter(e => e.isActive).length;
  const searchExpInactive = searchExperiencesQuery.isError
    ? 0
    : searchExperiencesQuery.experiences.filter(e => !e.isActive).length;

  // AI experience counts
  const aiExpActive = aiExperiencesQuery.isError
    ? 0
    : (aiExperiencesQuery.experiences ?? []).filter(e => e.isActive).length;
  const aiExpInactive = aiExperiencesQuery.isError
    ? 0
    : (aiExperiencesQuery.experiences ?? []).filter(e => !e.isActive).length;

  // Combined experience health (for SystemHealth backward compat)
  const experienceHealth = {
    active: searchExpActive + aiExpActive,
    inactive: searchExpInactive + aiExpInactive,
  };

  const overallStatus = hasAnyError
    ? 'warning'
    : calculateOverallStatus(indexHealth, experienceHealth);

  const data: DashboardData = {
    quickStats: {
      totalSearches24h: analyticsQuery.data?.overview?.totalSearches || 0,
      activeIndexes: indexesQuery.isError
        ? 0
        : indexesQuery.indexes.filter(i => i.status === 'ready' && i.isActive).length,
      activeExperiences: experienceHealth.active,
      avgResponseTime: analyticsQuery.data?.overview?.avgSearchDurationMs || 0,
      successRate: 1 - (analyticsQuery.data?.overview?.zeroResultRate || 0),
    },
    resourceCounts: {
      indexes: {
        total: indexesQuery.isError
          ? 0
          : indexesQuery.pagination?.totalItems || indexesQuery.indexes.length,
        ...indexHealth,
      },
      experiences: {
        total: (searchExpActive + searchExpInactive) + (aiExpActive + aiExpInactive),
        ...experienceHealth,
      },
      aiExperiences: {
        total: aiExpActive + aiExpInactive,
        active: aiExpActive,
        inactive: aiExpInactive,
      },
      searchExperiences: {
        total: searchExpActive + searchExpInactive,
        active: searchExpActive,
        inactive: searchExpInactive,
      },
    },
    systemHealth: {
      indexes: indexHealth,
      experiences: experienceHealth,
      overallStatus,
    },
    recentActivity: recentSearchesQuery.data || [],
    analytics: {
      totalSearches: analyticsQuery.data?.overview?.totalSearches || 0,
      successRate: 1 - (analyticsQuery.data?.overview?.zeroResultRate || 0),
      avgDurationMs: analyticsQuery.data?.overview?.avgSearchDurationMs || 0,
      zeroResultRate: analyticsQuery.data?.overview?.zeroResultRate || 0,
      trendData: analyticsQuery.data?.trends || [],
      searchTypes: analyticsQuery.data?.searchTypes || { lexical: 0, semantic: 0, hybrid: 0 },
    },
  };

  return {
    data,
    isLoading,
    isError,
    hasPartialError: hasAnyError && !isError,
    isRefetching:
      indexesQuery.isRefetching ||
      searchExperiencesQuery.isRefetching ||
      aiExperiencesQuery.isRefetching ||
      analyticsQuery.isFetching,
    refetch: () => {
      indexesQuery.refetch();
      searchExperiencesQuery.refetch();
      aiExperiencesQuery.refetch();
      analyticsQuery.refetch();
      recentSearchesQuery.refetch();
    },
  };
}
