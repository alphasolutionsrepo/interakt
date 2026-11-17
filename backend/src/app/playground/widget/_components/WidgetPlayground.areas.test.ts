// src/app/playground/widget/_components/WidgetPlayground.areas.test.ts

/**
 * The widget playground with a kind switched off: its cached experience list is never offered
 * (the picker is locked), a preview of the off kind is not kept, and a pick made for one kind
 * does not carry over once the shown kind settles on the other.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WidgetPlayground } from './WidgetPlayground';

import { pickFor, previewIfOn } from '@/app/playground/_lib/area-gate';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
// Both lists are still cached from before an area was switched off
vi.mock('@/app/ai-experiences/_lib/hooks/useAIExperiences', () => ({
  useAIExperiences: () => ({ isLoading: false, experiences: [{ id: 'c1', name: 'Chat one', slug: 'chat-one' }] }),
}));
vi.mock('@/app/search-experiences/_lib/hooks', () => ({
  useSearchExperiences: () => ({ isLoading: false, experiences: [{ id: 's1', name: 'Search one', slug: 'search-one' }] }),
  useSearchExperience: () => ({ isLoading: false, experience: undefined }),
}));

const render = () => renderToStaticMarkup(createElement(WidgetPlayground));
/** The experience picker's trigger button */
const pickerDisabled = (html: string) => {
  const at = html.indexOf('Choose an experience');
  return /\sdisabled=""/.test(html.slice(html.lastIndexOf('<button', at), at));
};

describe('the widget playground with a kind off', () => {
  beforeEach(() => uiAccess.asAdmin());

  it('leaves the picker usable while its kind is on', () => {
    expect(pickerDisabled(render())).toBe(false);
  });

  it('locks the picker, rather than offering the cached list, when the shown kind is off', () => {
    uiAccess.areasOff('chat', 'search');
    expect(pickerDisabled(render())).toBe(true);
  });
});

describe('picks and previews follow the kind', () => {
  it('a pick counts only for the kind it was made for', () => {
    expect(pickFor({ kind: 'chat', value: 'c1' }, 'chat')).toBe('c1');
    expect(pickFor({ kind: 'chat', value: 'c1' }, 'search')).toBeUndefined();
    expect(pickFor(null, 'chat')).toBeUndefined();
  });

  it('a preview of a kind whose area is off is dropped, one of a kind that is on stays', () => {
    const chat = { kind: 'chat' as const, id: 'c1' };
    expect(previewIfOn(chat, (a) => a !== 'chat')).toBeNull();
    expect(previewIfOn(chat, () => true)).toBe(chat);
    expect(previewIfOn(null, () => true)).toBeNull();
  });
});
