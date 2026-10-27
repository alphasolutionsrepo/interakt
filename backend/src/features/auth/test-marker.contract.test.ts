// src/features/auth/test-marker.contract.test.ts

/**
 * The Widget playground's test marker is named in the widget, which sends it, and on the server,
 * which reads it and lets it through CORS. If one side were renamed alone, playground chats would
 * count as visitor traffic again while each side's own tests still pass, so this checks they agree.
 */

import { describe, it, expect } from 'vitest';

import { handleCorsPreflight } from '@/features/search-experience/access-token.middleware';

import { TEST_MARKER_HEADER as WIDGET_SENDS } from '../../../widgets/src/shared/api-client';
import { TEST_MARKER_HEADER as SERVER_READS } from './token-or-session';

describe('Widget playground test marker', () => {
  it('is the header the widget sends, the server reads and CORS allows', () => {
    expect(WIDGET_SENDS.toLowerCase()).toBe(SERVER_READS);
    const allowed = handleCorsPreflight().headers.get('Access-Control-Allow-Headers')?.toLowerCase().split(/,\s*/);
    expect(allowed).toContain(SERVER_READS);
  });
});
