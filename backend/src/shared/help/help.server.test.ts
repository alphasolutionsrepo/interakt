import { describe, expect, it } from 'vitest';

import { readHelpDoc } from './help.server';

describe('readHelpDoc', () => {
  it('reads a real doc, strips frontmatter, and derives the title from the H1', async () => {
    const doc = await readHelpDoc('guides/add-tools-to-your-chat');
    expect(doc).not.toBeNull();
    expect(doc!.title).toBe('Add tools to your chat');
    // Docusaurus frontmatter must be gone; body starts at the H1.
    expect(doc!.content.startsWith('---')).toBe(false);
    expect(doc!.content.startsWith('# Add tools to your chat')).toBe(true);
  });

  it('returns null for a missing doc', async () => {
    expect(await readHelpDoc('guides/does-not-exist')).toBeNull();
  });

  it('rejects path traversal outside the docs root', async () => {
    expect(await readHelpDoc('../../package')).toBeNull();
    expect(await readHelpDoc('../../../etc/passwd')).toBeNull();
  });
});
