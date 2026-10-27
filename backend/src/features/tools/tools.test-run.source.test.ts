// src/features/tools/tools.test-run.source.test.ts

/**
 * A tool run from its Test panel is an admin's test, so the searches it makes are stored
 * as admin_test and left out of live traffic.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
vi.mock('@/db/index', () => ({ db: {}, analyticsDB: null }));
vi.mock('./tools.service', () => ({}));
vi.mock('@/features/data-source/data-source.service', () => ({}));

const seen = vi.hoisted(() => ({ source: undefined as string | undefined }));
vi.mock('./tools.executor', async () => {
  const { getAnalyticsSourceContext } = await import('@/features/analytics/analytics-source-context');
  return {
    executeTool: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.source = getAnalyticsSourceContext();
      return { success: true };
    }),
  };
});

import { getAnalyticsSourceContext } from '@/features/analytics/analytics-source-context';
import { handleTestTool } from './tools.api.handlers';

describe('tool Test panel', () => {
  it("runs the tool as an admin test, not live traffic", async () => {
    const request = new NextRequest('http://localhost/api/tools/t/test', {
      method: 'POST',
      body: JSON.stringify({ input: { query: 'linen shirts' } }),
    });

    const response = await handleTestTool(request, { params: Promise.resolve({ id: 't' }) });

    expect(response.status).toBe(200);
    expect(seen.source).toBe('admin_test');
    expect(getAnalyticsSourceContext()).toBeUndefined();
  });
});
