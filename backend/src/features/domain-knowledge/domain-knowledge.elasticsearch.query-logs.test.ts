// src/features/domain-knowledge/domain-knowledge.elasticsearch.query-logs.test.ts

/**
 * Knowledge search logs the visitor's question only when the request may keep content
 * (its telemetry level is Full); otherwise its length.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAllTelemetryOverrides, initializeTelemetryConfig, runWithTelemetryLevel } from '@/features/telemetry/telemetry.config';
import { type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
const esSearch = vi.hoisted(() => vi.fn());
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/search/providers/elasticsearch', () => ({
  getElasticsearchClient: () => ({ search: esSearch }),
  indexExists: vi.fn(async () => true),
  createIndex: vi.fn(),
  refreshIndex: vi.fn(),
  deleteIndex: vi.fn(),
}));

import { searchKnowledge } from './domain-knowledge.elasticsearch';

const QUESTION = 'can I defer my exam for health reasons';
const line = (message: string) => logs.find((l) => l.message === message);
const searchTwice = async () => {
  await searchKnowledge('i1', QUESTION);
  esSearch.mockRejectedValueOnce(new Error('engine down'));
  await searchKnowledge('i1', QUESTION);
};

beforeEach(() => {
  logs.length = 0;
  esSearch.mockReset();
  esSearch.mockResolvedValue({ hits: { hits: [] } });
  initializeTelemetryConfig().enabled = true;
});
afterEach(() => {
  clearAllTelemetryOverrides();
  initializeTelemetryConfig().enabled = false;
});

describe('knowledge search logs', () => {
  it('log the length, not the question, when the request may not keep content', async () => {
    await searchTwice();

    expect(line('Knowledge search completed')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(line('Knowledge search failed')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(JSON.stringify(logs)).not.toContain('defer');
  });

  it('log the question when the request may keep content', async () => {
    await runWithTelemetryLevel('full', searchTwice);

    expect(line('Knowledge search completed')?.context).toMatchObject({ query: QUESTION });
    expect(line('Knowledge search failed')?.context).toMatchObject({ query: QUESTION });
  });
});
