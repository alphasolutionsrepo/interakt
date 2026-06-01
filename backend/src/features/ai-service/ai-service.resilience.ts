// src/features/ai-service/ai-service.resilience.ts

/**
 * AI Service Resilience Utilities
 * 
 * Provides circuit breaker and retry with exponential backoff
 * for resilient AI provider communication.
 */

import { createLogger } from '@/shared/logger/logger';
import type {
    CircuitBreakerConfig,
    CircuitBreakerState,
    RetryConfig,
} from './ai-service.types';
import { AIServiceError } from './ai-service.types';
import { CIRCUIT_BREAKER_DEFAULTS, RETRY_DEFAULTS } from './ai-service.validation';

const logger = createLogger('ai-service-resilience');

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * In-memory circuit breaker state per provider
 */
const circuitStates: Map<string, CircuitBreakerState> = new Map();

/**
 * Get or initialize circuit breaker state for a provider
 */
function getCircuitState(providerId: string): CircuitBreakerState {
    let state = circuitStates.get(providerId);
    if (!state) {
        state = {
            state: 'closed',
            failures: 0,
            successes: 0,
        };
        circuitStates.set(providerId, state);
    }
    return state;
}

/**
 * Check if circuit is open for a provider
 * 
 * @param providerId - The provider ID
 * @param config - Circuit breaker configuration
 * @returns True if requests should be blocked
 */
export function isCircuitOpen(
    providerId: string,
    config: CircuitBreakerConfig = CIRCUIT_BREAKER_DEFAULTS
): boolean {
    const state = getCircuitState(providerId);
    const now = Date.now();

    switch (state.state) {
        case 'closed':
            return false;

        case 'open':
            // Check if reset timeout has passed
            if (state.openedAt && now - state.openedAt >= config.resetTimeout) {
                // Transition to half-open
                state.state = 'half-open';
                state.successes = 0;
                logger.info('Circuit breaker transitioning to half-open', { providerId });
                return false;
            }
            return true;

        case 'half-open':
            return false;

        default:
            return false;
    }
}

/**
 * Record a successful operation
 */
export function recordSuccess(
    providerId: string,
    config: CircuitBreakerConfig = CIRCUIT_BREAKER_DEFAULTS
): void {
    const state = getCircuitState(providerId);
    state.lastSuccessTime = Date.now();

    switch (state.state) {
        case 'half-open':
            state.successes++;
            if (state.successes >= config.successThreshold) {
                // Close the circuit
                state.state = 'closed';
                state.failures = 0;
                state.successes = 0;
                state.openedAt = undefined;
                logger.info('Circuit breaker closed', { providerId });
            }
            break;

        case 'closed':
            // Reset failure count on success
            state.failures = 0;
            break;
    }
}

/**
 * Record a failed operation
 */
export function recordFailure(
    providerId: string,
    config: CircuitBreakerConfig = CIRCUIT_BREAKER_DEFAULTS
): void {
    const state = getCircuitState(providerId);
    const now = Date.now();
    state.lastFailureTime = now;

    switch (state.state) {
        case 'half-open':
            // Any failure in half-open reopens the circuit
            state.state = 'open';
            state.openedAt = now;
            state.failures++;
            logger.warn('Circuit breaker reopened from half-open', { providerId });
            break;

        case 'closed':
            state.failures++;
            // Check if we should open the circuit
            if (state.failures >= config.failureThreshold) {
                state.state = 'open';
                state.openedAt = now;
                logger.warn('Circuit breaker opened', {
                    providerId,
                    failures: state.failures,
                    threshold: config.failureThreshold,
                });
            }
            break;
    }
}

/**
 * Get current circuit state for a provider
 */
export function getCircuitStatus(providerId: string): CircuitBreakerState {
    return { ...getCircuitState(providerId) };
}

/**
 * Reset circuit breaker for a provider (e.g., after manual recovery)
 */
export function resetCircuit(providerId: string): void {
    const state: CircuitBreakerState = {
        state: 'closed',
        failures: 0,
        successes: 0,
    };
    circuitStates.set(providerId, state);
    logger.info('Circuit breaker reset', { providerId });
}

/**
 * Get all circuit states (for monitoring)
 */
export function getAllCircuitStates(): Map<string, CircuitBreakerState> {
    return new Map(circuitStates);
}

// ============================================================================
// EXPONENTIAL BACKOFF RETRY
// ============================================================================

/**
 * Calculate delay for a retry attempt
 */
function calculateDelay(
    attempt: number,
    config: RetryConfig
): number {
    // Exponential backoff: baseDelay * (multiplier ^ attempt)
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);

    // Cap at max delay
    delay = Math.min(delay, config.maxDelay);

    // Add jitter (±25%) to prevent thundering herd
    if (config.jitter) {
        const jitterRange = delay * 0.25;
        delay = delay - jitterRange + (Math.random() * jitterRange * 2);
    }

    return Math.round(delay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
    // Check if it's an AIServiceError with retryable codes
    if (error instanceof AIServiceError) {
        const retryableCodes = [
            'RATE_LIMITED',
            'TIMEOUT',
            'NETWORK_ERROR',
            'PROVIDER_UNAVAILABLE',
        ];
        return retryableCodes.includes(error.code);
    }

    // Check if it's an AdapterError
    if (error && typeof error === 'object' && 'retryable' in error) {
        return (error as { retryable: boolean }).retryable;
    }

    // Check for common retryable HTTP status codes
    if (error && typeof error === 'object' && 'statusCode' in error) {
        const status = (error as { statusCode: number }).statusCode;
        return status === 429 || status >= 500;
    }

    return false;
}

/**
 * Execute a function with retry and exponential backoff
 * 
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries fail
 * 
 * @example
 * const result = await withRetry(
 *   () => adapter.generateText(request, config),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
): Promise<T> {
    const fullConfig: RetryConfig = {
        ...RETRY_DEFAULTS,
        ...config,
    };

    let lastError: unknown;

    for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry if not retryable
            if (!isRetryableError(error)) {
                throw error;
            }

            // Don't retry if we've exhausted all attempts
            if (attempt >= fullConfig.maxRetries) {
                logger.warn('All retry attempts exhausted', {
                    attempts: attempt + 1,
                    error: (error as Error).message,
                });
                throw error;
            }

            // Calculate and apply delay
            const delay = calculateDelay(attempt, fullConfig);
            logger.debug('Retrying after error', {
                attempt: attempt + 1,
                maxRetries: fullConfig.maxRetries,
                delay,
                error: (error as Error).message,
            });

            await sleep(delay);
        }
    }

    throw lastError;
}

// ============================================================================
// COMBINED RESILIENCE WRAPPER
// ============================================================================

/**
 * Options for resilient execution
 */
export interface ResilienceOptions {
    providerId: string;
    circuitBreaker?: CircuitBreakerConfig;
    retry?: Partial<RetryConfig>;
}

/**
 * Execute a function with both circuit breaker and retry protection
 * 
 * @param fn - The async function to execute
 * @param options - Resilience options
 * @returns The result of the function
 * 
 * @example
 * const result = await withResilience(
 *   () => adapter.generateText(request, config),
 *   { providerId: 'openai' }
 * );
 */
export async function withResilience<T>(
    fn: () => Promise<T>,
    options: ResilienceOptions
): Promise<T> {
    const { providerId, circuitBreaker, retry } = options;
    const cbConfig = circuitBreaker ?? CIRCUIT_BREAKER_DEFAULTS;

    // Check circuit breaker first
    if (isCircuitOpen(providerId, cbConfig)) {
        throw new AIServiceError(
            'Circuit breaker is open - provider temporarily unavailable',
            'CIRCUIT_OPEN',
            providerId
        );
    }

    try {
        // Execute with retry
        const result = await withRetry(fn, retry);

        // Record success
        recordSuccess(providerId, cbConfig);

        return result;
    } catch (error) {
        // Record failure
        recordFailure(providerId, cbConfig);

        throw error;
    }
}