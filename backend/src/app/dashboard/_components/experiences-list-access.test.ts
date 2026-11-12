// src/app/dashboard/_components/experiences-list-access.test.ts

/**
 * Home's experiences list: "All experiences" and "Create your first one" show only to a role
 * that can open those pages.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ExperiencesList } from './ExperiencesList';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const list = () => renderToStaticMarkup(createElement(ExperiencesList, { experiences: [], loading: false }));

describe('the home experiences list', () => {
  it('drops both links for a role that cannot open the experiences pages', () => {
    uiAccess.hold('analytics:view');
    const html = list();
    expect(html).toContain('No experiences yet.');
    expect(html).not.toContain('All experiences');
    expect(html).not.toContain('Create your first one.');
    expect(html).not.toContain('<a ');
  });

  it('links "All experiences" for a viewer, and "Create your first one" only for an editor', () => {
    uiAccess.hold('search-experiences:view');
    let html = list();
    expect(html).toContain('href="/experiences"');
    expect(html).not.toContain('href="/experiences/create"');
    uiAccess.hold('search-experiences:view', 'search-experiences:edit');
    html = list();
    expect(html).toContain('href="/experiences/create"');
  });
});
