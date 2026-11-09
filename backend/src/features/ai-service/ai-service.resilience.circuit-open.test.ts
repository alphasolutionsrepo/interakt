// src/features/ai-service/ai-service.resilience.circuit-open.test.ts

/**
 * While the circuit breaker has cut a provider off, a call fails without reaching it,
 * with an error that names the provider: it is explained as that provider being
 * unavailable (503), as any other path explains it, not as a server error.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { recordFailure, resetCircuit, withResilience } from './ai-service.resilience';

import { toAppError } from '@/shared/errors/to-app-error';

describe('a call while the circuit breaker is open', () => {
  it('fails with an error that names the provider, explained as it being unavailable', async () => {
    const config = { failureThreshold: 1, resetTimeout: 60_000, successThreshold: 1, windowSize: 60_000 };
    recordFailure('p1', config);
    const call = vi.fn();

    const failed = await withResilience(call, { providerId: 'p1', providerKey: 'ollama', circuitBreaker: config }).catch((e: unknown) => e);

    expect(call).not.toHaveBeenCalled();
    expect(failed).toMatchObject({ code: 'CIRCUIT_OPEN', providerKey: 'ollama' });
    expect(toAppError(failed)).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', status: 503 });
    resetCircuit('p1');
  });
});
