// src/features/tools/tools.executor.test.ts
//
// Focused contract tests for executeTool() — the hardened single entry-point.
// Covers the executor's resilience guarantees (retry, timeout, fallback,
// input validation), since none of these are tested elsewhere. Each test
// pins one invariant; we deliberately avoid restating the full schema/output
// validation surface (those live in tools.validation.test.ts).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (declare before importing the module under test)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/features/telemetry', () => ({
  withSpan: vi.fn((_opts: unknown, fn: (span: unknown) => unknown) =>
    fn({
      setAttribute: vi.fn(),
      addEvent: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    }),
  ),
  ATTR: new Proxy({}, { get: (_t, k) => `alpha.${String(k).toLowerCase()}` }),
}));

const mockGetToolById = vi.fn();
vi.mock('./tools.service', () => ({
  getToolById: (...args: unknown[]) => mockGetToolById(...args),
}));

vi.mock('@/features/secrets/secrets.service', () => ({
  resolveSecret: vi.fn(async (name: string) => `resolved-${name}`),
}));

// We dispatch tests through the `http` executor — simplest signature, no
// data-source coupling. Other executors are stubbed to never be called.
const mockHttp = vi.fn();
vi.mock('./executors/http-api', () => ({
  executeHttpApi: (...args: unknown[]) => mockHttp(...args),
}));
vi.mock('./executors/web-search', () => ({ executeWebSearch: vi.fn() }));
vi.mock('./executors/ai-responder', () => ({ executeAiResponder: vi.fn() }));
vi.mock('./executors/data-source', () => ({
  executeDataSourceSearch: vi.fn(),
  executeDataSourceInspect: vi.fn(),
  executeDataSourceEnumerate: vi.fn(),
  executeDataSourceLookup: vi.fn(),
}));
vi.mock('@/features/mcp-connection/mcp-tool-resolver', () => ({
  isMcpToolId: () => false,
  parseMcpToolId: () => null,
}));
vi.mock('@/features/mcp-connection/mcp-executor', () => ({
  executeMcpTool: vi.fn(),
}));

import { executeTool } from './tools.executor';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeTool(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tool-1',
    name: 'Test Tool',
    slug: 'test-tool',
    executorType: 'http',
    operation: null,
    dataSourceId: null,
    isActive: true,
    executorConfig: {},
    // Permissive schema — most tests don't exercise input validation; the
    // one that does sets its own schema. Without this, the executor falls
    // back to the http default schema which requires `query`.
    inputSchema: { type: 'object', properties: {} },
    outputSchema: null,
    timeout: 30_000,
    retryConfig: { count: 2, backoff: 'exponential' as const, initialDelayMs: 1 },
    fallbackConfig: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('executeTool', () => {
  beforeEach(() => {
    mockGetToolById.mockReset();
    mockHttp.mockReset();
  });

  describe('happy path', () => {
    it('dispatches to the executor matching the tool.executorType and returns its result', async () => {
      mockGetToolById.mockResolvedValue(makeTool());
      mockHttp.mockResolvedValue({ success: true, data: { ok: true } });

      const result = await executeTool('tool-1', { q: 'hi' });

      expect(mockHttp).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ ok: true });
      expect(result.retriesUsed).toBe(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('returns error when the tool does not exist', async () => {
      mockGetToolById.mockResolvedValue(null);
      const result = await executeTool('missing', {});
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
      expect(mockHttp).not.toHaveBeenCalled();
    });

    it('returns error when the tool is inactive', async () => {
      mockGetToolById.mockResolvedValue(makeTool({ isActive: false }));
      const result = await executeTool('tool-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not active/i);
    });
  });

  describe('retry', () => {
    it('retries on a thrown retryable error and succeeds on the second attempt', async () => {
      mockGetToolById.mockResolvedValue(makeTool());
      const transient = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      mockHttp
        .mockRejectedValueOnce(transient)
        .mockResolvedValueOnce({ success: true, data: { ok: true } });

      const result = await executeTool('tool-1', {});
      expect(result.success).toBe(true);
      expect(result.retriesUsed).toBe(1);
      expect(mockHttp).toHaveBeenCalledTimes(2);
    });

    it('exhausts retries and returns the error (no fallback configured)', async () => {
      mockGetToolById.mockResolvedValue(makeTool({
        retryConfig: { count: 1, backoff: 'exponential', initialDelayMs: 1 },
      }));
      // Retryable error — matched by message pattern in isRetryable().
      mockHttp.mockRejectedValue(new Error('ECONNRESET while reading body'));

      const result = await executeTool('tool-1', {});
      expect(result.success).toBe(false);
      // initial + 1 retry = 2 attempts
      expect(mockHttp).toHaveBeenCalledTimes(2);
    });

    it('does not retry when the executor returns success:false (executor-handled error, not thrown)', async () => {
      mockGetToolById.mockResolvedValue(makeTool());
      mockHttp.mockResolvedValue({ success: false, error: 'bad input' });

      const result = await executeTool('tool-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('bad input');
      expect(mockHttp).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeout', () => {
    it('returns error when the executor exceeds tool.timeout', async () => {
      mockGetToolById.mockResolvedValue(makeTool({
        timeout: 30,
        retryConfig: { count: 0, backoff: 'exponential', initialDelayMs: 1 },
      }));
      mockHttp.mockImplementation(() => new Promise((r) => setTimeout(r, 200)));

      const result = await executeTool('tool-1', {});
      expect(result.success).toBe(false);
    }, 1000);
  });

  describe('fallback', () => {
    it("uses 'default_response' fallback after retries exhausted", async () => {
      mockGetToolById.mockResolvedValue(makeTool({
        retryConfig: { count: 0, backoff: 'exponential', initialDelayMs: 1 },
        fallbackConfig: {
          type: 'default_response',
          config: { response: { fallback: 'yes' } },
        },
      }));
      mockHttp.mockRejectedValue(new Error('ECONNRESET — server down'));

      const result = await executeTool('tool-1', {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ fallback: 'yes' });
      expect(result.fallbackUsed).toBe(true);
    });

    it("uses 'skip' fallback to return a successful no-op", async () => {
      mockGetToolById.mockResolvedValue(makeTool({
        retryConfig: { count: 0, backoff: 'exponential', initialDelayMs: 1 },
        fallbackConfig: { type: 'skip', config: {} },
      }));
      mockHttp.mockRejectedValue(new Error('ECONNRESET — server down'));

      const result = await executeTool('tool-1', {});
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe('input validation', () => {
    it('rejects input that violates the tool.inputSchema before dispatching', async () => {
      mockGetToolById.mockResolvedValue(makeTool({
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string' } },
          required: ['q'],
        },
      }));

      const result = await executeTool('tool-1', {} as Record<string, unknown>);
      expect(result.success).toBe(false);
      expect(mockHttp).not.toHaveBeenCalled();
    });
  });

  describe('dispatch', () => {
    it("returns error for an unknown executorType (no matching executor)", async () => {
      mockGetToolById.mockResolvedValue(makeTool({ executorType: 'mystery' }));

      const result = await executeTool('tool-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unknown executor type/i);
    });
  });
});
