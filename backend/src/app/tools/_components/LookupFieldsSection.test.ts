// src/app/tools/_components/LookupFieldsSection.test.ts

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

import type { LookupFieldsStatus } from '../_lib/api-client';

vi.mock('@/shared/ui/components/multi-select', () => ({ MultiSelect: () => null }));

import { LookupFieldsSection, LookupFieldsWarnings, lookupConfigView } from './LookupFieldsSection';

const status: LookupFieldsStatus = {
  candidates: [
    { name: 'title', type: 'text', searchable: true, filterable: false, hasPaths: false, role: null, shownInResponses: true },
    { name: 'sku', type: 'keyword', searchable: true, filterable: true, hasPaths: false, role: null, shownInResponses: true },
  ],
  rules: { findsThroughSearch: true, codesNeedFilter: false },
  chosen: { nameFields: [], codeFields: [] },
  configured: false,
  missing: [],
  errors: [],
  warnings: [],
  suggested: { nameFields: [], codeFields: ['sku'] },
} as LookupFieldsStatus;

const render = (value: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(LookupFieldsSection, { status, value, onChange: vi.fn() }));

describe('LookupFieldsSection suggestion', () => {
  it('offers the suggested fields while the tool has none chosen', () => {
    expect(render({})).toContain('Use suggested fields');
  });

  it("doesn't offer it once fields are chosen, since applying it would replace them", () => {
    expect(render({ nameFields: ['title'] })).not.toContain('Use suggested fields');
    expect(render({ idField: 'productId' })).not.toContain('Use suggested fields');
  });
});

describe('lookupConfigView', () => {
  const state = (over: Partial<Parameters<typeof lookupConfigView>[1]>) => ({ status: null, isLoading: false, isError: false, ...over });

  it("never shows a Find Record tool the data source form while its fields load or failed to load", () => {
    expect(lookupConfigView('lookup', state({ isLoading: true }))).toBe('loading');
    expect(lookupConfigView('lookup', state({ isError: true }))).toBe('error');
    expect(lookupConfigView('lookup', state({ status }))).toBe('fields');
  });

  it('keeps the form for other tools and for a Find Record tool with no fields to choose', () => {
    expect(lookupConfigView('search', state({ isLoading: true }))).toBe('form');
    expect(lookupConfigView('lookup', state({}))).toBe('form');
  });
});

describe('LookupFieldsWarnings', () => {
  it('says once that a chosen field left the index', () => {
    const html = renderToStaticMarkup(createElement(LookupFieldsWarnings, { status, chosen: { nameFields: ['title', 'gone'] } }));
    expect(html).toContain('&quot;gone&quot; is no longer in the index');
    expect(html).not.toContain("gone isn&#x27;t a field");
  });
});
