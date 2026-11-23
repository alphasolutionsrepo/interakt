// src/features/tools/tools.executor.missing-secret-retry.test.ts

/**
 * A missing secret is never retried and doesn't fall back:
 * - an MCP connection or data source that throws MissingSecretError is tried once, even when
 *   the secret's name has a word the retry rules look for ("network", "timeout") or matches
 *   the tool's own retry patterns;
 * - a tool whose settings name a missing secret stops before running, and a configured
 *   fallback isn't used (the admin sees the setup problem, as for an error the tool returns).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/telemetry', () => ({
  withSpan: vi.fn((_opts: unknown, fn: (span: unknown) => unknown) =>
    fn({ setAttribute: vi.fn(), addEvent: vi.fn(), setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() })),
  ATTR: new Proxy({}, { get: (_t, k) => `alpha.${String(k).toLowerCase()}` }),
}));

const { getToolById } = vi.hoisted(() => ({ getToolById: vi.fn() }));
vi.mock('./tools.service', () => ({ getToolById }));

vi.mock('@/features/secrets/secrets.service', () => ({
  resolveSecret: vi.fn(async (name: string) => (name === 'present' ? 'value' : null)),
}));

// The tool's own runner stands in for an MCP call or a data source search that throws
const { runTool } = vi.hoisted(() => ({ runTool: vi.fn() }));
vi.mock('./executors/http-api', () => ({ executeHttpApi: runTool }));

import { MissingSecretError } from '@/features/secrets/secret-template';

import { executeTool } from './tools.executor';

afterEach(() => { runTool.mockReset(); getToolById.mockReset(); });

const tool = (overrides: Record<string, unknown> = {}) => ({
  id: 'tool-1',
  name: 'Orders',
  slug: 'orders',
  executorType: 'http',
  operation: null,
  dataSourceId: null,
  isActive: true,
  executorConfig: {},
  inputSchema: { type: 'object', properties: {} },
  outputSchema: null,
  timeout: 30_000,
  retryConfig: { count: 1, backoff: 'linear' as const },
  fallbackConfig: null,
  ...overrides,
});

describe('a connection secret that is missing', () => {
  it.each([
    ['a word the default retry rules look for', 'network_token', undefined],
    ['the tool\'s own retry patterns', 'orders_key', ['orders_key']],
  ])('is tried once when its name matches %s', async (_case, name, retryableErrors) => {
    getToolById.mockResolvedValue(tool({ retryConfig: { count: 1, backoff: 'linear', retryableErrors } }));
    runTool.mockRejectedValue(new MissingSecretError(name, "for this connection's authentication"));

    const result = await executeTool('tool-1', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain(`The secret "${name}"`);
    expect(runTool).toHaveBeenCalledTimes(1);
  });

  it('control: another error with the same words is still retried', async () => {
    getToolById.mockResolvedValue(tool());
    runTool.mockRejectedValue(new Error('network_token request failed'));

    await executeTool('tool-1', {});

    expect(runTool).toHaveBeenCalledTimes(2);
  });
});

describe('a tool whose settings name a missing secret, with a fallback set', () => {
  it('stops before running and doesn\'t use the fallback', async () => {
    getToolById.mockResolvedValue(tool({
      executorConfig: { baseUrl: 'https://api.example.com', headers: { Authorization: '{{secret:gone}}' } },
      fallbackConfig: { type: 'default_response', config: { response: { fallback: 'yes' } } },
    }));

    const result = await executeTool('tool-1', {});

    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBeUndefined();
    expect(result.error).toContain('The secret "gone"');
    expect(runTool).not.toHaveBeenCalled();
  });

  it('control: with the secret present, the tool runs', async () => {
    getToolById.mockResolvedValue(tool({
      executorConfig: { baseUrl: 'https://api.example.com', headers: { Authorization: '{{secret:present}}' } },
      fallbackConfig: { type: 'default_response', config: { response: { fallback: 'yes' } } },
    }));
    runTool.mockResolvedValue({ success: true, data: { ok: true } });

    const result = await executeTool('tool-1', {});

    expect(result.success).toBe(true);
    expect(runTool.mock.calls[0][0]).toMatchObject({ headers: { Authorization: 'value' } });
  });
});
