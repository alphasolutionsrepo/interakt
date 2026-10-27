// src/features/auth/test-marker.contract.test.ts

/**
 * The Widget playground's test marker is named in the widget, which sends it, and on the server,
 * which reads it and lets it through CORS. If one side were renamed alone, playground chats would
 * count as visitor traffic again while each side's own tests still pass, so this checks they agree.
 * The widget side is read from the built bundle, the only part of the widgets package the backend
 * may touch, and what visitors' pages load.
 */

import { readFileSync } from 'fs';
import path from 'path';

import { describe, it, expect } from 'vitest';

import { handleCorsPreflight } from '@/features/search-experience/access-token.middleware';

import { TEST_MARKER_HEADER as SERVER_READS } from './token-or-session';

const BUNDLE = path.resolve(__dirname, '../../../public/embed/v1/widgets.js');

describe('Widget playground test marker', () => {
  it('is the header the built widget sends, the server reads and CORS allows', () => {
    const sentHeaders = [...readFileSync(BUNDLE, 'utf8').matchAll(/"(X-Interakt-[A-Za-z-]+)":"1"/g)].map((m) => m[1].toLowerCase());
    expect(sentHeaders).toContain(SERVER_READS);

    const allowed = handleCorsPreflight().headers.get('Access-Control-Allow-Headers')?.toLowerCase().split(/,\s*/);
    expect(allowed).toContain(SERVER_READS);
  });
});
