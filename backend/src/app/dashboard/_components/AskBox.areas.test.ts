// src/app/dashboard/_components/AskBox.areas.test.ts

/**
 * The home page's Ask box inside the real Ask panel provider (areas-off.test.ts stubs the
 * provider): it is there only for a user who may ask and with Analytics on. With Analytics off
 * it is gone whatever the user holds, and so is every other way in (the provider's canAsk).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AskBox } from './AskBox';

import { AskPanelProvider } from '@/app/analytics/_lib/AskPanelContext';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/app/analytics/_lib/hooks/useAnalyticsChat', () => ({ useAnalyticsChat: () => ({ send: async () => {} }) }));
vi.mock('@/app/analytics/_components/shell/ChatHistoryButton', () => ({ ChatHistoryButton: () => null }));

const box = () => renderToStaticMarkup(createElement(AskPanelProvider, null, createElement(AskBox)));

describe('the home Ask box with the real provider', () => {
  it('shows for a user who may ask, with Analytics on', () => {
    uiAccess.hold('analytics:ask');
    const html = box();
    expect(html).toContain('Ask about your analytics');
    expect(html).toContain('aria-label="Ask"');
  });

  it('is gone with Analytics off, even for an Admin', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('analytics');
    expect(box()).toBe('');
  });

  it('is gone for a user who may not ask', () => {
    uiAccess.hold('analytics:view');
    expect(box()).toBe('');
  });
});
