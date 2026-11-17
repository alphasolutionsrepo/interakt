// src/shared/utils/slug.ts

export const SLUG_MAX_LENGTH = 100;

/**
 * Turn a display name into a URL slug: lowercase letters, digits and single
 * hyphens, with no leading or trailing hyphen. May return '' if the name has
 * no letters or digits.
 */
export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, SLUG_MAX_LENGTH)
    .replace(/-$/, '');
}
