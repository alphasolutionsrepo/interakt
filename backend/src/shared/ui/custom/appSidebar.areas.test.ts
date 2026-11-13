// src/shared/ui/custom/appSidebar.areas.test.ts

/**
 * The sidebar component itself, rendered: its entries follow the feature switches (areaOn from
 * useAccess), not only the pure visibleSidebarGroups. Tools and Prompt templates need the Chat area.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SidebarProvider } from '../components/sidebar';

import { AppSidebar } from './appSidebar';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: () => {} }) }));
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
