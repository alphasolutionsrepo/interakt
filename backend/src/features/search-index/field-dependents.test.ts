import { describe, it, expect } from 'vitest';
import { findFieldDependents, type FieldDependentsInput } from './field-dependents';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import type { FieldMappingConfig } from '@/shared/constants/search-index.constants';

// ============================================================================
// HELPERS
// ============================================================================

let nextId = 1;

/**
 * Build a minimal field. Only the columns the matchers read are meaningful.
 */
function field(overrides: {
    fieldName: string;
    isVectorSource?: boolean;
    isAutocomplete?: boolean;
    filterValueMappings?: Record<string, string[]>;
    transformConfig?: FieldMappingConfig | null;
    id?: number;
}): SearchIndexField {
    return {
        id: overrides.id ?? nextId++,
        searchIndexId: '550e8400-e29b-41d4-a716-446655440000',
        fieldName: overrides.fieldName,
        fieldType: 'keyword',
        isSystemField: false,
        isVectorSource: overrides.isVectorSource ?? false,
        isAutocomplete: overrides.isAutocomplete ?? false,
        filterValueMappings: overrides.filterValueMappings ?? {},
        transformConfig: overrides.transformConfig ?? null,
    } as unknown as SearchIndexField;
}

/** A reference-mode field pointing at another field by name. */
function referenceField(fieldName: string, sourceFromField: string): SearchIndexField {
    return field({
        fieldName,
        transformConfig: { mode: 'reference', sourceFromField, transform: 'none' },
    });
}

function input(overrides: Partial<FieldDependentsInput> & { field: SearchIndexField }): FieldDependentsInput {
    return {
        allFields: [overrides.field],
        searchType: 'lexical',
        experiences: [],
        tools: [],
        ...overrides,
    };
}

function tool(overrides: {
    name?: string;
    displayFields?: Array<{ source: string; role?: string }>;
    executorConfig?: Record<string, unknown> | null;
    overrides?: Array<{ experienceName: string; config: Record<string, unknown> | null }>;
}) {
    return {
        name: overrides.name ?? 'Product Search',
        displayFields: overrides.displayFields ?? [],
        executorConfig: overrides.executorConfig ?? null,
        overrides: overrides.overrides ?? [],
    };
}

// ============================================================================
// INTRA-INDEX FIELD REFERENCES
// ============================================================================

describe('findFieldDependents — field references within the index', () => {
    it('flags a field used as another field\'s source', () => {
        const target = field({ fieldName: 'productId' });
        const referrer = referenceField('sku', 'productId');

        const { dependents } = findFieldDependents(
            input({ field: target, allFields: [target, referrer] })
        );

        expect(dependents).toHaveLength(1);
        expect(dependents[0].kind).toBe('field-reference');
        expect(dependents[0].label).toContain('sku');
    });

    it('escalates the detail when the referrer is uniqueId', () => {
        // uniqueId wired to a business key is the common case, and losing it
        // breaks document IDs for the whole index
        const target = field({ fieldName: 'productId' });
        const uniqueId = referenceField('uniqueId', 'productId');

        const { dependents } = findFieldDependents(
            input({ field: target, allFields: [target, uniqueId] })
        );

        expect(dependents[0].detail).toContain('document IDs');
    });

    it('does not flag the field against itself', () => {
        const self = referenceField('uniqueId', 'uniqueId');

        const { dependents } = findFieldDependents(input({ field: self, allFields: [self] }));

        expect(dependents).toHaveLength(0);
    });

    it('ignores non-reference mapping modes', () => {
        const target = field({ fieldName: 'productId' });
        const other = field({
            fieldName: 'sku',
            transformConfig: { mode: 'source', transform: 'none' },
        });

        const { dependents } = findFieldDependents(
            input({ field: target, allFields: [target, other] })
        );

        expect(dependents).toHaveLength(0);
    });
});

// ============================================================================
// SEARCH EXPERIENCES
// ============================================================================

describe('findFieldDependents — search experience display config', () => {
    it('flags a field named in displayFields', () => {
        const target = field({ fieldName: 'name' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                experiences: [{
                    name: 'Smart Search',
                    displayFields: [{ fieldName: 'name', role: 'title' }],
                }],
            })
        );

        expect(dependents).toHaveLength(1);
        expect(dependents[0].kind).toBe('experience-display');
        expect(dependents[0].label).toContain('Smart Search');
        expect(dependents[0].detail).toContain('title');
    });

    it('ignores experiences that do not name the field', () => {
        const target = field({ fieldName: 'name' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                experiences: [{
                    name: 'Smart Search',
                    displayFields: [{ fieldName: 'description', role: 'description' }],
                }],
            })
        );

        expect(dependents).toHaveLength(0);
    });
});

// ============================================================================
// TOOLS
// ============================================================================

describe('findFieldDependents — tool display config', () => {
    it('matches on `source`, the key tools use for a field name', () => {
        const target = field({ fieldName: 'primaryImageUrl' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({
                    name: 'Catalog Lookup',
                    displayFields: [{ source: 'primaryImageUrl', role: 'image' }],
                })],
            })
        );

        expect(dependents).toHaveLength(1);
        expect(dependents[0].kind).toBe('tool-display');
        expect(dependents[0].detail).toContain('image');
    });

    it('does not match a tool display field on `fieldName`', () => {
        // Guards against copy-pasting the search-experience matcher: tools spell
        // this key `source`, so a `fieldName` key must not register
        const target = field({ fieldName: 'primaryImageUrl' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({
                    displayFields: [
                        { fieldName: 'primaryImageUrl', role: 'image' } as unknown as { source: string },
                    ],
                })],
            })
        );

        expect(dependents).toHaveLength(0);
    });
});

describe('findFieldDependents — tool executor config', () => {
    it('flags the lookup idField', () => {
        const target = field({ fieldName: 'sku' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({ executorConfig: { idField: 'sku' } })],
            })
        );

        expect(dependents).toHaveLength(1);
        expect(dependents[0].kind).toBe('tool-executor');
        expect(dependents[0].detail).toContain('document ID field');
    });

    it('flags defaultSort', () => {
        const target = field({ fieldName: 'price' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({
                    executorConfig: { defaultSort: [{ field: 'price', direction: 'asc' }] },
                })],
            })
        );

        expect(dependents[0].detail).toContain('default sort');
    });

    it('flags defaultFilters', () => {
        const target = field({ fieldName: 'status' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({
                    executorConfig: {
                        defaultFilters: [{ field: 'status', operator: 'eq', value: 'active' }],
                    },
                })],
            })
        );

        expect(dependents[0].detail).toContain('default filters');
    });

    it('flags defaultField', () => {
        const target = field({ fieldName: 'category' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({ executorConfig: { defaultField: 'category' } })],
            })
        );

        expect(dependents[0].detail).toContain('defaultField');
    });

    it('flags projection lists, including responseFields', () => {
        // responseFields is read by the search executor but not declared on the
        // schema's ExecutorConfig union — the scan works off raw keys for exactly
        // this reason
        const target = field({ fieldName: 'description' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({ executorConfig: { responseFields: ['name', 'description'] } })],
            })
        );

        expect(dependents[0].detail).toContain('responseFields');
    });

    it('reports every use on one tool in a single finding', () => {
        const target = field({ fieldName: 'price' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({
                    executorConfig: {
                        defaultSort: [{ field: 'price', direction: 'asc' }],
                        includeFields: ['price'],
                    },
                })],
            })
        );

        expect(dependents).toHaveLength(1);
        expect(dependents[0].detail).toContain('default sort');
        expect(dependents[0].detail).toContain('includeFields');
    });

    it('ignores a tool that does not reference the field', () => {
        const target = field({ fieldName: 'price' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({ executorConfig: { idField: 'sku', maxResults: 10 } })],
            })
        );

        expect(dependents).toHaveLength(0);
    });
});

describe('findFieldDependents — AI experience tool overrides', () => {
    it('flags an override that references the field', () => {
        // The override is an untyped merge over executorConfig, so it is invisible
        // unless scanned separately
        const target = field({ fieldName: 'sku' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({
                    name: 'Catalog Lookup',
                    executorConfig: { idField: 'productId' },
                    overrides: [{ experienceName: 'Support Bot', config: { idField: 'sku' } }],
                })],
            })
        );

        expect(dependents).toHaveLength(1);
        expect(dependents[0].kind).toBe('tool-override');
        expect(dependents[0].label).toContain('Support Bot');
        expect(dependents[0].label).toContain('Catalog Lookup');
    });

    it('ignores a null override config', () => {
        const target = field({ fieldName: 'sku' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                tools: [tool({
                    overrides: [{ experienceName: 'Support Bot', config: null }],
                })],
            })
        );

        expect(dependents).toHaveLength(0);
    });
});

// ============================================================================
// VECTOR SOURCE
// ============================================================================

describe('findFieldDependents — last vector source', () => {
    it('flags the only vector source on a hybrid index', () => {
        const target = field({ fieldName: 'description', isVectorSource: true });

        const { dependents } = findFieldDependents(
            input({ field: target, allFields: [target], searchType: 'hybrid' })
        );

        expect(dependents).toHaveLength(1);
        expect(dependents[0].kind).toBe('last-vector-source');
    });

    it('flags it on a semantic index too', () => {
        const target = field({ fieldName: 'description', isVectorSource: true });

        const { dependents } = findFieldDependents(
            input({ field: target, allFields: [target], searchType: 'semantic' })
        );

        expect(dependents).toHaveLength(1);
    });

    it('does not flag it on a lexical index', () => {
        // No vectors are generated there, so nothing is lost
        const target = field({ fieldName: 'description', isVectorSource: true });

        const { dependents } = findFieldDependents(
            input({ field: target, allFields: [target], searchType: 'lexical' })
        );

        expect(dependents).toHaveLength(0);
    });

    it('does not flag it when another vector source remains', () => {
        const target = field({ fieldName: 'description', isVectorSource: true });
        const other = field({ fieldName: 'summary', isVectorSource: true });

        const { dependents } = findFieldDependents(
            input({ field: target, allFields: [target, other], searchType: 'hybrid' })
        );

        expect(dependents).toHaveLength(0);
    });
});

// ============================================================================
// EXACT MATCHING
// ============================================================================

describe('findFieldDependents — matching is exact', () => {
    it('does not match a field whose name is a prefix of a referenced one', () => {
        // Deleting `price` must not be blocked by a reference to `price_range`
        const target = field({ fieldName: 'price' });

        const { dependents } = findFieldDependents(
            input({
                field: target,
                experiences: [{
                    name: 'Smart Search',
                    displayFields: [{ fieldName: 'price_range', role: 'badge' }],
                }],
                tools: [tool({
                    executorConfig: {
                        idField: 'price_range',
                        includeFields: ['price_range'],
                        defaultSort: [{ field: 'price_range', direction: 'asc' }],
                    },
                })],
            })
        );

        expect(dependents).toHaveLength(0);
    });

    it('returns nothing for a completely unreferenced field', () => {
        const target = field({ fieldName: 'internalNote' });
        const other = field({ fieldName: 'name' });

        const { dependents, warnings } = findFieldDependents(
            input({
                field: target,
                allFields: [target, other],
                experiences: [{
                    name: 'Smart Search',
                    displayFields: [{ fieldName: 'name', role: 'title' }],
                }],
                tools: [tool({ executorConfig: { idField: 'name' } })],
            })
        );

        expect(dependents).toHaveLength(0);
        expect(warnings).toHaveLength(0);
    });
});

// ============================================================================
// ADVISORY WARNINGS
// ============================================================================

describe('findFieldDependents — warnings', () => {
    it('warns about losing filter value mappings', () => {
        const target = field({
            fieldName: 'brand',
            filterValueMappings: { Nike: ['nike', 'NIKE'], Adidas: ['adidas'] },
        });

        const { dependents, warnings } = findFieldDependents(
            input({ field: target, allFields: [target] })
        );

        // Advisory only — must not block
        expect(dependents).toHaveLength(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].detail).toContain('2 curated value aliases');
    });

    it('warns when removing the last autocomplete field, naming the consumers', () => {
        const target = field({ fieldName: 'name', isAutocomplete: true });

        const { dependents, warnings } = findFieldDependents(
            input({
                field: target,
                allFields: [target],
                experiences: [{
                    name: 'Smart Search',
                    displayFields: [],
                    autocompleteEnabled: true,
                }],
            })
        );

        expect(dependents).toHaveLength(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].detail).toContain('Smart Search');
    });

    it('does not warn about autocomplete when another such field remains', () => {
        const target = field({ fieldName: 'name', isAutocomplete: true });
        const other = field({ fieldName: 'brand', isAutocomplete: true });

        const { warnings } = findFieldDependents(
            input({ field: target, allFields: [target, other] })
        );

        expect(warnings).toHaveLength(0);
    });
});
