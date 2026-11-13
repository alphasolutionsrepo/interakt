/**
 * When the experience's area is switched off, the widget config read answers 404 with the
 * FEATURE_OFF code and the chat widget removes itself from the host page. Any other failure
 * keeps the widget, running on its default config.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatDropinUI } from '../src/chat/ChatWidget';

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

const mountWidget = async (answer: Response) => {
  vi.stubGlobal('fetch', vi.fn(async () => answer));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ChatDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test' } as Parameters<typeof ChatDropinUI.init>[0]);
  // Rendered before the config answer arrives
  const host = document.querySelector('[data-interakt-widget]');
  expect(host?.shadowRoot?.querySelector('.ik-launcher')).not.toBeNull();
  await flush();
};

beforeEach(() => {
  document.body.innerHTML = '<div id="ik"></div>';
});

afterEach(() => {
  ChatDropinUI.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chat widget when its area is switched off', () => {
  it('removes itself from the host page on FEATURE_OFF', async () => {
    await mountWidget(json({ success: false, code: 'FEATURE_OFF', error: 'This feature is turned off for this installation.' }, 404));
    expect(document.querySelector('[data-interakt-widget]')).toBeNull();
    expect(document.getElementById('ik')?.children.length).toBe(0);
  });

  it('stays on a 404 without the code', async () => {
    await mountWidget(json({ success: false, error: 'Not found' }, 404));
    const host = document.querySelector('[data-interakt-widget]');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('.ik-launcher')).not.toBeNull();
  });

  it('stays on a 500', async () => {
    await mountWidget(new Response('boom', { status: 500 }));
    const host = document.querySelector('[data-interakt-widget]');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('.ik-launcher')).not.toBeNull();
  });
});
