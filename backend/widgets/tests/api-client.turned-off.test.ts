/**
 * An area switched off for the installation answers 404 with its own code. The widgets read it:
 * search says so in the server's words, chat shows the server's message, and the widget config
 * read carries the code so the chat widget can leave the page instead of showing a launcher
 * that fails when used. Any other failure keeps its plain message.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, fetchWidgetConfig, performSearch, streamChat, TURNED_OFF_CODE } from '../src/shared/api-client';

const turnedOff = () =>
  new Response(JSON.stringify({ success: false, code: 'FEATURE_OFF', error: 'This feature is turned off for this installation.' }), { status: 404 });

afterEach(() => vi.unstubAllGlobals());

describe('an area that is switched off', () => {
  it('is reported by search in the server\'s words, with its code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => turnedOff()));
    await expect(performSearch('https://interakt.test', 'token', { query: 'q' } as Parameters<typeof performSearch>[2]))
      .rejects.toMatchObject({ message: 'This feature is turned off for this installation.', status: 404, code: TURNED_OFF_CODE });
  });

  it('is reported by the widget config read with its code, and by chat with the server\'s message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => turnedOff()));
    const config = await fetchWidgetConfig('https://interakt.test', 'token').catch((e: unknown) => e);
    expect(config).toBeInstanceOf(ApiError);
    expect(config).toMatchObject({ code: TURNED_OFF_CODE });
    await expect((async () => { for await (const _ of streamChat({ apiBaseUrl: 'https://interakt.test', accessToken: 'token', message: 'hi' })) { /* drain */ } })())
      .rejects.toMatchObject({ message: 'This feature is turned off for this installation.', code: TURNED_OFF_CODE });
  });

  it('keeps the plain message for any other failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway error', { status: 502 })));
    await expect(performSearch('https://interakt.test', 'token', { query: 'q' } as Parameters<typeof performSearch>[2]))
      .rejects.toMatchObject({ message: 'Search failed (HTTP 502)', code: undefined });
  });
});
