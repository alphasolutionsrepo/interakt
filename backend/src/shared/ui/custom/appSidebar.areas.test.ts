// src/shared/ui/custom/appSidebar.areas.test.ts

/**
 * The sidebar component itself, rendered: its entries follow the feature switches (areaOn from
 * useAccess), not only the pure visibleSidebarGroups. Tools and Prompt templates need the Chat area.
 */

import fs from 'fs';
import path from 'path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarProvider } from '../components/sidebar';

import { AppSidebar } from './appSidebar';

import { uiAccess } from '@/shared/test/ui-access-stub';

let pathname = '/dashboard';
vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: () => {} }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const sidebar = () => renderToStaticMarkup(createElement(SidebarProvider, null, createElement(AppSidebar)));

describe('the sidebar and the feature switches', () => {
  it('lists Tools and Prompt templates while the Chat area is on', () => {
    uiAccess.asAdmin();
    const html = sidebar();
    expect(html).toContain('href="/tools"');
    expect(html).toContain('href="/prompt-templates"');
  });

  it('leaves Tools and Prompt templates out with the Chat area off, and keeps the rest', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const html = sidebar();
    expect(html).not.toContain('href="/tools"');
    expect(html).not.toContain('href="/prompt-templates"');
    expect(html).toContain('href="/ai-providers"');
  });
});

describe('the Settings → Features sidebar entry', () => {
  // On a Settings page the Settings group is open, so its entries are in the markup
  beforeEach(() => { pathname = '/settings/search'; });
  afterEach(() => { pathname = '/dashboard'; });

  it('is listed, with its label, for a user who holds settings:view', () => {
    uiAccess.hold('settings:view');
    const html = sidebar();
    expect(html).toContain('href="/settings/features"');
    expect(html).toContain('sidebar.items.features');
  });

  it('is listed for an Admin', () => {
    uiAccess.asAdmin();
    expect(sidebar()).toContain('href="/settings/features"');
  });

  it('is left out for a user without settings:view', () => {
    uiAccess.hold('search-indexes:view');
    expect(sidebar()).not.toContain('href="/settings/features"');
  });

  it('has its label in every language the admin ships', () => {
    for (const lang of ['en', 'da']) {
      const file = path.resolve(__dirname, `../../data/locales/${lang}/translation.json`);
      const t = JSON.parse(fs.readFileSync(file, 'utf8')) as { sidebar: { items: Record<string, string> } };
      expect(t.sidebar.items.features, lang).toBeTruthy();
    }
  });
});
