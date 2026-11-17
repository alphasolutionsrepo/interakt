// src/app/data-sources/_components/CreateToolsPanel.click.test.ts

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateToolsPanel } from './CreateToolsPanel';

import { toolsApi } from '@/app/tools/_lib/api-client';
import { reportActionError } from '@/shared/activity/report';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/app/tools/_lib/api-client', () => ({ toolsApi: { scaffoldTools: vi.fn() } }));

/**
 * The click path. There is no DOM here, so the Button is swapped for one that records its props;
 * a "click" calls the recorded onClick unless the button is disabled, as a browser would.
 */
const buttons: Array<{ onClick?: () => unknown; disabled?: boolean; text: string }> = [];
vi.mock('@/components/ui/button', () => ({
  Button: (p: { onClick?: () => unknown; disabled?: boolean; children?: unknown }) => {
    buttons.push({ onClick: p.onClick, disabled: p.disabled, text: JSON.stringify(p.children) });
    return null;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));
vi.mock('@/shared/activity/report', () => ({ reportActionError: vi.fn() }));

describe('Create Tools click', () => {
  const scaffold = vi.mocked(toolsApi.scaffoldTools);
  const onCreated = vi.fn();
  const renderWith = () => renderToStaticMarkup(createElement(CreateToolsPanel, { dataSourceId: 'ds1', isBuiltIn: false, onCreated }));

  beforeEach(() => { uiAccess.asAdmin(); vi.clearAllMocks(); });

  const clickPanel = async () => {
    buttons.length = 0;
    renderWith();
    const b = buttons.find((x) => x.text.includes('Create Tools'))!;
    if (!b.disabled) await b.onClick?.();
  };

  it('scaffolds the data source, hands the result over, and says how many tools were created', async () => {
    const result = { created: [{ id: 'a' }, { id: 'b' }], skipped: [] } as never;
    scaffold.mockResolvedValue(result);
    await clickPanel();
    expect(scaffold).toHaveBeenCalledWith('ds1');
    expect(onCreated).toHaveBeenCalledWith(result);
    expect(toast.success).toHaveBeenCalledWith('Created 2 tools');
  });

  it('says one tool in the singular', async () => {
    scaffold.mockResolvedValue({ created: [{ id: 'a' }], skipped: [] } as never);
    await clickPanel();
    expect(toast.success).toHaveBeenCalledWith('Created 1 tool');
  });

  it('says so when every tool already exists', async () => {
    scaffold.mockResolvedValue({ created: [], skipped: [] } as never);
    await clickPanel();
    expect(onCreated).toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('All tools already exist for this data source.');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports a failure and does not call onCreated', async () => {
    scaffold.mockRejectedValue(new Error('boom'));
    await clickPanel();
    expect(reportActionError).toHaveBeenCalledWith('Create tools', expect.any(Error));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('does nothing when locked (Chat off)', async () => {
    uiAccess.areasOff('chat');
    await clickPanel();
    expect(scaffold).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
