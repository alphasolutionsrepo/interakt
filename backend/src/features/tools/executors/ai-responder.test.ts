// src/features/tools/executors/ai-responder.test.ts

/**
 * An AI responder whose model call fails answers as a failed tool, and says why in the
 * log: the chat step and the tool test route only record that the tool failed. A model
 * that fails (down, disabled, missing) needs fixing, so it is logged as an error.
 */

import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
// What the Ollama adapter throws for a model it doesn't have
const modelDown = vi.hoisted(() => Object.assign(new Error('model "qwen2.5:14b" not found, try pulling it first'), { name: 'AdapterError', providerKey: 'ollama', statusCode: 404 }));
vi.mock('@/features/ai-service/ai-service.service', () => ({ chat: vi.fn(async () => { throw modelDown; }) }));

import { executeAiResponder } from './ai-responder';

describe('an AI responder whose model call fails', () => {
  it('answers as a failed tool and logs the error as an error: a model that fails needs fixing', async () => {
    const result = await executeAiResponder({ instructions: 'Answer briefly' }, { input: 'hi' });

    expect(result).toEqual({ success: false, error: modelDown.message });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: modelDown }) })]);
  });
});
