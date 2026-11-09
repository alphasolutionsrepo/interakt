// src/features/secrets/secret-template.ts

/**
 * The {{secret:name}} template a config uses to pull a value from the vault. One definition:
 * the tool executor fills it in, and the access check (features/access/secret-references.ts)
 * looks for it, so the two can't drift apart.
 */
export const SECRET_TEMPLATE_PATTERN = /\{\{secret:([a-z][a-z0-9_]*)\}\}/g;

/**
 * Config fields whose value is a bare secret name (MCP and data source auth, HTTP tool auth,
 * the web search key). Shared by the delete check (secrets.repository findSecretReferences)
 * and the access check, so both see the same references.
 */
export const SECRET_REFERENCE_FIELDS = ['secretRef', 'valueRef', 'secretName', 'apiKeySecret'] as const;
