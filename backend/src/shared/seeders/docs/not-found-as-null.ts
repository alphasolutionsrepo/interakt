// src/shared/seeders/docs/not-found-as-null.ts

import { NotFoundError } from '@/shared/errors/app-error';

/**
 * A lookup that throws "not found" for a missing row answers null for that; any other error
 * (a database that is briefly down) is passed on, so it cannot read as "doesn't exist" and
 * change what the setup builds.
 */
export async function notFoundAsNull<T>(lookup: Promise<T>): Promise<T | null> {
  try {
    return await lookup;
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}
