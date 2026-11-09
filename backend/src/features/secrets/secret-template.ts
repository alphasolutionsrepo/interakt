// src/features/secrets/secret-template.ts

/**
 * The {{secret:name}} template a config uses to pull a value from the vault. One definition:
 * the tool executor fills it in, and the access check (features/access/secret-references.ts)
 * looks for it, so the two can't drift apart.
 */
export const SECRET_TEMPLATE_PATTERN = /\{\{secret:([a-z][a-z0-9_]*)\}\}/g;
