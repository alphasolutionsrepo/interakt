import { describe, expect, it } from 'vitest';

import { buildDocsSearchRecords } from './docs-search-records';

describe('buildDocsSearchRecords', () => {
  const docs = [
    {
      slug: 'concepts/search-experiences',
      title: 'Search `experiences`',
      content: '# Search `experiences`\nWhat they are.\n## Step 1 — Basic info\nName and slug.',
    },
    { slug: 'intro', title: 'Intro', content: '# Intro\nWelcome.' },
    { slug: 'index', title: 'Docs', content: '# Docs\nLanding.' },
  ];

  it('makes one record per section with links, groups and engine-safe ids', () => {
    const records = buildDocsSearchRecords(docs);
    expect(records).toEqual([
      {
        id: 'concepts_search-experiences',
        docTitle: 'Search experiences',
        content: 'What they are.',
        group: 'Concepts',
        slug: 'concepts/search-experiences',
        url: '/docs/concepts/search-experiences',
      },
      {
        id: 'concepts_search-experiences-step-1--basic-info',
        docTitle: 'Search experiences',
        section: 'Step 1 — Basic info',
        content: 'Name and slug.',
        group: 'Concepts',
        slug: 'concepts/search-experiences',
        anchor: 'step-1--basic-info',
        url: '/docs/concepts/search-experiences#step-1--basic-info',
      },
      { id: 'intro', docTitle: 'Intro', content: 'Welcome.', group: 'Overview', slug: 'intro', url: '/docs/intro' },
      { id: 'index', docTitle: 'Docs', content: 'Landing.', group: 'Overview', slug: 'index', url: '/docs' },
    ]);
    for (const r of records) expect(r.id).toMatch(/^[A-Za-z0-9_=-]+$/);
  });
});
