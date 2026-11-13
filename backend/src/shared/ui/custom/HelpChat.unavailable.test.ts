// src/shared/ui/custom/HelpChat.unavailable.test.ts

/**
 * The help drawer's "Ask AI" when the assistant can't answer: switched off for the
 * installation (404 with the FEATURE_OFF code) is said so, with no link to Initial Setup;
 * any other 404 still means it isn't set up yet.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/access/Can', () => ({
  AccessLink: ({ href, children }: { href: string; children: React.ReactNode }) => createElement('a', { href }, children),
}));

import { TURNED_OFF_CODE } from '@/features/feature-switches/areas';
import { ApiError } from '@/shared/api/api-error';

import { AssistantNotReady, unavailableKind } from './HelpChat';


describe('the assistant is unavailable', () => {
  it('says it is turned off, with no setup link, when the installation turned it off', () => {
    const html = renderToStaticMarkup(createElement(AssistantNotReady, { turnedOff: true }));
    expect(html).toContain('The Help assistant is turned off for this installation.');
    expect(html).not.toContain('/setup');
    expect(html).not.toContain('set up yet');
  });

  it('still points to Initial Setup when it was never set up', () => {
    const html = renderToStaticMarkup(createElement(AssistantNotReady));
    expect(html).toContain('/setup');
    expect(html).not.toContain('turned off');
  });

  it('tells the two 404s apart by the error code', () => {
    expect(unavailableKind(new ApiError('off', 404, { code: TURNED_OFF_CODE }))).toBe('turned-off');
    expect(unavailableKind(new ApiError('missing', 404))).toBe('not-set-up');
    expect(unavailableKind(new ApiError('boom', 500))).toBeNull();
    expect(unavailableKind(new Error('network'))).toBeNull();
  });
});
