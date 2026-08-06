// src/features/document-indexing/document-columns.ts

/**
 * Document Display Columns
 *
 * Chooses a compact set of columns for summarising a document in a table.
 *
 * Indexes have wildly different schemas — the only field every index shares is
 * the document key — so there is no fixed column set that works everywhere. What
 * every index does have is field metadata: a declared type, whether the field is
 * facetable, searchable, a vector source. That is enough to derive good columns
 * without asking anyone to configure anything.
 *
 * Kept free of db/provider imports so it can be tested directly, the same way
 * field-dependents.ts is.
 */

import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import { buildBrowsableFields } from '@/features/search/search-context.builder';
import type { FieldType } from '@/shared/constants/field-types';
import { inferFieldRole } from '@/shared/utils/field-roles';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Attribute columns between the title and the timestamp.
 *
 * The full budget is key + title + attributes + timestamp = 6 columns, which is
 * about as wide as the table stays readable at.
 */
export const MAX_ATTRIBUTE_COLUMNS = 3;

/** Field the document key is mapped from. */
export const DOCUMENT_KEY_FIELD = 'uniqueId';

/**
 * Reserved timestamp field names, in the order they are preferred for the last
 * column. Only one is ever shown.
 */
const TIMESTAMP_FIELD_PREFERENCE = ['updatedAt', 'createdAt'] as const;

/**
 * Whether a field is the index's last-changed / first-seen timestamp.
 *
 * Matched by name, not by mapping mode. `createdAt`/`updatedAt` are reserved
 * system field names, but how they are configured varies across real indexes —
 * some carry mode 'generated', others mode 'source' with a timestamp generator —
 * and either way the column belongs pinned at the end rather than competing for
 * an attribute slot.
 */
function isTimestampColumn(field: SearchIndexField): boolean {
    return (TIMESTAMP_FIELD_PREFERENCE as readonly string[]).includes(field.fieldName);
}

/**
 * The dense vector field. Duplicated from document-indexer.service rather than
 * imported, because that module pulls in the db and the AI service and this one
 * is deliberately dependency-free.
 */
const EMBEDDING_FIELD = 'content_embedding';

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentColumn {
    field: string;
    label: string;
    /**
     * Declared field type, so a client can render the cell according to what it
     * holds rather than stringifying everything. The key column reports 'id':
     * it is the provider's document key, which has no field row of its own when
     * the index does not define uniqueId.
     */
    type: FieldType | 'id';
}

// ============================================================================
// SELECTION
// ============================================================================

/**
 * Score a field on how well it works as a table column.
 *
 * The question is not "is this field important?" but "does this field fit in a
 * cell?" — a keyword status renders as one glanceable token, a JSON blob renders
 * as unreadable noise no matter how important it is. Facetability is a strong
 * signal here for free: a field worth faceting is a field with few distinct
 * values, which is exactly what makes a column scannable.
 *
 * Roles come from the field name (see inferFieldRole) so an index with no display
 * configuration at all still gets sensible picks.
 */
export function scoreColumnCandidate(field: SearchIndexField): number {
    let score = 0;

    switch (field.fieldType as FieldType) {
        case 'keyword':
            score += 30;
            break;
        case 'boolean':
        case 'number':
        case 'date':
        case 'datetime':
            score += 25;
            break;
        case 'url':
        case 'email':
            score += 20;
            break;
        case 'image_url':
            score += 5;
            break;
        case 'text':
            // Analyzed prose: could be a short heading, could be three
            // paragraphs. Not worth a column unless nothing better exists.
            score -= 10;
            break;
        case 'array':
            score -= 20;
            break;
        case 'json':
            score -= 40;
            break;
    }

    if (field.isFacetable) {
        score += 15;
    }

    // additionalData / customFields are catch-all blobs by design.
    if (field.isSystemField) {
        score -= 30;
    }

    switch (inferFieldRole(field.fieldName)) {
        case 'category':
        case 'price':
            score += 40;
            break;
        case 'date':
        case 'url':
            score += 20;
            break;
    }

    return score;
}

/**
 * Pick the field that best identifies a document to a human.
 *
 * Prefers an explicit title-ish name, and falls back to the first searchable
 * short-text field — on an index with no `title` at all, a field someone chose to
 * make searchable is the closest thing to a label available.
 */
function pickTitleField(candidates: SearchIndexField[]): SearchIndexField | undefined {
    const titled = candidates.find(f => inferFieldRole(f.fieldName) === 'title');
    if (titled) {
        return titled;
    }
    return candidates.find(f =>
        f.isSearchable && (f.fieldType === 'text' || f.fieldType === 'keyword')
    );
}

/**
 * Pick a compact set of fields for summarising a document in a table.
 *
 * Columns are laid out as identity → detail → recency, so a row reads
 * left-to-right: which document is this, what is it, when did it last change.
 *
 * Candidates come from buildBrowsableFields(), which applies the same
 * retrievability filter as search (includeInResponse && isIndexed &&
 * hasDataAvailable && !isEmptySystemField). That filter matters beyond tidiness:
 * Azure's `select` throws on a field the index does not actually have.
 *
 * Vector-source fields are excluded outright — they hold the long prose that was
 * embedded, which makes a table unreadable regardless of how it scores.
 *
 * @param fields - Every field defined for the index
 * @param options.includeTimestamps - Admit generated createdAt/updatedAt. Off by
 *   default because a field row in Postgres is no proof the provider mapping has
 *   the field; the caller decides whether the index is in sync enough to ask.
 */
export function resolveDisplayColumns(
    fields: SearchIndexField[],
    options: { includeTimestamps?: boolean } = {}
): DocumentColumn[] {
    const includeTimestamps = options.includeTimestamps ?? false;

    const toColumn = (field: SearchIndexField): DocumentColumn => ({
        field: field.fieldName,
        label: field.displayName || field.fieldName,
        type: field.fieldType as FieldType,
    });

    const keyField = fields.find(f => f.fieldName === DOCUMENT_KEY_FIELD);

    // The key column always leads, and is always present even when the index has
    // no mapped uniqueId field — the provider returns a document key regardless,
    // and without it a table row has nothing to act on. Callers rely on this
    // position: columns[0] is the document id.
    const columns: DocumentColumn[] = [{
        field: DOCUMENT_KEY_FIELD,
        label: keyField?.displayName || 'ID',
        type: 'id',
    }];

    const browsable = buildBrowsableFields(fields, {
        includeGeneratedTimestamps: includeTimestamps,
    });

    const timestampFields = browsable.filter(isTimestampColumn);

    const candidates = browsable.filter(field =>
        field.fieldName !== DOCUMENT_KEY_FIELD
        && field.fieldName !== EMBEDDING_FIELD
        && !field.isVectorSource
        && !isTimestampColumn(field)
    );

    const titleField = pickTitleField(candidates);
    if (titleField) {
        columns.push(toColumn(titleField));
    }

    // Sort a copy: `candidates` order is the field definition order, which is the
    // tiebreak that keeps this selection stable across calls.
    const ranked = candidates
        .filter(field => field.fieldName !== titleField?.fieldName)
        .map((field, position) => ({ field, position, score: scoreColumnCandidate(field) }))
        .sort((a, b) => b.score - a.score || a.position - b.position);

    for (const { field } of ranked.slice(0, MAX_ATTRIBUTE_COLUMNS)) {
        columns.push(toColumn(field));
    }

    // Recency last, so the eye lands on it after the identifying columns.
    for (const fieldName of TIMESTAMP_FIELD_PREFERENCE) {
        const timestamp = timestampFields.find(f => f.fieldName === fieldName);
        if (timestamp) {
            columns.push(toColumn(timestamp));
            break;
        }
    }

    return columns;
}

/**
 * Narrow display columns to field names the index actually has.
 *
 * The key column can be synthetic (see resolveDisplayColumns), and Azure's
 * `select` throws on a field the index does not define — so the list handed to a
 * provider has to be filtered even though the column list is not.
 */
export function toProviderFields(
    columns: DocumentColumn[],
    fields: SearchIndexField[]
): string[] {
    const known = new Set(fields.map(f => f.fieldName));
    return columns.map(c => c.field).filter(field => known.has(field));
}
