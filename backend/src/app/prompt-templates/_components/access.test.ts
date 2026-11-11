// src/app/prompt-templates/_components/access.test.ts

/** Prompt templates: Edit prompt and "make this the system default" locked without prompts:edit */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VersionHistory } from './VersionHistory';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const version = (id: string, n: number, isSystemDefault = false) =>
  ({ id, version: n, label: null, isSystemDefault, createdAt: '2026-11-01T00:00:00Z' }) as never;
const history = () => renderToStaticMarkup(createElement(VersionHistory, {
  history: [version('v2', 2, true), version('v1', 1)], currentId: 'v2', onRollback: () => {}, isRollingBack: false,
}));
const makeDefault = (html: string) => {
  const m = /(<span[^>]*data-locked=""[^>]*>)?<button[^>]*aria-label="Make this the system default"[^>]*>/.exec(html);
  return !m ? 'missing' : m[1] ? 'locked' : m[0].includes('disabled=""') ? 'disabled' : 'open';
};

describe('version history', () => {
  beforeEach(() => uiAccess.hold('prompts:view'));

  it('locks "make this the system default" for a viewer, with the reason', () => {
    expect(makeDefault(history())).toBe('locked');
    expect(history()).toContain('You don&#x27;t have permission to change which prompt version is the default.');
  });

  it('opens it with prompts:edit', () => {
    uiAccess.hold('prompts:view', 'prompts:edit');
    expect(makeDefault(history())).toBe('open');
  });
});
