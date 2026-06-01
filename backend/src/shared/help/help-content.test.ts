import { describe, expect, it } from 'vitest';

import { resolveDocLink, resolveHelpForPath } from './help-content';

describe('resolveHelpForPath', () => {
  it('matches the most specific route first', () => {
    expect(resolveHelpForPath('/tools/create')?.doc).toBe('guides/add-tools-to-your-chat');
    expect(resolveHelpForPath('/tools')?.doc).toBe('concepts/tools');
    expect(resolveHelpForPath('/tools/abc123')?.doc).toBe('concepts/tools');
  });

  it('matches dynamic segments via regex routes', () => {
    expect(resolveHelpForPath('/search-indexes/idx-1/upload')?.doc).toBe('guides/bulk-load-data');
    expect(resolveHelpForPath('/search-indexes/idx-1')?.doc).toBe('concepts/search-indexes');
  });

  it('ignores a trailing slash', () => {
    expect(resolveHelpForPath('/tools/create/')?.doc).toBe('guides/add-tools-to-your-chat');
  });

  it('returns null for genuinely unmapped paths', () => {
    expect(resolveHelpForPath('/this-page-does-not-exist')).toBeNull();
    expect(resolveHelpForPath('/foo/bar/baz')).toBeNull();
  });
});

describe('resolveDocLink', () => {
  const from = 'guides/add-tools-to-your-chat';

  it('resolves root-relative links', () => {
    expect(resolveDocLink('/concepts/tools', from)).toBe('concepts/tools');
  });

  it('resolves sibling links relative to the current doc', () => {
    expect(resolveDocLink('create-a-chat-experience', from)).toBe('guides/create-a-chat-experience');
  });

  it('resolves parent-relative links and strips .md / anchors', () => {
    expect(resolveDocLink('../concepts/tools.md', from)).toBe('concepts/tools');
    expect(resolveDocLink('/concepts/tools#types', from)).toBe('concepts/tools');
  });

  it('returns null for external links and bare anchors', () => {
    expect(resolveDocLink('https://example.com', from)).toBeNull();
    expect(resolveDocLink('mailto:a@b.com', from)).toBeNull();
    expect(resolveDocLink('#section', from)).toBeNull();
  });
});
