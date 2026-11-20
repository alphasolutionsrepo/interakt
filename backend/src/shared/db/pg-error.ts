// src/shared/db/pg-error.ts

/** Postgres error codes this app checks for */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

/** The Postgres error code of a failed query (drizzle may wrap the driver's error as its cause). */
export function pgCode(error: unknown): string | undefined {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}
