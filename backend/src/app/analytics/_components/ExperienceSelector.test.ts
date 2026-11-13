// app/analytics/_components/ExperienceSelector.test.ts

/**
 * The selector's wiring to selectionChange. SSR does not run effects, so React's useEffect is
 * replaced here by "run it at once" (the effect body is the component's own code, unchanged),
 * and the query and analytics context are stubbed. Covered: a selected experience of a switched
 * off area is reset, one of an area that is on is kept, a known one is filled in. Not covered:
 * the effect's dependency list, or re-running on later changes.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExperienceSelector } from './ExperienceSelector';

import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

const memoDeps = vi.hoisted(() => ({ seen: [] as unknown[][] }));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useEffect: (fn: () => void) => void fn(),
    useMemo: <T>(fn: () => T, deps: unknown[]) => (memoDeps.seen.push(deps), react.useMemo(fn, deps)),
  };
});
vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const experiences = [
  { id: 'c1', name: 'Support chat', slug: 'support', type: 'ai', isActive: true },
  { id: 's1', name: 'Site search', slug: 'site', type: 'search', isActive: true },
];
const queryEnabled = vi.hoisted(() => ({ last: undefined as boolean | undefined }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ enabled }: { enabled?: boolean }) => (queryEnabled.last = enabled, { data: { experiences, complete: true, errors: [] }, isLoading: false }),
}));

const setExperience = vi.fn();
let selected: { experienceId?: string; experienceName?: string; experienceType?: string } = {};
vi.mock('../_lib/AnalyticsContext', () => ({
  useAnalyticsContext: () => ({ ...selected, setExperience, keepWhenMissing: false }),
}));

const render = () => renderToStaticMarkup(createElement(ExperienceSelector));

beforeEach(() => {
  setExperience.mockClear();
  memoDeps.seen = [];
  uiAccess.asAdmin();
});

describe('ExperienceSelector and selectionChange', () => {
  it('resets a selected chat experience when the Chat area is off', () => {
    uiAccess.areasOff('chat');
    selected = { experienceId: 'c1', experienceName: 'Support chat', experienceType: 'ai' };
    render();
    expect(setExperience).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('leaves the same selection alone with the Chat area on', () => {
    selected = { experienceId: 'c1', experienceName: 'Support chat', experienceType: 'ai' };
    render();
    expect(setExperience).not.toHaveBeenCalled();
  });

  it('fills in the name and type of a selection that only carries its ID', () => {
    selected = { experienceId: 's1' };
    render();
    expect(setExperience).toHaveBeenCalledExactlyOnceWith('s1', 'Site search', 'search');
  });
});

describe('ExperienceSelector request', () => {
  it('asks for the experience list with Analytics on', () => {
    render();
    expect(queryEnabled.last).toBe(true);
  });

  it('does not ask for it with Analytics off, where the server refuses it', () => {
    uiAccess.areasOff('analytics');
    render();
    expect(queryEnabled.last).toBe(false);
  });

  it('does not ask for it while access is loading', () => {
    uiAccessLoading();
    render();
    expect(queryEnabled.last).toBe(false);
  });
});

describe('ExperienceSelector memo', () => {
  it('never depends on a function, which is new every render and would defeat the memo', () => {
    render();
    expect(memoDeps.seen.length).toBeGreaterThan(0);
    for (const deps of memoDeps.seen) expect(deps.filter((d) => typeof d === 'function')).toEqual([]);
  });
});
