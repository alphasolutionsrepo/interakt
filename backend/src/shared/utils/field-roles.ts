// src/shared/utils/field-roles.ts

/**
 * Field Role Inference
 *
 * Guesses the semantic role of a field from its name alone — "what is this field
 * for?" rather than "what type does it hold?". Purely name-based on purpose: it
 * runs against indexes that carry no role configuration at all, which is most of
 * them. A null result means "no idea", never "no role".
 *
 * Two consumers, deliberately sharing one vocabulary:
 * - data source schema discovery, which persists the role on DataSourceField and
 *   feeds it into generated tool descriptions
 * - document browse column selection, which uses it to find a title field and to
 *   rank the remaining candidates
 */

/**
 * Semantic role of a field.
 *
 * Kept structurally identical to DataSourceField['role'] (minus the null, which
 * callers add themselves) so the two stay assignable without a cast.
 */
export type FieldRole =
    | 'title'
    | 'description'
    | 'content'
    | 'price'
    | 'image'
    | 'category'
    | 'id'
    | 'url'
    | 'date';

/**
 * Infer a field's semantic role from its name.
 *
 * Exact matches are checked before the substring rule at the end, so a field
 * named `updated_date` resolves to 'date' while `title` never falls through to
 * it. Returns null when the name carries no recognisable signal.
 */
export function inferFieldRole(fieldName: string): FieldRole | null {
    const name = fieldName.toLowerCase();
    if (name === 'title' || name === 'name' || name === 'product_name') return 'title';
    if (name === 'description' || name === 'summary') return 'description';
    if (name === 'content' || name === 'body' || name === 'text') return 'content';
    if (name === 'price' || name === 'cost') return 'price';
    if (name === 'image' || name === 'image_url' || name === 'thumbnail') return 'image';
    if (name === 'category' || name === 'categories') return 'category';
    if (name === 'url' || name === 'link' || name === 'href') return 'url';
    if (name === 'id' || name === 'unique_id') return 'id';
    if (name.includes('date') || name.includes('created') || name.includes('updated')) return 'date';
    return null;
}
