// src/features/access/secret-references.test.ts

import { describe, expect, it } from 'vitest';

import { usesSecrets } from './secret-references';

describe('which configs use a vault secret', () => {
  it('finds every form the executors resolve', () => {
    expect(usesSecrets({ authentication: { type: 'header', key: 'X', valueRef: 'k' } })).toBe(true); // HTTP tool
    expect(usesSecrets({ authConfig: { type: 'bearer', secretRef: 'k' } })).toBe(true); // MCP connection
    expect(usesSecrets({ connection: { credentials: { secretRef: 'k' } } })).toBe(true); // external data source
    expect(usesSecrets({ executorConfig: { apiKeySecret: 'tavily_key' } })).toBe(true); // web search tool
    expect(usesSecrets({ headers: { Authorization: 'Bearer {{secret:prod_key}}' } })).toBe(true); // template
    expect(usesSecrets({ steps: [{ body: { token: 'x {{secret:a_b}} y' } }] })).toBe(true); // nested in arrays
  });

  it('ignores configs without one, and empty references', () => {
    expect(usesSecrets({ baseUrl: 'https://x.test', authentication: { type: 'none' } })).toBe(false);
    expect(usesSecrets({ authConfig: { type: 'bearer', secretRef: '  ' } })).toBe(false);
    expect(usesSecrets({ note: 'mentions secretRef and {{secret:}} in text' })).toBe(false);
    expect(usesSecrets(null)).toBe(false);
  });
});
