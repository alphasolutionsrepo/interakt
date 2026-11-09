// src/features/ai-service/ai-service.resilience.retry-abort.test.ts

/**
 * A retryable failure isn't tried again once the caller has stopped waiting (its own time
 * ran out, or it left): another attempt would be aborted at once. A caller that stops
 * waiting during the wait before a retry ends the call as an aborted request does: a
 * cancel for a caller that left, a stop for one whose time ran out, neither the provider
 * failing, so neither counts toward opening its circuit.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { AdapterError, CallerTimeoutError, CancelledRequestError } from './adapters/types';
import { getCircuitStatus, resetCircuit, withResilience, withRetry } from './ai-service.resilience';

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

describe('withResilience when the caller stops waiting during the wait before a retry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A provider that is briefly unavailable on the first attempt, as the Ollama adapter reports a 503 */
  const unavailable = () => new AdapterError('service unavailable', 'ollama', 503, true);

  /** Runs one call whose first attempt fails; the caller stops waiting during the backoff */
  const stopDuringBackoff = async (reason?: unknown) => {
    vi.useFakeTimers();
    resetCircuit('prov-backoff');
    const caller = new AbortController();
    const fn = vi.fn(async () => { throw unavailable(); });

    const call = withResilience(fn, {
      providerId: 'prov-backoff',
      providerKey: 'ollama',
      retry: { maxRetries: 2, baseDelay: 1000, maxDelay: 1000, jitter: false },
      signal: caller.signal,
    });
    const settled = call.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(400); // the first attempt failed: withRetry is waiting
    expect(fn).toHaveBeenCalledOnce();
    caller.abort(reason);
    await vi.advanceTimersByTimeAsync(5000);

    return { error: await settled, fn };
  };

  it('ends as cancelled when the caller left: no other attempt, not counted against the provider', async () => {
    const { error, fn } = await stopDuringBackoff();

    expect(error).toBeInstanceOf(CancelledRequestError);
    expect(error).toMatchObject({ providerKey: 'ollama', retryable: false });
    expect(fn).toHaveBeenCalledOnce();
    expect(getCircuitStatus('prov-backoff')).toMatchObject({ state: 'closed', failures: 0 });
  });

  it("ends as stopped when the caller's own time ran out: no other attempt, not counted against the provider", async () => {
    const { error, fn } = await stopDuringBackoff(new DOMException('The chat turn ran out of time', 'TimeoutError'));

    expect(error).toBeInstanceOf(CallerTimeoutError);
    expect(error).toMatchObject({ providerKey: 'ollama', retryable: false });
    expect(fn).toHaveBeenCalledOnce();
    expect(getCircuitStatus('prov-backoff')).toMatchObject({ state: 'closed', failures: 0 });
  });

  it('still counts a provider failure when the caller waited to the end', async () => {
    vi.useFakeTimers();
    resetCircuit('prov-backoff');
    const fn = vi.fn(async () => { throw unavailable(); });

    const settled = withResilience(fn, {
      providerId: 'prov-backoff',
      retry: { maxRetries: 1, baseDelay: 1000, maxDelay: 1000, jitter: false },
      signal: new AbortController().signal,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5000);

    expect(await settled).toMatchObject({ message: 'service unavailable', statusCode: 503 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getCircuitStatus('prov-backoff')).toMatchObject({ failures: 1 });
  });
});
