// src/features/search/filter-value.ts

/**
 * A filter value as the type its field holds. A caller (an AI tool, a saved
 * setting) may send 80 or "80", true or "true"; engines that check value types
 * (Azure AI Search, Sitecore Search) need the one the field holds.
 *
 * @returns a number for a number field, true/false for a boolean field, text for
 *   any other field; undefined when the value can't be the field's type
 */
export function asFieldType(value: unknown, fieldType: string | undefined): string | number | boolean | undefined {
  switch (fieldType) {
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      // Number('') is 0: blank text is no number, not zero
      const s = String(value).trim();
      const n = s === '' ? NaN : Number(s);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const s = String(value).trim().toLowerCase();
      if (s === 'true') return true;
      if (s === 'false') return false;
      return undefined;
    }
    default:
      return String(value);
  }
}
