// src/shared/utils/uuid.ts

/**
 * Whether a value has the shape of a UUID (8-4-4-4-12 hex digits), the shape Postgres
 * accepts for a uuid column. Check a value from a request with this before comparing it
 * with such a column: Postgres refuses the query for anything else.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidShape(value: string): boolean {
    return UUID_SHAPE.test(value);
}
