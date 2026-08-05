// src/features/search-index/field-dependents.ts

/**
 * Field Dependents
 *
 * Works out what would break if a given index field were deleted.
 *
 * Deliberately pure — it takes already-loaded rows and returns findings, with no
 * DB access — because the interesting part is the matching, and matching is what
 * needs to be exhaustively tested. The gathering lives in
 * field-dependents.repository.ts.
 *
 * The reason this file is as long as it is: **the same relationship is spelled
 * five different ways across the schema.** A field name is referenced as
 * `fieldName` (search experience display), `source` (tool display), `field`
 * (filters and sort), and `idField`/`defaultField` (executor configs) — plus
 * bare `string[]` projection lists. Nothing validates any of them today, which
 * is precisely why they drift.
 */

import 'server-only';

import { getFieldMappingConfig } from '@/shared/constants/search-index.constants';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';

// ============================================================================
// TYPES
// ============================================================================

export type FieldDependentKind =
    | 'field-reference'
    | 'experience-display'
    | 'tool-display'
    | 'tool-executor'
    | 'tool-override'
    | 'last-vector-source';

export interface FieldDependent {
    kind: FieldDependentKind;
    /** Human-readable owner, e.g. 'Search experience "Smart Search"' */
    label: string;
    /** What it does with the field, e.g. 'uses it as the title' */
    detail: string;
}

/**
 * A non-blocking consequence — the delete proceeds, but the user should know.
 */
export interface FieldDeletionWarning {
    label: string;
    detail: string;
}

/** Minimal shapes so callers need not pass whole DB rows. */
export interface DependentExperience {
    name: string;
    displayFields: Array<{ fieldName: string; role?: string }>;
    autocompleteEnabled?: boolean;
}

export interface DependentTool {
    name: string;
    displayFields: Array<{ source: string; role?: string }>;
    /** Raw executor config JSON — scanned by key, not by type (see below) */
    executorConfig: Record<string, unknown> | null;
    /** AI-experience overrides of this tool's executor config, by experience name */
    overrides: Array<{ experienceName: string; config: Record<string, unknown> | null }>;
}

export interface FieldDependentsInput {
    /** The field being deleted */
    field: SearchIndexField;
    /** Every field in the same index, including the one being deleted */
    allFields: SearchIndexField[];
    /** The index's configured search type */
    searchType: string;
    experiences: DependentExperience[];
    tools: DependentTool[];
}

export interface FieldDependentsResult {
    /** Must be empty for the delete to proceed */
    dependents: FieldDependent[];
    /** Advisory only */
    warnings: FieldDeletionWarning[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Search types whose retrieval depends on having a vector source. */
const VECTOR_SEARCH_TYPES = new Set(['semantic', 'hybrid']);

/**
 * Executor-config keys that hold a single field name.
 *
 * `idField` is required by the lookup executor, so losing it breaks every
 * document lookup that tool performs.
 */
const SINGLE_FIELD_KEYS = ['idField', 'defaultField'] as const;

/** Executor-config keys holding `Array<{ field: string }>`. */
const CLAUSE_ARRAY_KEYS = ['defaultSort', 'defaultFilters'] as const;

/**
 * Executor-config keys holding a bare `string[]` of field names.
 *
 * `responseFields` is not declared on the schema's ExecutorConfig union but is
 * read by the search executor, which is why this scan works off raw JSON keys
 * rather than the TypeScript type.
 */
const FIELD_LIST_KEYS = ['includeFields', 'excludeFields', 'responseFields'] as const;

// ============================================================================
// EXECUTOR CONFIG SCANNING
// ============================================================================

/**
 * Describe every way an executor config references a field name.
 *
 * Returns one human-readable phrase per hit, e.g. `the document ID field
 * (idField)`. Empty when the config does not mention the field.
 */
function describeExecutorConfigUses(
    config: Record<string, unknown> | null,
    fieldName: string
): string[] {
    if (!config) {
        return [];
    }

    const uses: string[] = [];

    for (const key of SINGLE_FIELD_KEYS) {
        if (config[key] === fieldName) {
            uses.push(
                key === 'idField'
                    ? 'the document ID field (idField)'
                    : `${key}`
            );
        }
    }

    for (const key of CLAUSE_ARRAY_KEYS) {
        const clauses = config[key];
        if (!Array.isArray(clauses)) continue;

        const hit = clauses.some(
            clause =>
                !!clause
                && typeof clause === 'object'
                && (clause as { field?: unknown }).field === fieldName
        );
        if (hit) {
            uses.push(key === 'defaultSort' ? 'its default sort' : 'its default filters');
        }
    }

    for (const key of FIELD_LIST_KEYS) {
        const list = config[key];
        if (Array.isArray(list) && list.includes(fieldName)) {
            uses.push(key);
        }
    }

    return uses;
}

// ============================================================================
// MATCHER
// ============================================================================

/**
 * Find everything that depends on a field, and everything worth warning about.
 *
 * Matching is always on exact field-name equality — never substring — so
 * deleting `price` is not blocked by a reference to `price_range`.
 */
export function findFieldDependents(input: FieldDependentsInput): FieldDependentsResult {
    const { field, allFields, searchType, experiences, tools } = input;
    const fieldName = field.fieldName;

    const dependents: FieldDependent[] = [];
    const warnings: FieldDeletionWarning[] = [];

    // ── Another field in this index using it as its source ──────────────────
    // Mapping mode 'reference' copies another field's source path. This is how
    // uniqueId is commonly wired to a business key such as productId, so a
    // dangling reference here can break document IDs for the whole index.
    for (const other of allFields) {
        if (other.id === field.id) continue;

        const config = getFieldMappingConfig(other.transformConfig);
        if (config.sourceFromField !== fieldName) continue;

        const isKeyField = other.fieldName === 'uniqueId';
        dependents.push({
            kind: 'field-reference',
            label: `Field "${other.fieldName}"`,
            detail: isKeyField
                ? 'uses it as its source (mapping mode: Reference) — deleting it would break document IDs for this index'
                : 'uses it as its source (mapping mode: Reference)',
        });
    }

    // ── Search experience display configuration ─────────────────────────────
    for (const experience of experiences) {
        const roles = experience.displayFields
            .filter(displayField => displayField.fieldName === fieldName)
            .map(displayField => displayField.role)
            .filter((role): role is string => !!role);

        if (roles.length === 0) continue;

        dependents.push({
            kind: 'experience-display',
            label: `Search experience "${experience.name}"`,
            detail: roles.length > 0
                ? `displays it as ${roles.join(', ')}`
                : 'displays it in search results',
        });
    }

    // ── Tools ───────────────────────────────────────────────────────────────
    for (const tool of tools) {
        const displayRoles = tool.displayFields
            .filter(displayField => displayField.source === fieldName)
            .map(displayField => displayField.role)
            .filter((role): role is string => !!role);

        if (displayRoles.length > 0) {
            dependents.push({
                kind: 'tool-display',
                label: `Tool "${tool.name}"`,
                detail: `renders it as ${displayRoles.join(', ')}`,
            });
        }

        const executorUses = describeExecutorConfigUses(tool.executorConfig, fieldName);
        if (executorUses.length > 0) {
            dependents.push({
                kind: 'tool-executor',
                label: `Tool "${tool.name}"`,
                detail: `uses it for ${executorUses.join(', ')}`,
            });
        }

        // AI experiences can override a tool's executor config, and the override
        // is an untyped merge — so the same keys have to be scanned again here or
        // the reference is invisible.
        for (const override of tool.overrides) {
            const overrideUses = describeExecutorConfigUses(override.config, fieldName);
            if (overrideUses.length === 0) continue;

            dependents.push({
                kind: 'tool-override',
                label: `AI experience "${override.experienceName}" (tool "${tool.name}")`,
                detail: `overrides its config to use it for ${overrideUses.join(', ')}`,
            });
        }
    }

    // ── Last remaining vector source on a semantic/hybrid index ─────────────
    // Not a name reference, but deleting it stops embeddings being generated at
    // all, which silently removes every document from semantic retrieval.
    if (field.isVectorSource && VECTOR_SEARCH_TYPES.has(searchType)) {
        const otherVectorSources = allFields.filter(
            other => other.id !== field.id && other.isVectorSource
        );

        if (otherVectorSources.length === 0) {
            dependents.push({
                kind: 'last-vector-source',
                label: `This ${searchType} index`,
                detail: 'has no other vector source field — deleting it would stop embeddings being generated, removing every document from semantic search',
            });
        }
    }

    // ── Advisory warnings ───────────────────────────────────────────────────
    const filterValueMappings = field.filterValueMappings ?? {};
    const mappedValueCount = Object.keys(filterValueMappings).length;
    if (mappedValueCount > 0) {
        warnings.push({
            label: 'Filter value mappings will be lost',
            detail: `${mappedValueCount} curated value ${mappedValueCount === 1 ? 'alias' : 'aliases'} on this field cannot be recovered after deletion.`,
        });
    }

    if (field.isAutocomplete) {
        const otherAutocomplete = allFields.filter(
            other => other.id !== field.id && other.isAutocomplete
        );
        if (otherAutocomplete.length === 0) {
            const consumers = experiences.filter(experience => experience.autocompleteEnabled);
            warnings.push({
                label: 'This is the last autocomplete field',
                detail: consumers.length > 0
                    ? `Autocomplete will stop returning suggestions for: ${consumers.map(c => c.name).join(', ')}.`
                    : 'Autocomplete will stop returning suggestions for this index.',
            });
        }
    }

    return { dependents, warnings };
}
