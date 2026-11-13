// app/analytics/_lib/AskPanelContext.test.ts

/**
 * The provider's canAsk follows canAskAnalytics with the real useAccess values (permission and
 * the Analytics area), seen through a consumer rendered by SSR.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AskPanelProvider, useAskPanel } from './AskPanelContext';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/analytics/overview' }));
vi.mock('./hooks/useAnalyticsChat', () => ({ useAnalyticsChat: () => ({ send: async () => {} }) }));

function Probe() {
  return createElement('span', null, `canAsk=${useAskPanel().canAsk}`);
}
const canAsk = () => renderToStaticMarkup(createElement(AskPanelProvider, null, createElement(Probe)));

describe('AskPanelProvider canAsk', () => {
  it('is true with the permission and Analytics on', () => {
    uiAccess.hold('analytics:ask');
    expect(canAsk()).toContain('canAsk=true');
  });

  it('is false with Analytics off, even with the permission', () => {
    uiAccess.hold('analytics:ask');
    uiAccess.areasOff('analytics');
    expect(canAsk()).toContain('canAsk=false');
  });

  it('is false without the permission', () => {
    uiAccess.hold();
    expect(canAsk()).toContain('canAsk=false');
  });
});
