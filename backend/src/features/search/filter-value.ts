// src/features/search/filter-value.ts

/** A number as JSON writes it (RFC 8259): no hex, binary or octal, no leading '+' or zeros. */
const JSON_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * A filter value as the type its field holds. A caller (an AI tool, a saved
 * setting) may send 80 or "80", true or "true"; engines that check value types
 * (Azure AI Search, Sitecore Search) need the one the field holds.
 *
 * @returns a number for a number field, true/false for a boolean field, text for
 *   any other field; undefined when the value can't be the field's type, or
 *   isn't a single text, number or true/false value (null, a list, an object)
 */
export function asFieldType(value: unknown, fieldType: string | undefined): string | number | boolean | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return undefined;
  switch (fieldType) {
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      // Text must be a JSON number: Number() alone reads '' as 0 and '0x7E8' as 2024
      const s = String(value).trim();
      const n = JSON_NUMBER.test(s) ? Number(s) : NaN;
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
