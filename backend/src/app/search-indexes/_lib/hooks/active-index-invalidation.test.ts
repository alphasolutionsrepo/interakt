// src/app/search-indexes/_lib/hooks/active-index-invalidation.test.ts

/**
 * The experience screens pick from the active search indexes, a list kept for five
 * minutes. Creating, deleting, activating, deactivating or renaming an index refreshes
 * it, so the change shows there straight away.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutations, invalidateQueries } = vi.hoisted(() => ({
  mutations: [] as Array<{ meta?: { label?: string }; onSuccess?: (data: unknown) => void }>,
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  keepPreviousData: Symbol('keepPreviousData'),
  useMutation: vi.fn((options) => {
    mutations.push(options);
    return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  }),
  useQueryClient: vi.fn(() => ({ invalidateQueries, setQueryData: vi.fn() })),
}));
vi.mock('react', () => ({ useState: (value: unknown) => [value, vi.fn()], useEffect: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { searchIndexKeys, useSearchIndex, useSearchIndexes } from './useSearchIndexes';

/** Whether the mutation with this label refreshes the active index list when it succeeds */
function refreshesActive(label: string): boolean {
  const mutation = mutations.find((m) => m.meta?.label === label);
  if (!mutation) throw new Error(`No mutation labelled ${label}`);
  invalidateQueries.mockClear();
  mutation.onSuccess?.({ id: 'i1' });
  return invalidateQueries.mock.calls.some(([arg]) => JSON.stringify(arg.queryKey) === JSON.stringify(searchIndexKeys.allActive()));
}

describe('the active search index list', () => {
  beforeEach(() => { mutations.length = 0; });

  it.each(['Update search index', 'Delete search index', 'Activate search index', 'Deactivate search index'])('is refreshed on the index page: %s', (label) => {
    useSearchIndex('i1');
    expect(refreshesActive(label)).toBe(true);
  });

  it.each(['Create search index', 'Update search index', 'Delete search index'])('is refreshed from the list page: %s', (label) => {
    useSearchIndexes();
    expect(refreshesActive(label)).toBe(true);
  });
});
