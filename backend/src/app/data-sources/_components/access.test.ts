// src/app/data-sources/_components/access.test.ts

/**
 * Data sources: changes locked with the reason for a user who can only view them, and the
 * health check (which contacts the external service) never sent for a user who may not run it,
 * neither on page load nor by the refresh button.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { healthCheckDue } from '../_lib/hooks/useHealthCheck';

import { Step2_Config } from './CreateWizard/Step2_Config';

import { menuItems } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';
import { RowActionsMenu } from '@/shared/ui/custom/RowActionsMenu';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);

const noop = () => {};
const menu = () => renderToStaticMarkup(createElement(RowActionsMenu, {
  onView: noop, onEdit: noop, onDelete: noop, editAction: 'data-sources.edit', deleteAction: 'data-sources.delete',
  triggerClassName: '', itemClassName: '',
}));

describe('data source menu', () => {
  beforeEach(() => uiAccess.hold('data-sources:view'));

  it('locks Edit and Delete for a viewer, keeping View Details', () => {
    expect(menuItems(menu())).toEqual(['View Details', 'Edit (locked)', 'Delete (locked)']);
    expect(menu()).toContain('You don&#x27;t have permission to delete data sources.');
  });

  it('opens them with data-sources:edit', () => {
    uiAccess.hold('data-sources:view', 'data-sources:edit');
    expect(menuItems(menu())).toEqual(['View Details', 'Edit', 'Delete']);
  });
});

describe('healthCheckDue', () => {
  const base = { dataSourceId: 'ds', allowed: true, running: false, force: false, lastCheck: 0, now: 120_000 };

  it('runs for a user who may, once a minute unless forced', () => {
    expect(healthCheckDue(base)).toBe(true);
    expect(healthCheckDue({ ...base, lastCheck: 100_000 })).toBe(false);
    expect(healthCheckDue({ ...base, lastCheck: 100_000, force: true })).toBe(true);
  });

  it('never runs for a user who may not, not even forced by the refresh button', () => {
    expect(healthCheckDue({ ...base, allowed: false })).toBe(false);
    expect(healthCheckDue({ ...base, allowed: false, force: true })).toBe(false);
  });

  it("doesn't run without a data source or while one is running", () => {
    expect(healthCheckDue({ ...base, dataSourceId: undefined })).toBe(false);
    expect(healthCheckDue({ ...base, running: true, force: true })).toBe(false);
  });
});

describe("an external index's setup", () => {
  const step = () => renderToStaticMarkup(createElement(Step2_Config, { dataSourceType: 'search_index_external', value: {}, onChange: () => {}, errors: {} } as never));

  it('links the Secrets Vault for a role that can open it', () => {
    uiAccess.hold('data-sources:edit', 'secrets:manage');
    expect(step()).toContain('href="/secrets"');
  });

  it('names the Secrets Vault without the link for a role that can’t', () => {
    uiAccess.hold('data-sources:edit');
    const html = step();
    expect(html).not.toContain('href="/secrets"');
    expect(html).toContain('Secrets Vault');
  });
});
