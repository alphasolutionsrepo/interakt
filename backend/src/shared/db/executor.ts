// src/shared/db/executor.ts

import type { db } from '@/db/index';

/**
 * The database, or a transaction on it: repository functions that take one can run inside a
 * caller's transaction (db.transaction(async (tx) => ...)) or on their own.
 */
export type DbExecutor = Pick<typeof db, 'insert' | 'update' | 'delete' | 'select' | 'query' | 'execute'>;
