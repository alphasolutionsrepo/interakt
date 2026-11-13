// src/app/tools/_components/area-off.test.ts

/** The tool Test button with Playground off: still there, locked with the reason. */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ToolTestPanel } from './ToolTestPanel';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const panel = () => renderToStaticMarkup(createElement(ToolTestPanel, { toolId: 't', isActive: true, executorType: 'llm_inference', operation: null }));

describe('the tool test panel with Playground off', () => {
  it('keeps Run visible but locked, saying why, even for an Admin', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('playground');
    const html = panel();
    expect(controlState(html, { text: 'Run' })).toBe('locked');
    expect(html).toContain('Playground is turned off for this installation.');
  });

  it('is unchanged with Playground on', () => {
    uiAccess.hold('tools:view', 'playground:use');
    expect(panel()).not.toContain('turned off');
  });
});
