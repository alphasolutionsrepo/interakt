// src/app/data-sources/_components/schema-fields-access.test.ts

/**
 * The schema editor's Save writes through the data source's update route: locked with the reason
 * without data-sources:edit, and on the built-in data source for anyone but an Admin.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SchemaFieldsEditor } from './SchemaFieldsEditor';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const save = { text: 'Save' };
const editor = (builtIn: boolean) => renderToStaticMarkup(createElement(SchemaFieldsEditor, {
  schema: { fields: [{ name: 'title', type: 'text' }] }, onSave: async () => {}, isSaving: false, builtIn,
}));

describe('the data source schema editor', () => {
  it('locks Save with the reason for a role without data-sources:edit', () => {
    uiAccess.hold('data-sources:view');
    const html = editor(false);
    expect(controlState(html, save)).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to edit data sources.');
  });

  it('does not lock it for an editor (disabled until a description changes)', () => {
    uiAccess.hold('data-sources:view', 'data-sources:edit');
    expect(controlState(editor(false), save)).toBe('disabled');
  });

  it('locks it on the built-in data source for an editor who is not an Admin, not for an Admin', () => {
    uiAccess.hold('data-sources:view', 'data-sources:edit');
    expect(controlState(editor(true), save)).toBe('locked');
    uiAccess.asAdmin();
    expect(controlState(editor(true), save)).toBe('disabled');
  });
});
