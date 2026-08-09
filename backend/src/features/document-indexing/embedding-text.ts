// src/features/document-indexing/embedding-text.ts

/**
 * Embedding Text Construction
 *
 * Builds the text that gets sent to the embedding model for a document.
 *
 * The text is assembled from the fields marked `isVectorSource`, and three
 * decisions shape how well the resulting vector works:
 *
 * 1. **Fields are labelled.** A bare `"camel"` or `"Adult"` in a blob of
 *    fragments is semantic mush — "camel" reads as the animal. `Colour: camel`
 *    tells the model what it is looking at.
 * 2. **Order follows configured importance, not the alphabet.** Embedding models
 *    weight earlier tokens more heavily, so the fields the operator boosted for
 *    search lead. Sorting by field name buried the product name in the middle of
 *    the text.
 * 3. **Empty parts are dropped entirely.** An array that filters to nothing used
 *    to contribute a blank separator, so documents began with stray whitespace.
 *
 * Kept free of db/provider imports so it can be tested directly and reused by
 * the preview endpoint.
 */

import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Why a vector-source field contributed nothing to the text.
 *
 * The three are distinct problems with distinct fixes, so they are reported
 * separately rather than lumped together:
 * - `missing` — the source data has no value here; fix the ingest or the mapping
 * - `empty` — a value exists but is blank, e.g. `[]` or `"  "`
 * - `unsupported-type` — an object or list of objects, which cannot be embedded
 *   at all; that field will never contribute, on any document
 */
export type EmbeddingPartExclusion = 'missing' | 'empty' | 'unsupported-type';

export interface EmbeddingTextPart {
    fieldName: string;
    /** Human label used as the prefix in the text. */
    label: string;
    /** The rendered `Label: value` line, or '' when excluded. */
    text: string;
    included: boolean;
    /** Present only when `included` is false. */
    excludedBecause?: EmbeddingPartExclusion;
}

export interface EmbeddingPreview {
    /** Exactly the string handed to the embedding model. */
    text: string;
    totalChars: number;
    /** Every vector-source field, in the order it is considered. */
    parts: EmbeddingTextPart[];
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Order fields by how much they matter, most important first.
 *
 * `boostValue` is the operator's existing statement of field importance for
 * search, so it is reused here rather than inventing a second ranking to keep in
 * sync. Ties break on field name so the output is stable across runs.
 */
function byImportance(a: SearchIndexField, b: SearchIndexField): number {
    const boostDelta = (b.boostValue ?? 1) - (a.boostValue ?? 1);
    return boostDelta !== 0 ? boostDelta : a.fieldName.localeCompare(b.fieldName);
}

/** A rendered value, or the reason there isn't one. */
type RenderResult =
    | { kind: 'value'; text: string }
    | { kind: 'excluded'; reason: EmbeddingPartExclusion };

/**
 * Render a single field value as the text after its label.
 *
 * Distinguishes carefully between a field that is absent, one that is present
 * but blank, and one whose type can never be embedded — a field reported as the
 * wrong type when it is merely null sends whoever is debugging after the wrong
 * problem entirely.
 *
 * Numbers and booleans are included because the label gives them meaning:
 * `In stock: yes` is a phrase the model can use, where a bare `true` is not.
 */
function renderValue(value: unknown): RenderResult {
    if (value === null || value === undefined) {
        return { kind: 'excluded', reason: 'missing' };
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0
            ? { kind: 'value', text: trimmed }
            : { kind: 'excluded', reason: 'empty' };
    }
    if (typeof value === 'number') {
        // NaN/Infinity would embed as literal "NaN", which is worse than nothing.
        return Number.isFinite(value)
            ? { kind: 'value', text: String(value) }
            : { kind: 'excluded', reason: 'empty' };
    }
    if (typeof value === 'boolean') {
        return { kind: 'value', text: value ? 'yes' : 'no' };
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return { kind: 'excluded', reason: 'empty' };
        }
        // Comma-separated reads as a list; space-joined ran the values together.
        const primitives = value
            .filter(entry => typeof entry === 'string' || typeof entry === 'number')
            .map(entry => String(entry).trim())
            .filter(entry => entry.length > 0);

        if (primitives.length > 0) {
            return { kind: 'value', text: primitives.join(', ') };
        }
        // Held entries, but none embeddable — a variants list of objects. That is
        // a property of the field, not of this document.
        return { kind: 'excluded', reason: 'unsupported-type' };
    }
    // Plain object.
    return { kind: 'excluded', reason: 'unsupported-type' };
}

/**
 * Build the embedding text for a document, with a per-field breakdown.
 *
 * The breakdown exists so the admin UI can show exactly what was embedded and,
 * just as usefully, what was not — a field silently contributing nothing is the
 * kind of thing that quietly ruins semantic search.
 *
 * @param document - The transformed (post-mapping) document
 * @param vectorSourceFields - Fields with isVectorSource = true
 */
export function buildEmbeddingPreview(
    document: Record<string, unknown>,
    vectorSourceFields: SearchIndexField[]
): EmbeddingPreview {
    const parts: EmbeddingTextPart[] = [];

    for (const field of [...vectorSourceFields].sort(byImportance)) {
        const label = field.displayName || field.fieldName;
        const rendered = renderValue(document[field.fieldName]);

        if (rendered.kind === 'excluded') {
            parts.push({
                fieldName: field.fieldName,
                label,
                text: '',
                included: false,
                excludedBecause: rendered.reason,
            });
            continue;
        }

        parts.push({
            fieldName: field.fieldName,
            label,
            text: `${label}: ${rendered.text}`,
            included: true,
        });
    }

    const text = parts
        .filter(part => part.included)
        .map(part => part.text)
        .join('\n');

    return { text, totalChars: text.length, parts };
}

/**
 * The text sent to the embedding model for a document.
 *
 * Thin wrapper over buildEmbeddingPreview so the preview shown in the admin UI
 * can never drift from what is actually embedded.
 */
export function getEmbeddingText(
    document: Record<string, unknown>,
    vectorSourceFields: SearchIndexField[]
): string {
    return buildEmbeddingPreview(document, vectorSourceFields).text;
}
