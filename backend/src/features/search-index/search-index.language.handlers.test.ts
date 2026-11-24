// src/features/search-index/search-index.language.handlers.test.ts

/**
 * An unsupported index language comes back from the create, update and import routes as a
 * 400 that names the language and the engine, not a 500.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { ValidationError } from '@/shared/errors/app-error';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const message = "Language 'klingon' isn't available for Azure AI Search";
const service = vi.hoisted(() => ({
  updateSearchIndex: vi.fn(),
  importSearchIndex: vi.fn(),
  createSearchIndex: vi.fn(),
}));
vi.mock('./search-index.service', () => service);
vi.mock('./search-index-fields.service', () => ({}));
vi.mock('@/features/data-source/data-source.service', () => ({ refreshSchemaForSearchIndex: vi.fn() }));

import { handleImportSearchIndex, handleUpdateSearchIndex } from './search-index.api.handlers';

const ID = '7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f';
const post = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('an unsupported language', () => {
  it('is a 400 from the update route', async () => {
    service.updateSearchIndex.mockRejectedValue(new ValidationError(message));
    const res = await handleUpdateSearchIndex(post(`http://localhost/api/search-indexes/${ID}`, 'PUT', { language: 'klingon' }), { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(message);
  });

  it('is a 400 from the import route', async () => {
    service.importSearchIndex.mockRejectedValue(new ValidationError(message));
    const body = {
      importData: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        searchIndex: { name: 'shop', displayName: 'Shop', templateSlug: '', searchType: 'lexical', indexingStrategy: 'on_upload', language: 'klingon', synonyms: [], stopWords: [], rrfRankConstant: 60, rrfWindowSize: 100 },
        fields: [],
      },
    };
    const res = await handleImportSearchIndex(post('http://localhost/api/search-indexes/import', 'POST', body));
    expect(service.importSearchIndex).toHaveBeenCalled();
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(message);
  });
});
