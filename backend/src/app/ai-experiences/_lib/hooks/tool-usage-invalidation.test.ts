// src/app/ai-experiences/_lib/hooks/tool-usage-invalidation.test.ts

/**
 * Anything that changes which tools an experience uses must refresh each tool page's "Used In"
 * list, which also drives the tool's delete lock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

type MutationOptions = { onSuccess?: () => unknown; meta?: { label: string } };

const { mutations, useQuery } = vi.hoisted(() => ({
  mutations: [] as MutationOptions[],
  useQuery: vi.fn(() => ({})),
}));

vi.mock('react', () => ({ useState: (value: unknown) => [value, vi.fn()], useEffect: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery,
  useQueryClient: () => queryClient,
  useMutation: (options: MutationOptions) => {
    mutations.push(options);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/data-sources/_lib/hooks/useHealthCheck', () => ({ useHealthCheck: vi.fn() }));

import { toolKeys } from '@/app/tools/_lib/hooks/useTools';
import { useAIExperience, useAIExperiences, useCreateAIExperience } from './useAIExperiences';

let queryClient: QueryClient;

function isInvalidated(key: readonly unknown[]) {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

async function runOnSuccess(label: string) {
  const matching = mutations.filter((m) => m.meta?.label === label);
  expect(matching.length, label).toBeGreaterThan(0);
  for (const mutation of matching) {
    queryClient.setQueryData(toolKeys.experiences('tool-1'), { experiences: [] });
    queryClient.setQueryData(toolKeys.experiences('tool-2'), { experiences: [] });
    await mutation.onSuccess!();
    expect(isInvalidated(toolKeys.experiences('tool-1')), label).toBe(true);
    expect(isInvalidated(toolKeys.experiences('tool-2')), label).toBe(true);
  }
}

describe('experience mutations refresh tool usage', () => {
  beforeEach(() => {
    mutations.length = 0;
    queryClient = new QueryClient();
    queryClient.setQueryData(toolKeys.experiences('tool-1'), { experiences: [] });
    queryClient.setQueryData(toolKeys.experiences('tool-2'), { experiences: [] });
    useAIExperiences();
    useAIExperience('exp-1');
    useCreateAIExperience();
  });

  it.each([
    'Create experience',
    'Update experience',
    'Delete experience',
    'Assign tool',
    'Remove tool',
  ])('%s invalidates every tool\'s experiences', async (label) => {
    await runOnSuccess(label);
  });
});
