// src/shared/access/AreaOffNote.test.ts

/** The turned-off note names the area, adds its detail, and links an Admin to Settings → Features */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AreaOffNote, areaOffText, areasOffText } from './AreaOffNote';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('./useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const note = () => renderToStaticMarkup(createElement(AreaOffNote, { area: 'chat', detail: 'Roles keep these permissions.' }));

describe('AreaOffNote', () => {
  it('names the area by its label', () => {
    expect(areaOffText('ai-summaries')).toBe('AI summaries is turned off for this installation.');
  });

  it('names several areas in one sentence, and falls back to the generic message with none', () => {
    expect(areasOffText(['chat'])).toBe('Chat is turned off for this installation.');
    expect(areasOffText(['managed-indexes', 'playground'])).toBe('Managed indexes and Playground are turned off for this installation.');
    expect(areasOffText(['playground', 'search', 'chat'])).toBe('Playground, Search and Chat are turned off for this installation.');
    expect(areasOffText([])).toBe('This feature is turned off for this installation.');
  });

  it('links an Admin to Settings → Features', () => {
    uiAccess.asAdmin();
    const html = note();
    expect(html).toContain('Chat is turned off for this installation.');
    expect(html).toContain('Roles keep these permissions.');
    expect(html).toContain('href="/settings/features"');
  });

  it('gives anyone else the note without the link', () => {
    uiAccess.hold('tools:view');
    const html = note();
    expect(html).toContain('Chat is turned off for this installation.');
    expect(html).not.toContain('/settings/features');
  });
});
