import { AppWindow } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { searchModalHintHtml } from '../_lib/search-modal-hint';

import { buildIframeDoc, LAUNCHER_OPTIONS, type AppliedSpec } from './WidgetPlayground';

const spec = (over: Partial<AppliedSpec>): AppliedSpec => ({
  key: 'k',
  kind: 'search',
  experienceId: 'e1',
  experienceName: 'Catalog',
  accessToken: 'token',
  launcher: 'modal',
  device: 'desktop',
  embed: {},
  ...over,
});

describe('widget playground preview', () => {
  it('a modal search shows the hint above the preview', () => {
    expect(buildIframeDoc(spec({}), 'http://admin.test')).toContain(searchModalHintHtml());
  });

  it.each([
    ['an inline search', spec({ launcher: 'inline' })],
    ['a chat widget', spec({ kind: 'chat', launcher: 'floating' })],
  ])('%s shows no hint', (_name, s) => {
    expect(buildIframeDoc(s, 'http://admin.test')).not.toContain('data-shortcut');
  });

  it('loads the widget after the hint, so the hint can ask it for the shortcut label', () => {
    const doc = buildIframeDoc(spec({}), 'http://admin.test');
    expect(doc.indexOf('data-shortcut')).toBeLessThan(doc.indexOf('src="http://admin.test/embed/v1/widgets.js"'));
  });

  it('the search launcher options read Modal (window icon) and Inline', () => {
    expect(LAUNCHER_OPTIONS.search.map((o) => o.label)).toEqual(['Modal', 'Inline']);
    expect(LAUNCHER_OPTIONS.search[0].icon).toBe(AppWindow);
  });
});
