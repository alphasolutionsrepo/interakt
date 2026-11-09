// src/features/ai-service/utils/batch-processor.test.ts

/**
 * A batch that fails is logged here only when processing carries on past it; when the
 * failure is passed on, whoever handles it logs it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

import { processBatches } from './batch-processor';

const modelDown = new Error('model "nomic-embed-text" not found');
const failing = (continueOnError: boolean) => processBatches({
    items: ['a', 'b'],
    batchSize: 1,
    processor: async (batch: string[]) => { if (batch[0] === 'a') throw modelDown; return batch; },
    continueOnError,
});

beforeEach(() => { logs.length = 0; });

describe('a batch that fails', () => {
    it('is logged with the error when processing carries on past it', async () => {
        await failing(true);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ batchIndex: 0, err: modelDown }) })]);
    });

    it('is passed on without a warning or error of its own otherwise', async () => {
        await expect(failing(false)).rejects.toBe(modelDown);
        expect(reported(logs)).toEqual([]);
    });
});
