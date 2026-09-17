// src/features/search-experience/query-interpreter.core.ts

/**
 * Query Interpreter — pure core
 *
 * Turns a typed search phrase into a cleaned query plus structured filters:
 *
 *   "show only items from the men T-shirt below $110"
 *     → query "t-shirt", filters gender=Men, minPrice<=110
 *
 *   "pants with more than 80% cotton"
 *     → query "pants", filters: none (material is a text field enumerating whole
 *       composition sentences like "97% cotton, 3% elastane", not a numeric percentage
 *       — there is no field to bind ">80%" to, so the comparison stays in the query text
 *       rather than becoming a false `material` filter snapped to the nearest value)
 *
 * Without this, a search box can only ever match those words as text — "$110" is
 * a token to match, not a number to compare — so a price or gender phrase silently
 * does nothing.
 *
 * Everything here is pure: prompt construction, response parsing, and the decision
 * of whether a query is even worth interpreting. The LLM call, caching and field
 * loading live in query-interpreter.ts so this half can be tested directly.
 */

import type { FieldConstraint, ParameterContext } from '@/features/pipeline/v2/parameter-context.types';

// ============================================================================
// TYPES
// ============================================================================

export interface InterpretedFilter {
    field: string;
    operator: string;
    value: unknown;
}

export interface ParsedInterpretation {
    query: string;
    filters: InterpretedFilter[];
}

/** Operators the interpreter may emit, mirroring the search filter contract. */
export const INTERPRETER_OPERATORS = [
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains',
] as const;

/**
 * Match-all sentinel for a query whose every term became a filter.
 *
 * Both providers understand it: the Elasticsearch builder short-circuits '' and
 * '*' to match_all, and Azure passes it through as searchText. An empty string
 * cannot be used instead — parseInterpretation has to distinguish "the model
 * returned nothing" from "there is deliberately nothing left to match".
 */
export const MATCH_ALL_QUERY = '*';

// ============================================================================
// GATING
// ============================================================================

/**
 * Whether a query is worth an LLM round trip.
 *
 * A one- or two-word lookup ("sweatshirt") has no filters to find, and paying for
 * a model call on every keystroke of a type-ahead box is the fastest way to make
 * search feel slow and cost real money.
 */
export function shouldInterpret(query: string, minWords: number): boolean {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (words.length >= minWords) {
        return true;
    }
    // A short query can still carry a constraint worth extracting — "under $50",
    // "over 4 stars" — so look for comparison language before giving up.
    return /\d/.test(query) && /\b(under|below|over|above|less|more|cheaper|max|min)\b/i.test(query);
}

// ============================================================================
// PROMPT
// ============================================================================

/**
 * Describe the filterable fields, and for text fields the values that actually
 * exist, so the model picks a real field with a real value rather than inventing
 * `color=navy` for an index whose values are `Navy Blue`.
 */
function describeFields(constraints: Record<string, FieldConstraint>): string {
    const lines: string[] = [];

    for (const c of Object.values(constraints)) {
        if (!c.isFilterable) continue;

        const values = c.validValues.length > 0
            ? ` — valid values: ${c.validValues.slice(0, 40).map(v => `"${v}"`).join(', ')}`
              + (c.validValues.length > 40 ? ', …' : '')
            : '';
        lines.push(`- ${c.fieldName} (${c.fieldType})${values}`);
    }

    return lines.join('\n');
}

/**
 * Build the interpreter instructions.
 *
 * The range guidance is the part that matters most on a product catalogue: a
 * min/max price pair describes one item's span, so "under $X" has to filter the
 * lower bound. Filtering the upper bound demands that every variant is under $X
 * and returns almost nothing.
 */
export function buildInterpreterPrompt(
    constraints: Record<string, FieldConstraint>,
    customInstructions?: string,
): string {
    let prompt = `You convert a shopper's search phrase into a search query plus structured filters.

## Filterable fields
${describeFields(constraints)}

## Rules
1. **query** — keep only the descriptive terms that say what the user is looking for
   (product type and qualifiers such as "waterproof", "leather", "long sleeve").
   Strip filler like "show me", "only", "items from", "I want".
2. **filters** — move structured attributes to filters: gender, brand, category,
   colour, size, price, rating. Only ever use a field listed above, and for a field
   with valid values listed, use one of those values exactly.
3. This applies **only to fields that have valid values listed**. If a value the user
   asked for is not among a listed field's values, leave it in the query instead of
   inventing a filter. A field shown with no values is not enumerable — that is not a
   reason to skip filtering it; see rule 4.
4. **Exact identifiers** — SKUs, product, part, model and item numbers, and similar
   codes are filters, not search terms. Such a field is high-cardinality (every
   document has its own value), so its values cannot be listed for you above. Match
   the code to the field whose name says what it is — sku, partNumber, itemNumber,
   id — and emit an eq filter with the value exactly as the user wrote it, keeping
   case, digits and hyphens.
   - "What's the price of SKU 08011-M?" → query "*", filters [sku eq "08011-M"]
   - Leaving the code in the query text instead usually returns nothing useful: these
     fields match a value exactly, not a sentence that happens to contain it.
   - Only do this when the phrase really carries an identifier. An ordinary product
     name or descriptive word is not a code.
5. **When every meaningful term became a filter, the query is "\*"** — never an empty
   string, and never a leftover word like "price" or "cost". The query and the filters
   are ANDed, so a leftover word must also be found in the document's text: asking for
   "price" excludes the very product the identifier just selected, because product text
   rarely contains the word "price". "\*" means match everything and let the filters
   decide.
6. Use numbers for numeric fields — 110, not "$110" and not "110".
7. **Paired range fields (e.g. minPrice/maxPrice)** describe ONE item's range across
   its variants — they are not two prices to choose between. minPrice is the cheapest
   variant, maxPrice the dearest.
   - "under $X" / "below $X" / "cheaper than $X" → minPrice <= X.
     The shopper wants something buyable for under $X, so one qualifying variant is enough.
     Filtering maxPrice <= X demands EVERY variant is under $X and returns almost nothing.
   - "over $X" / "above $X" → maxPrice >= X.
   - "between $X and $Y" → minPrice <= Y and maxPrice >= X.
   - If only one of the pair is filterable, use that one rather than skipping the filter.
8. If the phrase carries no structured constraint at all, return it as the query with
   an empty filters array. Do not force a filter that was not asked for.
9. Comparison language ("more than", "at least", "over", "under", "at most", "below")
   states a numeric threshold. Only turn it into a gt/gte/lt/lte filter on a field
   that is genuinely numeric. Never snap it onto a text field's valid-value list by
   picking the closest-sounding entry — e.g. "more than 80% cotton" against a
   material field whose values are whole composition sentences ("97% cotton, 3%
   elastane") is not the same claim as "material is 100% cotton", and forcing that
   match changes what the shopper asked for. When no field can express the
   threshold, leave that part of the phrase in the query instead.`;

    if (customInstructions) {
        prompt += `\n\n## Additional instructions\n${customInstructions}`;
    }

    return prompt;
}

/** JSON schema for the model's structured response. */
export const INTERPRETER_SCHEMA = {
    type: 'object',
    properties: {
        query: {
            type: 'string',
            description: 'The descriptive search terms, with filter attributes removed',
        },
        filters: {
            type: 'array',
            description: 'Structured constraints extracted from the phrase',
            items: {
                type: 'object',
                properties: {
                    field: { type: 'string' },
                    operator: { type: 'string', enum: [...INTERPRETER_OPERATORS] },
                    value: {
                        type: ['string', 'number', 'boolean'],
                        description: 'Numbers for numeric fields, not strings',
                    },
                },
                required: ['field', 'operator', 'value'],
                additionalProperties: false,
            },
        },
    },
    required: ['query', 'filters'],
    additionalProperties: false,
} as const;

// ============================================================================
// PARSING
// ============================================================================

/**
 * Parse the model's reply into an interpretation.
 *
 * Returns null on anything unexpected. The caller falls back to the raw query, so
 * a bad interpretation degrades to ordinary search rather than breaking it.
 */
export function parseInterpretation(
    content: string,
    originalQuery: string,
): ParsedInterpretation | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return null;
    }

    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    const raw = parsed as { query?: unknown; filters?: unknown };

    const filters: InterpretedFilter[] = Array.isArray(raw.filters)
        ? raw.filters.flatMap(entry => {
            if (!entry || typeof entry !== 'object') return [];
            const f = entry as { field?: unknown; operator?: unknown; value?: unknown };
            if (typeof f.field !== 'string' || typeof f.operator !== 'string') return [];
            if (!(INTERPRETER_OPERATORS as readonly string[]).includes(f.operator)) return [];
            if (f.value === null || f.value === undefined) return [];
            return [{ field: f.field, operator: f.operator, value: coerceValue(f.value) }];
        })
        : [];

    // What an empty query should fall back to depends on whether anything was
    // extracted. With filters, the phrase has been fully converted and MATCH_ALL
    // lets them decide — restoring the original sentence would AND its words back
    // in and exclude the very document the filters selected. With no filters
    // there is nothing to narrow on, so match-all would return the whole index;
    // the original phrase is the safer floor.
    const query = typeof raw.query === 'string' && raw.query.trim().length > 0
        ? raw.query.trim()
        : filters.length > 0
            ? MATCH_ALL_QUERY
            : originalQuery;

    return { query, filters };
}

/**
 * Coerce a numeric-looking string to a number.
 *
 * Models return "110" or "$110" despite being told not to, and a string where a
 * range query expects a number produces a filter that matches nothing.
 */
function coerceValue(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }
    const stripped = value.replace(/[$€£,]/g, '').trim();
    if (stripped !== '' && !Number.isNaN(Number(stripped))) {
        return Number(stripped);
    }
    return value;
}

// ============================================================================
// CONTEXT ASSEMBLY
// ============================================================================

/** Wrap field constraints in the shape param-validation expects. */
export function toParameterContext(
    constraints: Record<string, FieldConstraint>,
): ParameterContext {
    const count = Object.keys(constraints).length;
    return {
        fieldConstraints: constraints,
        enriched: count > 0,
        summary: `${count} filterable field(s)`,
        durationMs: 0,
    };
}
