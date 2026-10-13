// app/data-sources/_lib/external-config.test.ts

import { describe, it, expect } from 'vitest';

import { externalConfigToForm, externalFormToConfig, parseFixedFilters } from './external-config';

const STORED = {
  provider: 'sitecore_search',
  connection: {
    url: 'https://discover.sitecorecloud.io/discover/v2/1',
    authType: 'api_key',
    credentials: { secretRef: 'sitecore_key' },
    indexName: 'rfk_global_search',
  },
  searchDefaults: { searchType: 'lexical', maxResults: 10, includeHighlights: false },
  healthCheck: { enabled: true, intervalMs: 60000 },
  profileSampleSize: 25,
  providerSettings: {
    entity: 'content',
    fixedFilters: [
      { field: 'environment', operator: 'eq', value: 'prod' },
      { field: 'site', operator: 'eq', value: 'www' },
    ],
  },
};

describe('externalConfigToForm', () => {
  it('puts the provider and settings where the form reads them', () => {
    const form = externalConfigToForm(STORED);
    const connection = form.connection as Record<string, any>;
    expect(connection.provider).toBe('sitecore_search');
    expect(connection.url).toBe(STORED.connection.url);
    expect(connection.providerSettings).toEqual({ entity: 'content', fixedFiltersText: 'environment = prod\nsite = www' });
  });
});

describe('externalFormToConfig', () => {
  it('round-trips a stored config unchanged', () => {
    expect(externalFormToConfig(externalConfigToForm(STORED), STORED)).toEqual(STORED);
  });

  it('saves edits made in the form', () => {
    const form = externalConfigToForm(STORED) as Record<string, any>;
    form.connection.indexName = 'rfk_other';
    form.connection.providerSettings.fixedFiltersText = 'site = www';
    const saved = externalFormToConfig(form, STORED) as Record<string, any>;
    expect(saved.provider).toBe('sitecore_search');
    expect(saved.connection.indexName).toBe('rfk_other');
    expect(saved.providerSettings.fixedFilters).toEqual([{ field: 'site', operator: 'eq', value: 'www' }]);
    expect(saved.profileSampleSize).toBe(25);
  });

  it('applies a provider change at the top level, where the server reads it', () => {
    const form = externalConfigToForm(STORED) as Record<string, any>;
    form.connection.provider = 'elasticsearch';
    const saved = externalFormToConfig(form, STORED) as Record<string, any>;
    expect(saved.provider).toBe('elasticsearch');
    expect(saved.providerSettings).toBeUndefined();
    expect(saved.connection.provider).toBeUndefined();
  });

  it('builds a full config on create', () => {
    const saved = externalFormToConfig({
      connection: { provider: 'elasticsearch', url: 'http://es:9200', indexName: 'products' },
    }) as Record<string, any>;
    expect(saved).toMatchObject({
      provider: 'elasticsearch',
      connection: { url: 'http://es:9200', authType: 'api_key', credentials: { secretRef: '' }, indexName: 'products' },
      searchDefaults: { searchType: 'auto', maxResults: 10, includeHighlights: true },
      healthCheck: { enabled: true, intervalMs: 60000 },
    });
  });
});

describe('parseFixedFilters', () => {
  it('ignores blank and malformed lines and keeps "=" inside values', () => {
    expect(parseFixedFilters('a = 1\n\nnot a filter\n b=x=y ')).toEqual([
      { field: 'a', operator: 'eq', value: '1' },
      { field: 'b', operator: 'eq', value: 'x=y' },
    ]);
  });
});
