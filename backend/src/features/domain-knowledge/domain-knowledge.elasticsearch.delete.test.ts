// src/features/domain-knowledge/domain-knowledge.elasticsearch.delete.test.ts

/**
 * Elasticsearch passes a failed index delete on instead of logging it, and the callers
 * that delete a knowledge index don't look at the result, so deleting one logs its own
 * failure, once, with the error.
 */

import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/search/providers/elasticsearch', () => ({
  getElasticsearchClient: vi.fn(),
  indexExists: vi.fn(),
  createIndex: vi.fn(),
  refreshIndex: vi.fn(),
  deleteIndex: async () => ({ success: false, error: 'connect ECONNREFUSED 127.0.0.1:9200', cause: new Error('connect ECONNREFUSED 127.0.0.1:9200') }),
}));

import { deleteKnowledgeIndex } from './domain-knowledge.elasticsearch';

describe('a knowledge index Elasticsearch fails to delete', () => {
  it('is logged once, as an error, with the error', async () => {
    const result = await deleteKnowledgeIndex('i1');

    expect(result).toMatchObject({ success: false });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ error: 'connect ECONNREFUSED 127.0.0.1:9200' }) }),
    ]);
  });
});
