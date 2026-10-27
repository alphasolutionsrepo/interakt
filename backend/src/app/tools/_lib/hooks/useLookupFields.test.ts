// src/app/tools/_lib/hooks/useLookupFields.test.ts

/**
 * A Find Record tool's pages run the data source's health check only when the tool has fields
 * to keep current (a search index), not for one on uploaded files or a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { useQuery, useHealthCheck } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useHealthCheck: vi.fn((_id?: string) => ({ result: null, isChecking: false })),
}));

vi.mock('react', () => ({ useState: (value: unknown) => [value, vi.fn()], useEffect: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery,
  keepPreviousData: Symbol('keepPreviousData'),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/data-sources/_lib/hooks/useHealthCheck', () => ({ useHealthCheck }));

import { useLookupFields } from './useTools';

describe('useLookupFields', () => {
  beforeEach(() => useHealthCheck.mockClear());

  it('checks the data source of a tool on a search index', () => {
    useQuery.mockReturnValue({ data: { candidates: [] }, isLoading: false, isError: false, refetch: vi.fn() });
    useLookupFields('tool', 'ds');
    expect(useHealthCheck).toHaveBeenCalledWith('ds');
  });

  it('skips the check for a tool with no fields to choose, and while the fields load', () => {
    useQuery.mockReturnValue({ data: null, isLoading: false, isError: false, refetch: vi.fn() });
    useLookupFields('tool', 'files');
    useQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    useLookupFields('tool', 'ds');
    expect(useHealthCheck.mock.calls.map(([id]) => id)).toEqual([undefined, undefined]);
  });
});
