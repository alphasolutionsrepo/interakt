// src/features/search/providers/azure-ai-search/azure-search.provider.query-logs.test.ts

/**
 * A visitor's question reaches the Azure provider's log lines only when the request may keep
 * content (its telemetry level is 'full'); otherwise the line keeps its length.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('./azure-client', () => ({
    getSearchClient: () => ({ search: async () => ({ results: (async function* () { /* no hits */ })(), count: 0 }) }),
    checkAzureHealth: vi.fn(),
}));

import { AzureSearchProvider } from './azure-search.provider';

import { clearAllTelemetryOverrides, initializeTelemetryConfig, runWithTelemetryLevel } from '@/features/telemetry/telemetry.config';
import type { LogLine } from '@/shared/test/log-recorder';

const QUESTION = 'blue linen shirt for my wedding';
const search = () => new AzureSearchProvider().search({
    context: { indexName: 'products', searchableFields: [], defaultResponseFields: [], facetableFields: [], allFields: new Map() },
    request: { query: QUESTION },
    searchType: 'lexical',
} as never);

beforeEach(() => {
    logs.length = 0;
    initializeTelemetryConfig().enabled = true;
});
afterEach(() => {
    clearAllTelemetryOverrides();
    initializeTelemetryConfig().enabled = false;
});

describe('Azure search logs', () => {
    it('log the length, not the question, when the request may not keep content', async () => {
        await search();

        expect(logs.find((l) => l.message === 'Executing Azure search')?.context).toMatchObject({ queryLength: QUESTION.length });
        expect(JSON.stringify(logs)).not.toContain('linen');
    });

    it('log the question when the request may keep content', async () => {
        await runWithTelemetryLevel('full', search);

        expect(logs.find((l) => l.message === 'Executing Azure search')?.context).toMatchObject({ query: QUESTION });
    });
});
