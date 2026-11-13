// app/settings/features/_lib/hooks/useFeatureSwitches.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUpdateFeatures } from './useFeatureSwitches';

import { ApiError } from '@/shared/api/api-error';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const h = vi.hoisted(() => ({
  options: {} as { onSuccess: () => void; onError: (e: unknown) => void },
  invalidateQueries: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
  useMutation: (o: typeof h.options) => ((h.options = o), o),
}));
vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error } }));

describe('useUpdateFeatures', () => {
  beforeEach(() => vi.clearAllMocks());

  it('on success: toasts, refreshes the list and the menu', () => {
    useUpdateFeatures();
    h.options.onSuccess();
    expect(h.success).toHaveBeenCalledWith('Features updated');
    expect(h.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['settings', 'features'] });
    expect(h.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['access', 'mine'] });
  });

  it('on error: toasts the server message', () => {
    useUpdateFeatures();
    h.options.onError(new ApiError('Search is switched off by the deployment', 409));
    expect(h.error).toHaveBeenCalledWith('Search is switched off by the deployment');
    expect(h.invalidateQueries).not.toHaveBeenCalled();
  });
});
