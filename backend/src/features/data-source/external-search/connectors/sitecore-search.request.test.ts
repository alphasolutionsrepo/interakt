// src/features/data-source/external-search/connectors/sitecore-search.request.test.ts

import { describe, it, expect, vi } from 'vitest';

import type { ExternalConnection } from '../external-search.types';
import { inferSitecoreFields, sitecoreFieldTypes, sitecoreSearchConnector } from './sitecore-search.connector';
import {
  sitecoreSettings,
  translateFilter,
  buildFilter,
  untranslatableReason,
  buildSitecoreRequest,
  mapSitecoreResponse,
  isMatchAll,
} from './sitecore-search.request';

function connection(providerSettings: Record<string, unknown> = {}): ExternalConnection {
  return {
    provider: 'sitecore-search',
    endpoint: 'https://discover.sitecorecloud.io/discover/v2/123',
    indexName: 'rfk_global_search',
    apiKey: '',
    authType: 'none',
    providerSettings,
  };
}

const SETTINGS = sitecoreSettings(connection({
  fixedFilters: [
    { field: 'environment', operator: 'eq', value: 'prod' },
    { field: 'site', operator: 'eq', value: 'www' },
  ],
}));

/** The single widget item's search block of a built request. */
function searchOf(body: Record<string, unknown>): Record<string, any> {
  const items = (body.widget as { items: Array<{ search: Record<string, any> }> }).items;
  expect(items).toHaveLength(1);
  return items[0].search;
}

function build(input: Partial<Parameters<typeof buildSitecoreRequest>[1]>, settings = SETTINGS) {
  return buildSitecoreRequest(settings, { offset: 0, limit: 10, ...input }, 'u1');
}

describe('sitecoreSettings', () => {
  it('maps the connection: URL is the endpoint, index name is the widget', () => {
    const s = sitecoreSettings(connection());
    expect(s.endpoint).toBe('https://discover.sitecorecloud.io/discover/v2/123');
    expect(s.rfkId).toBe('rfk_global_search');
    expect(s.entity).toBe('content');
    expect(s.pageUri).toBe('/search');
    expect(s.fixedFilters).toEqual([]);
  });

  it('reads entity, locale and fixed filters from providerSettings', () => {
    const s = sitecoreSettings(connection({ entity: 'product', locale: { country: 'us', language: 'en' } }));
    expect(s.entity).toBe('product');
    expect(s.locale).toEqual({ country: 'us', language: 'en' });
  });
});

describe('translateFilter', () => {
  it('maps comparison operators', () => {
    expect(translateFilter({ field: 'type', operator: 'eq', value: 'a' })).toEqual({ type: 'eq', name: 'type', value: 'a' });
    expect(translateFilter({ field: 'n', operator: 'gte', value: 3 })).toEqual({ type: 'gte', name: 'n', value: 3 });
  });

  it('maps negations', () => {
    expect(translateFilter({ field: 'type', operator: 'neq', value: 'a' }))
      .toEqual({ type: 'not', filter: { type: 'eq', name: 'type', value: 'a' } });
    expect(translateFilter({ field: 'type', operator: 'nin', value: ['a', 'b'] }))
      .toEqual({ type: 'not', filter: { type: 'anyOf', name: 'type', values: ['a', 'b'] } });
  });

  it('maps in to anyOf, wrapping a scalar', () => {
    expect(translateFilter({ field: 'tags', operator: 'in', value: ['x', 'y'] }))
      .toEqual({ type: 'anyOf', name: 'tags', values: ['x', 'y'] });
    expect(translateFilter({ field: 'tags', operator: 'in', value: 'x' }))
      .toEqual({ type: 'anyOf', name: 'tags', values: ['x'] });
  });

  it('maps range bounds, honouring exclusivity', () => {
    expect(translateFilter({ field: 'p', operator: 'range', value: { from: 1, to: 5 } })).toEqual({
      type: 'and',
      filters: [{ type: 'gte', name: 'p', value: 1 }, { type: 'lte', name: 'p', value: 5 }],
    });
    expect(translateFilter({ field: 'p', operator: 'range', value: { from: 1, includeLower: false } }))
      .toEqual({ type: 'gt', name: 'p', value: 1 });
  });

  it('recurses through and / or / not', () => {
    expect(translateFilter({
      field: '',
      operator: 'or',
      filters: [
        { field: 'type', operator: 'eq', value: 'a' },
        { field: '', operator: 'not', filters: [{ field: 'tags', operator: 'eq', value: 'b' }] },
      ],
    })).toEqual({
      type: 'or',
      filters: [
        { type: 'eq', name: 'type', value: 'a' },
        { type: 'not', filter: { type: 'eq', name: 'tags', value: 'b' } },
      ],
    });
  });
});

describe('buildFilter', () => {
  it.each(['contains', 'prefix', 'exists', 'missing'] as const)('reports %s as unapplied instead of failing', (operator) => {
    const { filter, unapplied } = buildFilter([], [
      { field: 'type', operator: 'eq', value: 'a' },
      { field: 'name', operator, value: 'x' },
    ]);
    expect(filter).toEqual({ type: 'and', filters: [{ type: 'eq', name: 'type', value: 'a' }] });
    expect(unapplied).toEqual([{ field: 'name', operator, reason: `Sitecore Search has no '${operator}' filter` }]);
  });
});

describe('filters Sitecore cannot be sent', () => {
  it.each([
    ['a range with no bounds', { field: 'price', operator: 'range', value: {} }, "'range' needs a from or to value"],
    ['an empty list', { field: 'type', operator: 'in', value: [] }, "'in' needs at least one value"],
    ['a comparison with no value', { field: 'price', operator: 'gte' }, "'gte' needs a value"],
    ['a field-less condition', { field: '', operator: 'eq', value: 'x' }, "'eq' needs a field"],
    ['an empty and', { field: '', operator: 'and', filters: [] }, "'and' needs at least one filter"],
    ['an empty not', { field: '', operator: 'not', filters: [] }, "'not' needs a filter"],
  ] as const)('explains %s', (_case, clause, reason) => {
    expect(untranslatableReason(clause as never)).toBe(reason);
  });

  it('explains a problem inside a nested filter', () => {
    const clause = { field: '', operator: 'or', filters: [{ field: 'price', operator: 'range', value: {} }] };
    expect(untranslatableReason(clause as never)).toBe("'range' needs a from or to value");
  });

  it('finds nothing wrong with a filter it can send', () => {
    expect(untranslatableReason({ field: 'price', operator: 'range', value: { from: 10 } })).toBeUndefined();
  });

  it('names the fixed filter that cannot be sent, and where to fix it', () => {
    expect(() => buildFilter([{ field: 'price', operator: 'range', value: {} }], undefined)).toThrow(
      "Fixed filter on 'price' can't be used: 'range' needs a from or to value. Fix it in the data source's settings.",
    );
  });
});

describe('buildSitecoreRequest', () => {
  it('sends the keyphrase, paging and fixed filters', () => {
    const { body } = build({ query: ' computer science ', offset: 20, limit: 10 });
    const search = searchOf(body);
    expect(search.query).toEqual({ keyphrase: 'computer science' });
    expect(search.limit).toBe(10);
    expect(search.offset).toBe(20);
    expect(search.filter).toEqual({
      type: 'and',
      filters: [
        { type: 'eq', name: 'environment', value: 'prod' },
        { type: 'eq', name: 'site', value: 'www' },
      ],
    });
    expect(body.context).toEqual({ page: { uri: '/search' }, user: { uuid: 'u1' } });
    expect((body.widget as any).items[0]).toMatchObject({ rfk_id: 'rfk_global_search', entity: 'content' });
  });

  it('omits the keyphrase for match-all queries', () => {
    expect(isMatchAll('*')).toBe(true);
    expect(searchOf(build({ query: '*' }).body).query).toBeUndefined();
    expect(searchOf(build({ query: '' }).body).query).toBeUndefined();
  });

  it('ANDs request filters after the fixed ones', () => {
    const search = searchOf(build({
      query: 'x',
      filters: [{ field: 'type', operator: 'eq', value: 'degree_profile_page' }],
    }).body);
    expect(search.filter.filters).toHaveLength(3);
    expect(search.filter.filters[2]).toEqual({ type: 'eq', name: 'type', value: 'degree_profile_page' });
  });

  it('sends no filter when there is none', () => {
    expect(searchOf(build({ query: 'x' }, sitecoreSettings(connection())).body).filter).toBeUndefined();
  });

  it('requests facets by name with optional size', () => {
    const search = searchOf(build({ query: 'x', facets: [{ field: 'type', size: 5 }, { field: 'tags' }] }).body);
    expect(search.facet).toEqual({ types: [{ name: 'type', max: 5 }, { name: 'tags' }] });
  });

  it('maps sort and drops _score', () => {
    const search = searchOf(build({
      query: 'x',
      sort: [{ field: '_score', direction: 'desc' }, { field: 'name', direction: 'asc' }],
    }).body);
    expect(search.sort).toEqual({ value: [{ name: 'name', order: 'asc' }] });
    expect(searchOf(build({ query: 'x', sort: [{ field: '_score', direction: 'desc' }] }).body).sort).toBeUndefined();
  });

  it('limits returned attributes when fields are given', () => {
    expect(searchOf(build({ query: 'x', fields: ['name', 'url'] }).body).content).toEqual({ fields: ['name', 'url'] });
    expect(searchOf(build({ query: 'x' }).body).content).toEqual({});
  });
});

describe('mapSitecoreResponse', () => {
  // Shape of a real Sitecore Search response, trimmed.
  const RESPONSE = {
    widgets: [
      {
        rfk_id: 'rfk_global_search',
        total_item: 3310,
        content: [
          { id: 'https___www_example_edu_engineering', name: 'College of Engineering', type: 'universal_home_page' },
          { id: 'https___www_example_edu_cs', name: 'Computer science (B.S.C.S.)', type: 'degree_profile_page' },
        ],
        facet: [
          { name: 'type', label: 'Type', value: [{ id: 'f1', text: 'person_profile_page', count: 915 }] },
        ],
      },
      { rfk_id: 'rfk_global_search_sidebar', total_item: 5280, content: [{ id: 'other' }] },
    ],
  };

  it('picks the configured widget and ranks hits by position', () => {
    const mapped = mapSitecoreResponse(RESPONSE, 'rfk_global_search', 0);
    expect(mapped.total).toBe(3310);
    expect(mapped.hits.map((h) => h.id)).toEqual(['https___www_example_edu_engineering', 'https___www_example_edu_cs']);
    expect(mapped.hits[0].score).toBe(1);
    expect(mapped.hits[1].score).toBe(0.5);
    expect(mapped.hits[1].source.name).toBe('Computer science (B.S.C.S.)');
  });

  it('keeps scores decreasing across pages', () => {
    expect(mapSitecoreResponse(RESPONSE, 'rfk_global_search', 10).hits[0].score).toBeCloseTo(1 / 11);
  });

  it('maps facets', () => {
    expect(mapSitecoreResponse(RESPONSE, 'rfk_global_search', 0).facets).toEqual([
      { field: 'type', buckets: [{ key: 'person_profile_page', count: 915 }] },
    ]);
    expect(mapSitecoreResponse(RESPONSE, 'rfk_global_search_sidebar', 0).facets).toBeUndefined();
  });

  it('fails on Sitecore errors or a missing widget', () => {
    expect(() => mapSitecoreResponse({ errors: [{ message: 'bad key' }] }, 'w', 0)).toThrow(/returned errors: bad key/);
    expect(() => mapSitecoreResponse(RESPONSE, 'rfk_missing', 0)).toThrow(/no widget/);
  });
});

describe('inferSitecoreFields', () => {
  const fields = inferSitecoreFields({
    items: [
      {
        id: 'a', name: 'College of Engineering', url: 'https://x/engr', type: 'universal_home_page',
        description: 'Discover the top-ranked College of Engineering and its programs.', breadcrumbs: ['Home', 'Engineering'],
        tags: null,
      },
    ],
    total: 1,
    facets: new Map([['type', 'Type'], ['tags', 'Tags']]),
  });
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

  it('turns attributes and facets into fields', () => {
    expect(fields.map((f) => f.name)).toEqual(['id', 'name', 'url', 'type', 'description', 'breadcrumbs', 'tags']);
  });

  it('marks free text searchable and facets facetable/filterable', () => {
    expect(byName.name).toMatchObject({ isSearchable: true, role: 'title' });
    expect(byName.description).toMatchObject({ isSearchable: true });
    expect(byName.type).toMatchObject({ isFacetable: true, isFilterable: true, isSearchable: false, displayName: 'Type' });
    expect(byName.url).toMatchObject({ isSearchable: false, isFacetable: false });
    expect(byName.id).toMatchObject({ isSearchable: false });
    expect(byName.breadcrumbs).toMatchObject({ providerType: 'array', isSearchable: false });
    expect(byName.id).toMatchObject({ isFilterable: true });
  });
});

describe('field types for filter values', () => {
  const fields = inferSitecoreFields({
    items: [{ id: 'a', title: 'A page', year: 2024, sizes: [3, 4], labels: ['x'], code: '' }],
    total: 1,
    facets: new Map([['rating', 'Rating']]),
  });
  const types = sitecoreFieldTypes(fields);

  it('takes a list attribute type from its items', () => {
    expect(types.get('sizes')).toBe('number');
    expect(types.get('labels')).toBe('text');
    expect(types.get('year')).toBe('number');
  });

  // Sitecore rejects a value of the wrong type, so a guessed type would break a value that works as sent
  it('leaves out attributes the sample had no value for', () => {
    expect(types.has('rating')).toBe(false);
    expect(types.has('code')).toBe(false);
    expect(translateFilter({ field: 'rating', operator: 'eq', value: 2 }, types)).toEqual({ type: 'eq', name: 'rating', value: 2 });
  });
});

describe('sitecoreSearchConnector', () => {
  it('asks for at least one item (Sitecore rejects limit 0) and returns none for a facet-only request', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        widgets: [{ rfk_id: 'rfk_global_search', total_item: 9, content: [{ id: 'a' }], facet: [{ name: 'type', value: [{ text: 'x', count: 9 }] }] }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await sitecoreSearchConnector.search(connection(), { query: '*', offset: 0, limit: 0, facets: [{ field: 'type' }] });
      const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
      expect(sent.widget.items[0].search.limit).toBe(1);
      expect(result.hits).toEqual([]);
      expect(result.facets).toEqual([{ field: 'type', buckets: [{ key: 'x', count: 9 }] }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends filter values as the source's field types", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ widgets: [{ rfk_id: 'rfk_global_search', total_item: 0, content: [] }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const fields = inferSitecoreFields({ total: 1, items: [{ id: 'a', type: 'page', year: 2024 }], facets: new Map([['type', 'Type']]) });
      await sitecoreSearchConnector.search(connection(), {
        query: '', offset: 0, limit: 3,
        filters: [{ field: 'type', operator: 'eq', value: 80 }, { field: 'year', operator: 'gte', value: '2020' }],
      }, fields);
      const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
      expect(sent.widget.items[0].search.filter.filters).toEqual([
        { type: 'eq', name: 'type', value: '80' },
        { type: 'gte', name: 'year', value: 2020 },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// Sitecore rejects a value that isn't its attribute's type: "filter value '80' not of the expected type"
describe("filter values as their field's type", () => {
  const types = new Map([['type', 'text'], ['price', 'number'], ['open', 'boolean']]);
  const sent = (field: string, operator: string, value: unknown) =>
    translateFilter({ field, operator, value } as never, types);

  it("sends a value as its field's type when the source lists the field", () => {
    expect(sent('type', 'eq', 80)).toEqual({ type: 'eq', name: 'type', value: '80' });
    expect(sent('type', 'eq', true)).toEqual({ type: 'eq', name: 'type', value: 'true' });
    expect(sent('price', 'lte', '80')).toEqual({ type: 'lte', name: 'price', value: 80 });
    expect(sent('open', 'eq', 'true')).toEqual({ type: 'eq', name: 'open', value: true });
    expect(sent('type', 'in', ['page', 80])).toEqual({ type: 'anyOf', name: 'type', values: ['page', '80'] });
    expect(sent('price', 'range', { from: '10', to: 80 })).toEqual({
      type: 'and', filters: [{ type: 'gte', name: 'price', value: 10 }, { type: 'lte', name: 'price', value: 80 }],
    });
    expect(translateFilter({ operator: 'not', filters: [{ field: 'type', operator: 'eq', value: 80 }] } as never, types))
      .toEqual({ type: 'not', filter: { type: 'eq', name: 'type', value: '80' } });
  });

  it("reports a value that can't be its field's type as not applied", () => {
    expect(buildFilter([], [{ field: 'price', operator: 'lte', value: 'cheap' }] as never, types).unapplied).toEqual([
      { field: 'price', operator: 'lte', reason: `"cheap" is not a number value for 'price'` },
    ]);
  });
});

describe('fixed filters and field types', () => {
  const types = new Map([['type', 'text'], ['price', 'number']]);

  it("converts a fixed filter's value to its field's type", () => {
    expect(buildFilter([{ field: 'price', operator: 'lte', value: '80' }], [], types).filter)
      .toEqual({ type: 'and', filters: [{ type: 'lte', name: 'price', value: 80 }] });
  });

  // Saving can't check value types (fields are sampled after the source is saved),
  // so a fixed filter must not start failing every search when it doesn't convert.
  it('sends a fixed filter that does not fit its field type as written', () => {
    const { filter, unapplied } = buildFilter([{ field: 'price', operator: 'lte', value: 'cheap' }], [], types);
    expect(filter).toEqual({ type: 'and', filters: [{ type: 'lte', name: 'price', value: 'cheap' }] });
    expect(unapplied).toEqual([]);
  });

  it('still refuses a fixed filter Sitecore has no operator for', () => {
    expect(() => buildFilter([{ field: 'type', operator: 'contains', value: 'x' }], [], types))
      .toThrow("Fixed filter on 'type' can't be used");
  });
});
