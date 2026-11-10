// src/features/access/redact.ts

/** A copy of `value` without the given keys, at any depth (dates kept as they are). */
export function withoutFields<T>(value: T, keys: ReadonlySet<string>): T {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).filter(([k]) => !keys.has(k)).map(([k, x]) => [k, strip(x)]),
      );
    }
    return v;
  };
  return strip(value) as T;
}
