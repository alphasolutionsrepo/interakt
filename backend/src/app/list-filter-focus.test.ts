// src/app/list-filter-focus.test.ts

/**
 * The Experiences, Indexes, Data Sources, Tools and MCP Connections lists keep their current rows on screen while a
 * new filter loads. Without it the page swaps to its loading skeleton, which unmounts the
 * search box, so it loses focus after every keystroke (#53).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { useQuery, keepPreviousData } = vi.hoisted(() => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  keepPreviousData: Symbol('keepPreviousData'),
}));

vi.mock('react', () => ({ useState: (value: unknown) => [value, vi.fn()], useEffect: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery,
  keepPreviousData,
  useMutation: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useAIExperiences } from './ai-experiences/_lib/hooks/useAIExperiences';
import { useDataSources } from './data-sources/_lib/hooks/useDataSources';
import { useMcpConnections } from './mcp-connections/_lib/hooks/useMcpConnections';
import { useSearchExperiences } from './search-experiences/_lib/hooks/useSearchExperiences';
import { useSearchIndexes } from './search-indexes/_lib/hooks/useSearchIndexes';
import { useTools } from './tools/_lib/hooks/useTools';

const LIST_HOOKS = { useAIExperiences, useDataSources, useMcpConnections, useSearchExperiences, useSearchIndexes, useTools };

describe('list pages keep their rows while a filter loads', () => {
  beforeEach(() => useQuery.mockClear());

  for (const [name, hook] of Object.entries(LIST_HOOKS)) {
    it(name, () => {
      (hook as (params?: Record<string, unknown>) => unknown)({ search: 'den' });

      expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ placeholderData: keepPreviousData }));
    });
  }
});
