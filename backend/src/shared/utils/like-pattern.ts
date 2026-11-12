// src/shared/utils/like-pattern.ts

/**
 * Escape special SQL LIKE pattern characters in user input.
 *
 * Postgres LIKE/ILIKE uses backslash as the default escape character, so the
 * backslash itself must be escaped first: otherwise user input containing a
 * '\' produces a dangling escape sequence (malformed pattern / wrong matches).
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}
