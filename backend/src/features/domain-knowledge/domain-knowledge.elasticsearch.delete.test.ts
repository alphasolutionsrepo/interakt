// src/features/domain-knowledge/domain-knowledge.elasticsearch.delete.test.ts

/**
 * Elasticsearch passes a failed index delete on instead of logging it, and the callers
 * that delete a knowledge index don't look at the result, so deleting one logs its own
 * failure, once, with the error itself (its type, stack and causes, not just its message).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
const down = vi.hoisted(() => new Error('connect ECONNREFUSED 127.0.0.1:9200'));
const deleteIndex = vi.hoisted(() => vi.fn());
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/search/providers/elasticsearch', () => ({
  getElasticsearchClient: vi.fn(),
  indexExists: vi.fn(),
  createIndex: vi.fn(),
  refreshIndex: vi.fn(),
  deleteIndex,
}));

import { deleteKnowledgeIndex } from './domain-knowledge.elasticsearch';

beforeEach(() => { logs.length = 0; });

describe('a knowledge index Elasticsearch fails to delete', () => {
  it('is logged once, as an error, with the error', async () => {
    deleteIndex.mockResolvedValue({ success: false, error: down.message, cause: down });
    const result = await deleteKnowledgeIndex('i1');

    expect(result).toMatchObject({ success: false, cause: down });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: down }) }),
    ]);
  });

  it('is logged once, as an error, with the error, when the delete throws', async () => {
    deleteIndex.mockRejectedValue(down);
    const result = await deleteKnowledgeIndex('i1');

    expect(result).toMatchObject({ success: false, error: down.message, cause: down });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: down }) }),
    ]);
  });
});
