// src/features/access/constraint-errors.ts

/**
 * Writes that race another request (two admins creating a role with the same name, a role
 * deleted while someone assigns it) hit a database constraint. Those answer 409 with a plain
 * message instead of a generic 500. Postgres codes: 23505 unique, 23503 foreign key.
 */

import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgCode } from '@/shared/db/pg-error';
import { ConflictError } from '@/shared/errors/app-error';

/** Runs the write; a unique or foreign-key violation becomes a ConflictError with `message`. */
export async function conflictOnConstraint<T>(write: () => Promise<T>, messages: { unique?: string; foreignKey?: string }): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const code = pgCode(error);
    if (code === PG_UNIQUE_VIOLATION && messages.unique) throw new ConflictError(messages.unique);
    if (code === PG_FOREIGN_KEY_VIOLATION && messages.foreignKey) throw new ConflictError(messages.foreignKey);
    throw error;
  }
}
