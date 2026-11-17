// src/app/ai-experiences/_components/enter-key-send.test.ts

/**
 * Enter in the chat box sends too, so it must obey the same gate as the Send button: with
 * Playground off (or the Help assistant off for the built-in help) Enter starts no chat.
 * No DOM here: the Textarea is swapped for one that records its onKeyDown, and the text box
 * starts with a message in it and the panel open.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatTestPanel } from './ChatTestPanel';

import { uiAccess } from '@/shared/test/ui-access-stub';
import { startExperienceChat } from '@/shared/ui/custom/start-experience-chat';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/shared/ui/custom/start-experience-chat', () => ({
  startExperienceChat: vi.fn(async () => (async function* () { /* no events */ })()),
}));
let calls = 0;
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  // The panel's states in order: messages, sessionId, input, isStreaming, errorMsg, isExpanded
  return {
    ...actual,
    useState: <T,>(initial: T) => {
      calls += 1;
      return actual.useState(calls === 3 ? ('hello' as T) : calls === 6 ? (true as T) : initial);
    },
  };
});
let onKeyDown: ((e: unknown) => void) | undefined;
vi.mock('@/components/ui/textarea', () => ({
  Textarea: (p: { onKeyDown?: (e: unknown) => void }) => { onKeyDown = p.onKeyDown; return null; },
}));

const press = async (key: string, shiftKey = false, isBuiltIn = false) => {
  onKeyDown = undefined;
  calls = 0;
  renderToStaticMarkup(createElement(ChatTestPanel, { experienceSlug: 's', experienceName: 'Chat', isBuiltIn }));
  onKeyDown!({ key, shiftKey, preventDefault: () => {} });
  await new Promise((r) => setTimeout(r, 0));
};

describe('Enter in the chat box', () => {
  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); vi.clearAllMocks(); uiAccess.asAdmin(); });

  it('starts the chat when Send is open', async () => {
    await press('Enter');
    expect(startExperienceChat).toHaveBeenCalledWith('s', 'hello', expect.any(String));
  });

  it('does not send on Shift+Enter', async () => {
    await press('Enter', true);
    expect(startExperienceChat).not.toHaveBeenCalled();
  });

  it('starts no chat with Playground off, even for an Admin', async () => {
    uiAccess.areasOff('playground');
    await press('Enter');
    expect(startExperienceChat).not.toHaveBeenCalled();
  });

  it('starts no chat for the built-in help with the Help assistant off', async () => {
    uiAccess.areasOff('help-assistant');
    await press('Enter', false, true);
    expect(startExperienceChat).not.toHaveBeenCalled();
  });

  it('starts no chat while the user lacks the permission to test chat', async () => {
    uiAccess.hold('ai-experiences:view');
    await press('Enter');
    expect(startExperienceChat).not.toHaveBeenCalled();
  });
});
