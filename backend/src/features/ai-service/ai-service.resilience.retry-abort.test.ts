// src/features/ai-service/ai-service.resilience.retry-abort.test.ts

/**
 * A retryable failure isn't tried again once the caller has stopped waiting (its own time
 * ran out, or it left): another attempt would be aborted at once.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { AdapterError } from './adapters/types';
import { withRetry } from './ai-service.resilience';

describe('withRetry when the caller has stopped waiting', () => {
  it('makes no further attempt after a retryable failure', async () => {
    const caller = new AbortController();
    const fn = vi.fn(async () => {
      caller.abort(new DOMException('The chat turn ran out of time', 'TimeoutError'));
      throw new AdapterError('Network error: socket hang up', 'ollama', undefined, true);
    });

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 1, maxDelay: 1 }, caller.signal)).rejects.toThrow('socket hang up');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('still retries while the caller waits', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new AdapterError('Network error: socket hang up', 'ollama', undefined, true))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 1, maxDelay: 1 }, new AbortController().signal)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
