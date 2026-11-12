// src/shared/seeders/docs/not-found-as-null.ts

/**
 * A lookup that throws its own "not found" error for a missing row answers null for that; any
 * other error (a database that is briefly down) is passed on, so it cannot read as "doesn't
 * exist" and change what the setup builds. The caller names the error class its lookup throws:
 * services have their own.
 */
export async function notFoundAsNull<T>(lookup: Promise<T>, notFound: abstract new (...args: never[]) => Error): Promise<T | null> {
  try {
    return await lookup;
  } catch (e) {
    if (e instanceof notFound) return null;
    throw e;
  }
}
