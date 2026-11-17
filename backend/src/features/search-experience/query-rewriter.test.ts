// src/features/search-experience/query-rewriter.test.ts

/**
 * The search-terms rewrite for external sources: the same switches as filter
 * interpretation, the visitor's words whenever the model fails, is slow or answers
 * with nothing usable, and one model call per distinct question.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveTimeoutMs, rewriteQueryForExternalSearch } from './query-interpreter';

import type { SearchExperienceAIConfig } from '@/db/schema/search-experience.schema';
import * as aiService from '@/features/ai-service';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';
import { type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/ai-service', () => ({ chat: vi.fn() }));
// Cache keys are logged with every cache log switch on, as in development
vi.mock('@/config/cache.config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/config/cache.config')>();
    return { cacheConfig: { ...actual.cacheConfig, logging: { logHits: true, logMisses: true, logOperations: true } } };
});
vi.mock('@/features/search-index/search-index.service', () => ({ getSearchIndexById: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ searchById: vi.fn() }));

const QUESTION = 'how do I apply for financial aid as a transfer student';

function aiConfig(overrides: { enabled?: boolean; quEnabled?: boolean; minWords?: number; timeoutMs?: number; customInstructions?: string } = {}): SearchExperienceAIConfig {
    return {
        enabled: overrides.enabled ?? true,
        providerId: null,
        modelId: null,
        summary: { enabled: true, maxResultsForContext: 10, maxTokens: 500 },
        queryUnderstanding: {
            enabled: overrides.quEnabled ?? true,
            minWords: overrides.minWords ?? 3,
            timeoutMs: overrides.timeoutMs,
            customInstructions: overrides.customInstructions,
        },
    };
}

function modelReplies(content: string) {
    vi.mocked(aiService.chat).mockResolvedValue({ message: { content } } as unknown as Awaited<ReturnType<typeof aiService.chat>>);
}

// The cache lives for the whole run: each test uses its own experience
let counter = 0;
const freshExperience = () => `exp-rw-${++counter}`;

const rewrite = (config: SearchExperienceAIConfig, query = QUESTION, experienceId = freshExperience()) =>
    rewriteQueryForExternalSearch({ query, aiConfig: config, experienceId });

beforeEach(() => {
    vi.clearAllMocks();
    featureSwitchesStub.reset();
    logs.length = 0;
    modelReplies(JSON.stringify({ query: 'apply financial aid transfer student' }));
});

describe('rewriteQueryForExternalSearch', () => {
    it('returns the search terms the model wrote, asking with the site-search prompt and the custom instructions', async () => {
        const result = await rewrite(aiConfig({ customInstructions: 'Keep course codes.' }));

        expect(result).toMatchObject({ originalQuery: QUESTION, query: 'apply financial aid transfer student', outcome: 'rewritten' });
        expect(aiService.chat).toHaveBeenCalledTimes(1);
        const [messages, options] = vi.mocked(aiService.chat).mock.calls[0];
        expect(messages[0].content).toContain("search terms for a website's search engine");
        expect(messages[0].content).toContain('Keep course codes.');
        expect(messages[1]).toEqual({ role: 'user', content: QUESTION });
        expect(options).toMatchObject({ temperature: 0, signal: expect.any(AbortSignal), responseFormat: { type: 'json_schema' } });
        expect(logs.some((l) => l.message === 'Query rewritten for external search')).toBe(true);
    });

    it('keeps the visitor\'s words and the rewrite out of the application log, cache lines included', async () => {
        const experienceId = freshExperience();
        await rewrite(aiConfig(), QUESTION, experienceId);
        await rewrite(aiConfig(), QUESTION, experienceId);
        // The cache did log its keys
        expect(logs.some((l) => l.message.startsWith('Cache'))).toBe(true);
        const text = JSON.stringify(logs);
        expect(text).not.toContain(QUESTION);
        expect(text).not.toContain('apply financial aid transfer student');
    });

    it('reports unchanged when the phrase already reads like search terms', async () => {
        modelReplies(JSON.stringify({ query: 'transfer student financial aid' }));
        const result = await rewrite(aiConfig(), 'transfer student financial aid');
        expect(result).toMatchObject({ query: 'transfer student financial aid', outcome: 'unchanged' });
    });

    it('skips a query shorter than the minimum words', async () => {
        const result = await rewrite(aiConfig({ minWords: 4 }), 'financial aid deadlines');
        expect(result).toMatchObject({ query: 'financial aid deadlines', outcome: 'skipped' });
        expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('skips when AI summaries is off', async () => {
        featureSwitchesStub.off.add('ai-summaries');
        const result = await rewrite(aiConfig());
        expect(result).toMatchObject({ query: QUESTION, outcome: 'skipped' });
        expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('skips when AI features or query understanding are off', async () => {
        expect((await rewrite(aiConfig({ enabled: false }))).outcome).toBe('skipped');
        expect((await rewrite(aiConfig({ quEnabled: false }))).outcome).toBe('skipped');
        expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('searches with the visitor’s words when the model fails', async () => {
        vi.mocked(aiService.chat).mockRejectedValue(new Error('provider down'));
        const result = await rewrite(aiConfig());
        expect(result).toMatchObject({ query: QUESTION, outcome: 'failed' });
    });

    it('searches with the visitor’s words when the answer is unusable', async () => {
        modelReplies('not json');
        expect(await rewrite(aiConfig())).toMatchObject({ query: QUESTION, outcome: 'failed' });
        modelReplies(JSON.stringify({ query: 'x'.repeat(201) }));
        expect(await rewrite(aiConfig())).toMatchObject({ query: QUESTION, outcome: 'failed' });
    });

    it('gives up at the time limit and stops the model call nobody waits for', async () => {
        let signal: AbortSignal | undefined;
        vi.mocked(aiService.chat).mockImplementation((_messages, options) => {
            signal = options?.signal;
            return new Promise((_resolve, reject) => {
                options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            });
        });

        const startedAt = Date.now();
        const result = await rewrite(aiConfig({ timeoutMs: 500 }));

        expect(result).toMatchObject({ query: QUESTION, outcome: 'timed_out' });
        expect(Date.now() - startedAt).toBeLessThan(1500);
        expect(signal?.aborted).toBe(true);
        expect(logs.some((l) => l.level === 'warn' && l.message === 'Query rewrite timed out; searching with the raw query')).toBe(true);
    });

    it('does not wait past the limit even when the provider ignores the abort', async () => {
        vi.mocked(aiService.chat).mockImplementation(() => new Promise(() => {}));
        const startedAt = Date.now();
        const result = await rewrite(aiConfig({ timeoutMs: 500 }));
        expect(result.outcome).toBe('timed_out');
        expect(Date.now() - startedAt).toBeLessThan(1500);
    });

    it('reuses the rewrite for the same question and config', async () => {
        const experienceId = freshExperience();
        await rewrite(aiConfig(), QUESTION, experienceId);
        const second = await rewrite(aiConfig(), `  ${QUESTION} `, experienceId);
        expect(aiService.chat).toHaveBeenCalledTimes(1);
        expect(second.query).toBe('apply financial aid transfer student');
    });

    it('keeps each visitor\'s letter case: the same words typed in other capitals get their own rewrite and outcome', async () => {
        const experienceId = freshExperience();
        vi.mocked(aiService.chat).mockImplementation(async (messages) =>
            ({ message: { content: JSON.stringify({ query: messages[1].content }) } }) as never);

        const first = await rewrite(aiConfig(), 'sku ab-12 replacement parts', experienceId);
        const second = await rewrite(aiConfig(), 'SKU AB-12 replacement parts', experienceId);

        expect(first).toMatchObject({ query: 'sku ab-12 replacement parts', outcome: 'unchanged' });
        expect(second).toMatchObject({ query: 'SKU AB-12 replacement parts', outcome: 'unchanged' });
        expect(aiService.chat).toHaveBeenCalledTimes(2);
    });

    it('asks again after the custom instructions change', async () => {
        const experienceId = freshExperience();
        await rewrite(aiConfig({ customInstructions: 'a' }), QUESTION, experienceId);
        await rewrite(aiConfig({ customInstructions: 'b' }), QUESTION, experienceId);
        expect(aiService.chat).toHaveBeenCalledTimes(2);
    });

    it('does not keep a failure, an unusable answer or a timeout', async () => {
        const experienceId = freshExperience();
        vi.mocked(aiService.chat).mockRejectedValueOnce(new Error('provider down'));
        expect((await rewrite(aiConfig(), QUESTION, experienceId)).outcome).toBe('failed');

        vi.mocked(aiService.chat).mockResolvedValueOnce({ message: { content: '{}' } } as unknown as Awaited<ReturnType<typeof aiService.chat>>);
        expect((await rewrite(aiConfig(), QUESTION, experienceId)).outcome).toBe('failed');

        expect((await rewrite(aiConfig(), QUESTION, experienceId)).outcome).toBe('rewritten');
        expect(aiService.chat).toHaveBeenCalledTimes(3);
    });

    it('does not keep a call the provider never ends: it is released when its caller leaves and the next search asks again', async () => {
        vi.useFakeTimers();
        try {
            const experienceId = freshExperience();
            let signal: AbortSignal | undefined;
            vi.mocked(aiService.chat).mockImplementationOnce((_messages, options) => {
                signal = options?.signal;
                return new Promise(() => {});
            });
            const first = rewrite(aiConfig({ timeoutMs: 500 }), QUESTION, experienceId);
            await vi.advanceTimersByTimeAsync(500);
            expect((await first).outcome).toBe('timed_out');
            expect(signal?.aborted).toBe(true);

            expect((await rewrite(aiConfig({ timeoutMs: 500 }), QUESTION, experienceId)).outcome).toBe('rewritten');
            expect(aiService.chat).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    describe('callers sharing one model call', () => {
        const slowAnswer = () => {
            let answer: (content: string) => void = () => {};
            vi.mocked(aiService.chat).mockImplementationOnce(() => new Promise((resolve) => {
                answer = (content) => resolve({ message: { content } } as unknown as Awaited<ReturnType<typeof aiService.chat>>);
            }));
            return (content: string) => answer(content);
        };

        it('times out the caller with the shorter limit on its own; the other gets the answer, from one model call', async () => {
            vi.useFakeTimers();
            try {
                const experienceId = freshExperience();
                const answer = slowAnswer();
                const short = rewrite(aiConfig({ timeoutMs: 500 }), QUESTION, experienceId);
                const long = rewrite(aiConfig({ timeoutMs: 4000 }), QUESTION, experienceId);

                await vi.advanceTimersByTimeAsync(500);
                expect(await short).toMatchObject({ query: QUESTION, outcome: 'timed_out' });

                await vi.advanceTimersByTimeAsync(1000);
                answer(JSON.stringify({ query: 'apply financial aid transfer student' }));
                expect(await long).toMatchObject({ query: 'apply financial aid transfer student', outcome: 'rewritten' });
                expect(aiService.chat).toHaveBeenCalledTimes(1);
                expect(logs.filter((l) => l.message.startsWith('Query rewrite failed'))).toEqual([]);

                // The answer that arrived after the first caller gave up is kept
                expect((await rewrite(aiConfig(), QUESTION, experienceId)).outcome).toBe('rewritten');
                expect(aiService.chat).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });

        it('times out a joiner at its own limit, not failed, when the first caller left earlier', async () => {
            vi.useFakeTimers();
            try {
                const experienceId = freshExperience();
                slowAnswer();
                const first = rewrite(aiConfig({ timeoutMs: 500 }), QUESTION, experienceId);
                const joiner = rewrite(aiConfig({ timeoutMs: 2000 }), QUESTION, experienceId);

                await vi.advanceTimersByTimeAsync(500);
                expect((await first).outcome).toBe('timed_out');
                const signal = vi.mocked(aiService.chat).mock.calls[0]?.[1]?.signal;
                expect(signal).toBeDefined();
                // The joiner still waits for the call, so it keeps running
                expect(signal?.aborted).toBe(false);
                await vi.advanceTimersByTimeAsync(1500);
                expect(await joiner).toMatchObject({ query: QUESTION, outcome: 'timed_out' });
                // Nobody waits any more: the call is stopped
                expect(signal?.aborted).toBe(true);
            } finally {
                vi.useRealTimers();
            }
        });
    });
});

describe('resolveTimeoutMs', () => {
    it('uses the experience’s limit, or 3000 ms when none is saved', () => {
        expect(resolveTimeoutMs({ enabled: true, minWords: 3, timeoutMs: 1500 })).toBe(1500);
        expect(resolveTimeoutMs({ enabled: true, minWords: 3 })).toBe(3000);
        expect(resolveTimeoutMs(undefined)).toBe(3000);
    });
});
