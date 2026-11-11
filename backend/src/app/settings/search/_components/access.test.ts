// src/app/settings/search/_components/access.test.ts

/**
 * Search Settings: for a role that can't change settings, Save Changes is locked with the
 * reason and every field is read-only (the form's fieldset is disabled); the values still show.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import SearchSettingsPage from '../page';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('../_lib/hooks/useGlobalSearchSettings', () => ({
  useGlobalSearchSettings: () => ({
    settings: { searchTimeout: 30000, rrfRankConstant: 60, rrfWindowSize: 100, lexicalWeight: 1, semanticWeight: 1 },
    isLoading: false, refetch: () => {},
  }),
  useUpdateGlobalSearchSettings: () => ({ mutateAsync: async () => {}, isPending: false }),
}));

const page = () => renderToStaticMarkup(createElement(SearchSettingsPage));
const fieldsetDisabled = (html: string) => /<fieldset[^>]*disabled=""/.test(html);

describe('Search Settings', () => {
  it('is read-only for a role that can only view settings, with Save locked and the reason', () => {
    uiAccess.hold('settings:view');
    const html = page();
    expect(controlState(html, { text: 'Save Changes' })).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to change search settings.');
    expect(fieldsetDisabled(html)).toBe(true);
    expect(html).toContain('>30.0s<'); // the timeout still shows
  });

  it('is editable for a settings manager (Save waits for a change, without the lock)', () => {
    uiAccess.hold('settings:view', 'settings:manage');
    const html = page();
    expect(controlState(html, { text: 'Save Changes' })).toBe('disabled');
    expect(fieldsetDisabled(html)).toBe(false);
  });
});
